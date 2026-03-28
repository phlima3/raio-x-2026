/**
 * importTseHistorico.ts
 *
 * Downloads TSE asset declaration CSVs for 2018 and 2022 and upserts
 * AssetDeclaration records for seed candidates.
 *
 * Strategy:
 *  1. Download consulta_cand_YYYY.zip → stream BRASIL.csv → build
 *     SQ_CANDIDATO → candidateId[] map by fuzzy-matching NM_CANDIDATO
 *     against DB candidates.
 *  2. Download bem_candidato_YYYY.zip → stream BRASIL.csv → sum
 *     VR_BEM_CANDIDATO per SQ_CANDIDATO for matched SQs only.
 *  3. Upsert AssetDeclaration for each (candidateId, year) pair.
 *
 * Run locally:  pnpm run import:tse
 * Run in CI:    GitHub Actions job "import-tse-historico"
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
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

function candZipUrl(year: number): string {
  return `https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_${year}.zip`
}

function bensZipUrl(year: number): string {
  return `https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_${year}.zip`
}

function tseSourceUrl(year: number): string {
  return `https://dadosabertos.tse.jus.br/dataset/candidatos-${year}`
}

// ── Name normalisation ────────────────────────────────────────────────────────
// Mirrors the logic in populateRealData.ts — intentionally copied to avoid
// cross-package imports between scraper and api.

function normalize(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Returns true if every significant word (≥3 chars) of seedName
 * is present in csvName after normalisation.
 */
function nameMatches(csvName: string, seedName: string): boolean {
  const normCsv = normalize(csvName)
  const normSeed = normalize(seedName)
  const words = normSeed.split(' ').filter((w) => w.length >= 3)
  return words.length >= 2 && words.every((w) => normCsv.includes(w))
}

// ── CSV value parsing ─────────────────────────────────────────────────────────

/**
 * Parses a raw TSE CSV line (latin1, semicolon-separated).
 * Handles both quoted strings and bare integers — TSE files mix both:
 *   `"TEXT";"TEXT";2022;2;"TEXT";1;546;...`
 */
function parseCsvLine(line: string): string[] {
  const values: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // escaped double-quote inside quoted value
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

/**
 * Converts a Brazilian decimal string like "1.234.567,89" → 1234567.89
 */
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

// ── CSV streaming via unzip -p ────────────────────────────────────────────────

/**
 * Streams rows of a specific CSV entry from a ZIP file.
 * Uses `unzip -p` as a subprocess to avoid loading the whole ZIP in memory.
 * Encoding: latin1 (ISO-8859-1) — TSE files use this encoding.
 *
 * Calls onRow with a header-keyed record for each data row.
 */
function streamZipCsv(
  zipPath: string,
  entryName: string,
  onRow: (row: Record<string, string>) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('unzip', ['-p', zipPath, entryName])
    child.stderr.on('data', () => {
      // suppress unzip warnings (e.g. leading garbage in zip)
    })

    // Read as latin1 so accented characters map correctly to Unicode
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

// ── Main ──────────────────────────────────────────────────────────────────────

async function importYear(
  year: (typeof YEARS)[number],
  dbCandidates: { id: string; name: string }[],
): Promise<void> {
  const tmpDir = os.tmpdir()
  const candZipPath = path.join(tmpDir, `consulta_cand_${year}.zip`)
  const bensZipPath = path.join(tmpDir, `bem_candidato_${year}.zip`)

  // ── Step 1: download ZIPs ───────────────────────────────────────────────────
  console.info(`[${year}] Downloading candidates CSV…`)
  await downloadFile(candZipUrl(year), candZipPath)
  console.info(`[${year}] Downloading assets CSV…`)
  await downloadFile(bensZipUrl(year), bensZipPath)

  // ── Step 2: stream candidates CSV to build SQ → candidateId[] map ──────────
  // SQ_CANDIDATO is unique per candidacy (one person can have 2 SQs across 2
  // rounds, or run for different offices). We keep all matching SQs.
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
    console.warn(`[${year}] No candidates matched — skipping assets step`)
    return
  }

  // ── Step 3: stream assets CSV and sum totals per SQ ────────────────────────
  const sqToTotal = new Map<string, number>()
  let totalBensRows = 0

  console.info(`[${year}] Streaming bem_candidato CSV…`)
  await streamZipCsv(
    bensZipPath,
    `bem_candidato_${year}_BRASIL.csv`,
    (row) => {
      totalBensRows++
      const sq = row['SQ_CANDIDATO']
      if (!sq || !sqToCandidateIds.has(sq)) return
      const val = parseBrDecimal(row['VR_BEM_CANDIDATO'] ?? '0')
      sqToTotal.set(sq, (sqToTotal.get(sq) ?? 0) + val)
    },
  )

  console.info(
    `[${year}] Assets CSV: ${totalBensRows} rows scanned, ${sqToTotal.size} SQs with totals`,
  )

  // ── Step 4: upsert AssetDeclaration ────────────────────────────────────────
  // Consolidate: one candidateId may have multiple SQs (different rounds /
  // offices). Sum all matching SQs for the same candidateId.
  const candidateTotal = new Map<string, number>()
  for (const [sq, candidateIds] of sqToCandidateIds.entries()) {
    const total = sqToTotal.get(sq) ?? 0
    if (total === 0) continue
    for (const candidateId of candidateIds) {
      candidateTotal.set(candidateId, (candidateTotal.get(candidateId) ?? 0) + total)
    }
  }

  const sourceUrl = tseSourceUrl(year)
  let upserted = 0

  for (const [candidateId, totalValue] of candidateTotal.entries()) {
    await prisma.assetDeclaration.upsert({
      where: { candidateId_year: { candidateId, year } },
      update: { totalValue, sourceUrl },
      create: { candidateId, year, totalValue, currency: 'BRL', sourceUrl },
    })
    upserted++
  }

  console.info(`[${year}] Upserted ${upserted} AssetDeclaration records`)

  // Log which DB candidates got no data (so we can investigate)
  const coveredIds = new Set(candidateTotal.keys())
  const missed = dbCandidates.filter((c) => !coveredIds.has(c.id))
  if (missed.length > 0) {
    console.warn(`[${year}] No match in TSE data for: ${missed.map((c) => c.name).join(', ')}`)
  }
}

async function run(): Promise<void> {
  console.info('[importTseHistorico] Starting…')

  const dbCandidates = await prisma.candidate.findMany({
    select: { id: true, name: true },
  })
  console.info(`[importTseHistorico] ${dbCandidates.length} candidates in DB`)

  for (const year of YEARS) {
    await importYear(year, dbCandidates)
  }

  console.info('[importTseHistorico] Done.')
}

run()
  .catch((err) => {
    console.error('[importTseHistorico] Fatal error:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
