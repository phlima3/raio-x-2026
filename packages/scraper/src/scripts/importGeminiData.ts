/**
 * importGeminiData.ts
 *
 * Reads JSON files from gemini-research/outputs/ and upserts into the DB:
 *   - Candidate: bio, bioSummary (recentContext), photoUrl, siteUrl
 *   - Proposal:  one record per keyPosition theme (upserted by externalId)
 *
 * Usage:
 *   pnpm run import:gemini
 *   pnpm run import:gemini -- --dry-run   (preview only, no DB writes)
 */

import 'dotenv/config'
import * as fs from 'fs'
import * as path from 'path'
import { PrismaClient, ProposalOrigin, ProposalStatus } from '@prisma/client'
import { z } from 'zod'

const prisma = new PrismaClient()
const DRY_RUN = process.argv.includes('--dry-run')

// ── Schema validation ─────────────────────────────────────────────────────────

const KeyPositionsSchema = z.object({
  economy: z.string().nullable().optional(),
  security: z.string().nullable().optional(),
  environment: z.string().nullable().optional(),
  education: z.string().nullable().optional(),
  health: z.string().nullable().optional(),
  other: z.string().nullable().optional(),
})

const GeminiOutputSchema = z.object({
  slug: z.string(),
  bio: z.string().nullable().optional(),
  approvalRate: z.number().nullable().optional(),
  photoUrl: z.string().nullable().optional(),
  officialPhotoPageUrl: z.string().nullable().optional(),
  officialSiteUrl: z.string().nullable().optional(),
  wikipediaUrl: z.string().nullable().optional(),
  partyHistory: z.array(z.string()).nullable().optional(),
  politicalCareer: z.array(z.any()).nullable().optional(),
  keyPositions: KeyPositionsSchema.nullable().optional(),
  recentContext: z.string().nullable().optional(),
})

type GeminiOutput = z.infer<typeof GeminiOutputSchema>

// ── Category labels ───────────────────────────────────────────────────────────

const CATEGORY_MAP: Record<string, string> = {
  economy: 'Economia',
  security: 'Segurança',
  environment: 'Meio Ambiente',
  education: 'Educação',
  health: 'Saúde',
  other: 'Outros',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(msg: string): void {
  process.stdout.write(msg + '\n')
}

function warn(msg: string): void {
  process.stdout.write(`[WARN] ${msg}\n`)
}

function readOutputFiles(dir: string): { file: string; data: unknown }[] {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const raw = fs.readFileSync(path.join(dir, f), 'utf-8').trim()
      try {
        const data = JSON.parse(raw)
        // Skip empty placeholder files
        if (!data || Object.keys(data).length === 0) return null
        return { file: f, data }
      } catch {
        warn(`Failed to parse ${f} — skipping`)
        return null
      }
    })
    .filter(Boolean) as { file: string; data: unknown }[]
}

async function importCandidate(output: GeminiOutput): Promise<void> {
  const { slug } = output

  // Find all candidates with this slug (there may be 2 when the same person
  // runs for both presidente and governador — they share slug but different id).
  // Use raw query to avoid stale Prisma client type issues with the slug column.
  const candidates = await prisma.$queryRaw<
    { id: string; name: string; party: string; state: string; position: string }[]
  >`SELECT id, name, party, state, position FROM "Candidate" WHERE slug = ${slug}`

  if (candidates.length === 0) {
    warn(`No candidate found with slug "${slug}" — skipping`)
    return
  }

  for (const candidate of candidates) {
    log(`  Updating ${candidate.name} (${candidate.position}) — ${slug}`)

    if (!DRY_RUN) {
      await prisma.candidate.update({
        where: { id: candidate.id },
        data: {
          ...(output.bio ? { bio: output.bio } : {}),
          ...(output.recentContext ? { bioSummary: output.recentContext } : {}),
          ...(output.photoUrl ? { photoUrl: output.photoUrl } : {}),
          ...(output.officialSiteUrl ? { siteUrl: output.officialSiteUrl } : {}),
          ...(output.approvalRate != null ? { approvalRate: output.approvalRate } : {}),
        },
      })
    }

    // Upsert proposals for each keyPosition theme
    if (output.keyPositions) {
      for (const [theme, description] of Object.entries(output.keyPositions)) {
        if (!description) continue

        const category = CATEGORY_MAP[theme] ?? theme
        const externalId = `gemini_${slug}_${theme}`
        const title = `Posição sobre ${category}`

        log(`    → Proposal [${category}]`)

        if (!DRY_RUN) {
          const existing = await prisma.proposal.findUnique({
            where: { externalId },
            select: { id: true },
          })

          if (existing) {
            await prisma.proposal.update({
              where: { externalId },
              data: {
                title,
                description,
                category,
                tags: [category, 'programa'],
                status: ProposalStatus.DRAFT,
                isPublished: false,
                origin: ProposalOrigin.AI_EXTRACTION,
              },
            })
          } else {
            await prisma.proposal.create({
              data: {
                externalId,
                source: 'gemini_research',
                title,
                description,
                category,
                tags: [category, 'programa'],
                status: ProposalStatus.DRAFT,
                isPublished: false,
                origin: ProposalOrigin.AI_EXTRACTION,
                candidateId: candidate.id,
              },
            })
          }
        }
      }
    }
  }
}

// ── Pre-flight migrations ─────────────────────────────────────────────────────

async function runPreflightFixes(): Promise<void> {
  // Idempotent: fix Renan Santos MBL → Missão (one-time migration)
  const n = await prisma.$executeRaw`
    UPDATE "Candidate"
    SET party = 'Missão', slug = 'renan-santos-missao-sp'
    WHERE name = 'Renan Santos' AND state = 'SP' AND position = 'PRESIDENTE' AND party = 'MBL'
  `
  if (n > 0) log(`[preflight] Renan Santos: updated party MBL → Missão`)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const outputsDir = path.join(__dirname, '..', 'data', 'gemini-research', 'outputs')

  if (!fs.existsSync(outputsDir)) {
    throw new Error(`Outputs directory not found: ${outputsDir}`)
  }

  if (!DRY_RUN) await runPreflightFixes()

  const files = readOutputFiles(outputsDir)
  log(`Found ${files.length} output file(s) to import${DRY_RUN ? ' [DRY RUN]' : ''}`)

  let imported = 0
  let skipped = 0

  for (const { file, data } of files) {
    log(`\nProcessing ${file}…`)

    const result = GeminiOutputSchema.safeParse(data)
    if (!result.success) {
      warn(`Invalid schema in ${file}:\n${result.error.message}`)
      skipped++
      continue
    }

    const output = result.data

    // Skip files without a slug (shouldn't happen but guard anyway)
    if (!output.slug) {
      warn(`Missing slug in ${file} — skipping`)
      skipped++
      continue
    }

    try {
      await importCandidate(output)
      imported++
    } catch (err) {
      warn(`Error importing ${file}: ${err instanceof Error ? err.message : String(err)}`)
      skipped++
    }
  }

  log(`\n── Summary ──────────────────────────────────────────`)
  log(`  Imported: ${imported}`)
  log(`  Skipped:  ${skipped}`)
  if (DRY_RUN) log(`  (Dry run — no changes written to DB)`)
}

main()
  .catch((err) => {
    process.stderr.write(`[FATAL] ${err instanceof Error ? err.message : String(err)}\n`)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
