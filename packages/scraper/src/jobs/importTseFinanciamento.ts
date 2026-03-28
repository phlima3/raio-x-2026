/**
 * importTseFinanciamento.ts
 *
 * Downloads TSE campaign financing CSVs for 2018 and 2022 and upserts
 * CampaignFinancing records for seed candidates.
 *
 * Strategy:
 *  1. Download consulta_cand_YYYY.zip → stream BRASIL.csv → build
 *     SQ_CANDIDATO → candidateId[] map by fuzzy-matching NM_CANDIDATO
 *     against DB candidates.
 *  2. Download prestacao_de_contas_eleitorais_candidatos_YYYY.zip →
 *     stream receitas CSV → sum VR_RECEITA per SQ_CANDIDATO + track donors.
 *  3. Stream despesas CSV → sum VR_DESPESA_CONTRATADA per SQ_CANDIDATO.
 *  4. Consolidate per candidateId and upsert CampaignFinancing.
 *
 * Run locally:  pnpm run import:financiamento
 * Run in CI:    GitHub Actions job "import-tse-financiamento"
 */

import 'dotenv/config'
import { Prisma, PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as https from 'https'
import * as http from 'http'
import * as path from 'path'
import * as os from 'os'
import * as readline from 'readline'
import { spawn } from 'child_process'

// ── Prisma ────────────────────────────────────────────────────────────────────

const prisma = new PrismaClient()

// ── Constants ─────────────────────────────────────────────────────────────────

const YEARS = [2018, 2022] as const
const TOP_DONORS_LIMIT = 10

function candZipUrl(year: number): string {
  return `https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_${year}.zip`
}

function financiamentoZipUrl(year: number): string {
  return `https://cdn.tse.jus.br/estatistica/sead/odsele/prestacao_contas/prestacao_de_contas_eleitorais_candidatos_${year}.zip`
}

function tseSourceUrl(year: number): string {
  return `https://dadosabertos.tse.jus.br/dataset/prestacao-de-contas-eleitorais-${year}`
}

// ── Name normalisation ────────────────────────────────────────────────────────
// Mirrors the logic in importTseHistorico.ts — intentionally copied to avoid
// cross-module coupling.

function normalize(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function nameMatches(csvName: string, seedName: string): boolean {
  const normCsv = normalize(csvName)
  const normSeed = normalize(seedName)
  const words = normSeed.split(' ').filter((w) => w.length >= 3)
  return words.length >= 2 && words.every((w) => normCsv.includes(w))
}

// ── CSV value parsing ─────────────────────────────────────────────────────────

function parseCsvLine(line: string): string[] {
  const values: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ';' && !inQuotes) {
      values.push(current)
      current = ''
    } else if (ch === '\r') {
      // skip CR from CRLF line endings
    } else {
      current += ch
    }
  }
  values.push(current)
  return values
}

function parseBrDecimal(raw: string): number {
  const clean = raw.trim().replace(/\./g, '').replace(',', '.')
  const n = parseFloat(clean)
  return Number.isFinite(n) ? n : 0
}

// ── File download ─────────────────────────────────────────────────────────────

function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath)
    const proto = url.startsWith('https') ? https : http

    proto
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          file.destroy()
          reject(new Error(`HTTP ${res.statusCode ?? 'unknown'} for ${url}`))
          return
        }
        res.pipe(file)
        file.on('finish', () => file.close(() => resolve()))
        file.on('error', reject)
      })
      .on('error', (err) => {
        file.destroy()
        reject(err)
      })
  })
}

// ── ZIP entry listing ─────────────────────────────────────────────────────────

function listZipEntries(zipPath: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const child = spawn('unzip', ['-l', zipPath])
    let output = ''
    child.stdout.on('data', (data) => {
      output += data.toString()
    })
    child.stderr.on('data', () => {})
    child.on('close', () => {
      const entries = output
        .split('\n')
        .map((line) => line.trim().split(/\s+/).pop() ?? '')
        .filter((name) => name.endsWith('.csv'))
      resolve(entries)
    })
    child.on('error', reject)
  })
}

/**
 * Find a CSV entry inside a ZIP whose name matches the given pattern.
 * Falls back to partial match if exact match is not found.
 */
async function findZipEntry(zipPath: string, pattern: RegExp): Promise<string | null> {
  const entries = await listZipEntries(zipPath)
  return entries.find((e) => pattern.test(e)) ?? null
}

// ── CSV streaming via unzip -p ────────────────────────────────────────────────

function streamZipCsv(
  zipPath: string,
  entryName: string,
  onRow: (row: Record<string, string>) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('unzip', ['-p', zipPath, entryName])
    child.stderr.on('data', () => {})

    child.stdout.setEncoding('latin1')

    const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity })

    let headers: string[] = []
    let lineCount = 0

    rl.on('line', (line) => {
      lineCount++
      if (lineCount === 1) {
        headers = parseCsvLine(line)
        return
      }
      if (!line.trim()) return
      const cols = parseCsvLine(line)
      const row: Record<string, string> = {}
      headers.forEach((h, i) => {
        row[h] = cols[i] ?? ''
      })
      onRow(row)
    })

    rl.on('close', resolve)
    rl.on('error', reject)
    child.on('error', reject)
  })
}

// ── Donor tracking ────────────────────────────────────────────────────────────

interface DonorEntry {
  name: string
  value: number
}

function mergeInto(
  target: Map<string, number>,
  key: string,
  value: number,
): void {
  target.set(key, (target.get(key) ?? 0) + value)
}

function topDonors(
  donorMap: Map<string, number>,
  limit: number,
): DonorEntry[] {
  return Array.from(donorMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function importYear(
  year: (typeof YEARS)[number],
  dbCandidates: { id: string; name: string }[],
): Promise<void> {
  const tmpDir = os.tmpdir()
  const candZipPath = path.join(tmpDir, `consulta_cand_${year}.zip`)
  const finZipPath = path.join(tmpDir, `prestacao_contas_${year}.zip`)

  // ── Step 1: download ZIPs ───────────────────────────────────────────────────
  console.info(`[${year}] Downloading candidates CSV…`)
  await downloadFile(candZipUrl(year), candZipPath)
  console.info(`[${year}] Downloading financing CSV…`)
  await downloadFile(financiamentoZipUrl(year), finZipPath)

  // ── Step 2: stream candidates CSV to build SQ → candidateId[] map ──────────
  const sqToCandidateIds = new Map<string, string[]>()
  let totalCandRows = 0

  console.info(`[${year}] Streaming consulta_cand CSV…`)
  await streamZipCsv(
    candZipPath,
    `consulta_cand_${year}_BRASIL.csv`,
    (row) => {
      totalCandRows++
      const sq = row['SQ_CANDIDATO']
      const csvName = row['NM_CANDIDATO'] ?? ''
      if (!sq || !csvName) return

      for (const cand of dbCandidates) {
        if (nameMatches(csvName, cand.name)) {
          const existing = sqToCandidateIds.get(sq) ?? []
          if (!existing.includes(cand.id)) {
            sqToCandidateIds.set(sq, [...existing, cand.id])
          }
        }
      }
    },
  )

  const matchedSQs = sqToCandidateIds.size
  console.info(
    `[${year}] Candidates CSV: ${totalCandRows} rows scanned, ${matchedSQs} SQ_CANDIDATOs matched`,
  )

  if (matchedSQs === 0) {
    console.warn(`[${year}] No candidates matched — skipping financing step`)
    return
  }

  // ── Step 3: find receitas + despesas CSV entries inside the ZIP ─────────────
  const receitasEntry = await findZipEntry(finZipPath, /receitas_candidatos_\d{4}_BRASIL\.csv$/i)
  const despesasEntry = await findZipEntry(finZipPath, /despesas_contratadas_candidatos_\d{4}_BRASIL\.csv$/i)

  if (!receitasEntry) {
    console.warn(`[${year}] Could not find receitas CSV inside ZIP — skipping`)
    return
  }

  console.info(`[${year}] Receitas entry: ${receitasEntry}`)
  if (despesasEntry) {
    console.info(`[${year}] Despesas entry: ${despesasEntry}`)
  } else {
    console.warn(`[${year}] Could not find despesas CSV — will only import receitas`)
  }

  // ── Step 4: stream receitas CSV — sum VR_RECEITA + track donors ────────────
  const sqToReceived = new Map<string, number>()
  const sqToDonors = new Map<string, Map<string, number>>()
  let totalReceitasRows = 0

  console.info(`[${year}] Streaming receitas CSV…`)
  await streamZipCsv(finZipPath, receitasEntry, (row) => {
    totalReceitasRows++
    const sq = row['SQ_CANDIDATO']
    if (!sq || !sqToCandidateIds.has(sq)) return

    const value = parseBrDecimal(row['VR_RECEITA'] ?? '0')
    if (value <= 0) return

    mergeInto(sqToReceived, sq, value)

    // Track donor
    const donorName = (row['NM_DOADOR'] ?? row['NM_DOADOR_RFB'] ?? '').trim()
    if (donorName) {
      const normalizedDonor = donorName.toUpperCase()
      const donorMap = sqToDonors.get(sq) ?? new Map<string, number>()
      mergeInto(donorMap, normalizedDonor, value)
      sqToDonors.set(sq, donorMap)
    }
  })

  console.info(
    `[${year}] Receitas CSV: ${totalReceitasRows} rows scanned, ${sqToReceived.size} SQs with receitas`,
  )

  // ── Step 5: stream despesas CSV — sum VR_DESPESA_CONTRATADA ────────────────
  const sqToSpent = new Map<string, number>()
  let totalDespesasRows = 0

  if (despesasEntry) {
    console.info(`[${year}] Streaming despesas CSV…`)
    await streamZipCsv(finZipPath, despesasEntry, (row) => {
      totalDespesasRows++
      const sq = row['SQ_CANDIDATO']
      if (!sq || !sqToCandidateIds.has(sq)) return

      const value = parseBrDecimal(row['VR_DESPESA_CONTRATADA'] ?? '0')
      if (value <= 0) return

      mergeInto(sqToSpent, sq, value)
    })

    console.info(
      `[${year}] Despesas CSV: ${totalDespesasRows} rows scanned, ${sqToSpent.size} SQs with despesas`,
    )
  }

  // ── Step 6: consolidate per candidateId ────────────────────────────────────
  const candidateReceived = new Map<string, number>()
  const candidateSpent = new Map<string, number>()
  const candidateDonors = new Map<string, Map<string, number>>()

  for (const [sq, candidateIds] of Array.from(sqToCandidateIds.entries())) {
    const received = sqToReceived.get(sq) ?? 0
    const spent = sqToSpent.get(sq) ?? 0
    const donors = sqToDonors.get(sq)

    for (const candidateId of candidateIds) {
      if (received > 0) {
        mergeInto(candidateReceived, candidateId, received)
      }
      if (spent > 0) {
        mergeInto(candidateSpent, candidateId, spent)
      }
      if (donors) {
        const existing = candidateDonors.get(candidateId) ?? new Map<string, number>()
        for (const [donor, amount] of Array.from(donors.entries())) {
          mergeInto(existing, donor, amount)
        }
        candidateDonors.set(candidateId, existing)
      }
    }
  }

  // ── Step 7: upsert CampaignFinancing ───────────────────────────────────────
  const allCandidateIds = Array.from(new Set([
    ...Array.from(candidateReceived.keys()),
    ...Array.from(candidateSpent.keys()),
  ]))

  const sourceUrl = tseSourceUrl(year)
  let upserted = 0

  for (const candidateId of allCandidateIds) {
    const totalReceived = candidateReceived.get(candidateId) ?? 0
    const totalSpent = candidateSpent.get(candidateId) ?? 0
    const donorMap = candidateDonors.get(candidateId)
    const donors = donorMap
      ? (topDonors(donorMap, TOP_DONORS_LIMIT) as unknown as Prisma.InputJsonValue)
      : Prisma.JsonNull

    await prisma.campaignFinancing.upsert({
      where: { candidateId_year: { candidateId, year } },
      update: { totalReceived, totalSpent, donors, sourceUrl },
      create: {
        candidateId,
        year,
        totalReceived,
        totalSpent,
        currency: 'BRL',
        donors,
        sourceUrl,
      },
    })
    upserted++
  }

  console.info(`[${year}] Upserted ${upserted} CampaignFinancing records`)

  // Log which DB candidates got no data
  const coveredIds = new Set(allCandidateIds)
  const missed = dbCandidates.filter((c) => !coveredIds.has(c.id))
  if (missed.length > 0) {
    console.warn(`[${year}] No match in TSE data for: ${missed.map((c) => c.name).join(', ')}`)
  }

  // Cleanup temp files
  try {
    fs.unlinkSync(finZipPath)
  } catch {
    // ignore cleanup errors
  }
}

async function run(): Promise<void> {
  console.info('[importTseFinanciamento] Starting…')

  const dbCandidates = await prisma.candidate.findMany({
    select: { id: true, name: true },
  })
  console.info(`[importTseFinanciamento] ${dbCandidates.length} candidates in DB`)

  for (const year of YEARS) {
    try {
      await importYear(year, dbCandidates)
    } catch (err) {
      console.error(`[importTseFinanciamento] Error importing ${year}:`, err)
    }
  }

  console.info('[importTseFinanciamento] Done.')
}

run()
  .catch((err) => {
    console.error('[importTseFinanciamento] Fatal error:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
