import { createScraperPrismaClient } from '../utils/prisma'
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
import { ProposalOrigin, ProposalStatus } from '@prisma/client'
import { z } from 'zod'
import {
  hasCandidateMaterialChange,
  type CandidateMaterialPatch,
  type CandidateMaterialSnapshot,
} from '../domain/candidateMaterialChange'
import { invalidateApiCandidateCaches } from '../utils/invalidateApiCache'
import { revalidateCandidatePages } from '../utils/revalidateWeb'

const prisma = createScraperPrismaClient()
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

function optionalHttpsUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  try {
    return new URL(value).protocol === 'https:' ? value : undefined
  } catch {
    return undefined
  }
}

async function importCandidate(output: GeminiOutput): Promise<void> {
  const { slug } = output

  // Find all candidates with this slug (there may be 2 when the same person
  // runs for both presidente and governador — they share slug but different id).
  // Use raw query to avoid stale Prisma client type issues with the slug column.
  const candidates = await prisma.$queryRaw<
    Array<{
      id: string
      name: string
      party: string
      state: string
      position: string
      bio: string | null
      bioSummary: string | null
      photoUrl: string | null
      photoSourceUrl: string | null
      siteUrl: string | null
      bioSourceUrl: string | null
      approvalRate: number | null
    }>
  >`SELECT id, name, party, state, position, bio, "bioSummary", "photoUrl",
           "photoSourceUrl", "siteUrl", "bioSourceUrl", "approvalRate"
    FROM "Candidate" WHERE slug = ${slug}`

  if (candidates.length === 0) {
    warn(`No candidate found with slug "${slug}" — skipping`)
    return
  }
  if (candidates.length !== 1) {
    warn(
      `Slug "${slug}" resolves to ${candidates.length} candidates — skipping until identity review`,
    )
    return
  }

  for (const candidate of candidates) {
    log(`  Updating ${candidate.name} (${candidate.position}) — ${slug}`)

    const candidatePatch: CandidateMaterialPatch = {
      ...(output.bio ? { bio: output.bio } : {}),
      ...(output.recentContext ? { bioSummary: output.recentContext } : {}),
      ...(output.photoUrl ? { photoUrl: output.photoUrl } : {}),
      ...(optionalHttpsUrl(output.officialPhotoPageUrl)
        ? { photoSourceUrl: optionalHttpsUrl(output.officialPhotoPageUrl) }
        : {}),
      ...(optionalHttpsUrl(output.officialSiteUrl)
        ? { siteUrl: optionalHttpsUrl(output.officialSiteUrl) }
        : {}),
      ...(optionalHttpsUrl(output.wikipediaUrl) || optionalHttpsUrl(output.officialSiteUrl)
        ? {
            bioSourceUrl:
              optionalHttpsUrl(output.wikipediaUrl) ?? optionalHttpsUrl(output.officialSiteUrl),
          }
        : {}),
      ...(output.approvalRate != null ? { approvalRate: output.approvalRate } : {}),
    }
    const materialChanged = hasCandidateMaterialChange(
      candidate satisfies CandidateMaterialSnapshot,
      candidatePatch,
    )

    if (!DRY_RUN && materialChanged) {
      await prisma.candidate.update({
        where: { id: candidate.id },
        data: {
          ...candidatePatch,
          materialUpdatedAt: new Date(),
        },
      })
      await invalidateApiCandidateCaches()
      await revalidateCandidatePages([slug])
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
            select: {
              id: true,
              status: true,
              candidateId: true,
              reviewedAt: true,
            },
          })

          if (existing) {
            if (existing.candidateId !== candidate.id) {
              warn(`External proposal id collision for ${externalId} — skipping`)
              continue
            }
            if (existing.reviewedAt || existing.status !== ProposalStatus.DRAFT) {
              log('      preservada: proposta já revisada')
              continue
            }
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

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const outputsDir = path.join(__dirname, '..', 'data', 'gemini-research', 'outputs')

  if (!fs.existsSync(outputsDir)) {
    throw new Error(`Outputs directory not found: ${outputsDir}`)
  }

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
