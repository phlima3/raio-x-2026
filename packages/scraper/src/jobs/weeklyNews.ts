import 'dotenv/config'
import cron from 'node-cron'
import { DataSource, Position, PrismaClient, ProposalStatus } from '@prisma/client'
import { fetchCandidateNews, TOPICS } from '../processors/newsProcessor'
import { detectContradiction, TOPIC_TO_CATEGORY, type ProposalRef } from '../processors/contradictionDetector'
import { logger } from '../utils/logger'
import { invalidateApiCandidateCaches } from '../utils/invalidateApiCache'
import { revalidateCandidatePages } from '../utils/revalidateWeb'
import {
  createPrismaSyncRunStore,
  runDataSourceSync,
  type CompletedSyncRun,
} from '../sync/runDataSourceSync'

// Weekly cron job: fetch recent news/statements for each candidate via Gemini Search Grounding
// Schedule: every Wednesday at 04:00 UTC (01:00 BRT)
// Gemini Search Grounding has rate limits — process sequentially with delays

const CRON_SCHEDULE = '0 4 * * 3' // 04:00 UTC Wednesday = 01:00 BRT Wednesday
const DELAY_BETWEEN_REQUESTS_MS = 2_000 // 2s between Gemini calls to respect rate limits

const prisma = new PrismaClient()

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

interface NewsSnapshot {
  headline: string
  summary: string
  source: string | null
  url: string | null
  publishedAt: Date | null
  hasContradiction: boolean
  contradictionNote: string | null
}

function newsFingerprint(items: NewsSnapshot[]): string {
  return JSON.stringify(
    items
      .map((item) => ({
        ...item,
        publishedAt: item.publishedAt?.toISOString() ?? null,
      }))
      .sort((left, right) =>
        `${left.url ?? ''}\u0000${left.headline}`.localeCompare(
          `${right.url ?? ''}\u0000${right.headline}`,
        ),
      ),
  )
}

async function executeWeeklyNewsSync(): Promise<{
  saved: number
  contradictions: number
  errors: number
}> {
  logger.info('[weekly-news] Starting weekly news sync via Gemini Search Grounding…')

  const candidates = await prisma.candidate.findMany({
    where: {
      isPublished: true,
      position: { in: [Position.PRESIDENTE, Position.GOVERNADOR, Position.SENADOR] },
    },
    select: { id: true, name: true, slug: true },
    orderBy: { name: 'asc' },
  })

  if (candidates.length === 0) {
    logger.warn('[weekly-news] No candidates found in DB — skipping')
    return { saved: 0, contradictions: 0, errors: 0 }
  }

  logger.info(`[weekly-news] Processing ${candidates.length} candidates × ${TOPICS.length} topics`)

  let totalSaved = 0
  let totalContradictions = 0
  let totalErrors = 0
  const touchedSlugs = new Set<string>()
  let materialChanged = false

  for (const candidate of candidates) {
    for (const topic of TOPICS) {
      await sleep(DELAY_BETWEEN_REQUESTS_MS)

      try {
        const items = await fetchCandidateNews(candidate.name, topic)

        // Fetch proposals for this candidate+topic to check contradictions
        const category = TOPIC_TO_CATEGORY[topic]
        const proposals: ProposalRef[] = category
          ? await prisma.proposal.findMany({
              // Keep contradiction evidence inside the same public-data policy
              // used by the API: reviewed, published and HTTPS-sourced only.
              where: {
                candidateId: candidate.id,
                category,
                isPublished: true,
                status: { not: ProposalStatus.DRAFT },
                url: { startsWith: 'https://' },
              },
              select: { id: true, title: true, description: true, summary: true },
            })
          : []

        const preparedItems: NewsSnapshot[] = []
        for (const item of items) {
          await sleep(500) // brief pause between Gemini calls

          const contradiction = await detectContradiction(item.headline, item.summary, proposals)
          const hasContradiction = contradiction?.hasContradiction ?? false
          const contradictionNote =
            hasContradiction && contradiction?.explanation ? contradiction.explanation : null

          preparedItems.push({
            headline: item.headline,
            summary: item.summary,
            source: item.source ?? null,
            url: item.url ?? null,
            publishedAt: item.date ? new Date(item.date) : null,
            hasContradiction,
            contradictionNote,
          })

          if (hasContradiction) {
            totalContradictions++
            logger.info(`[weekly-news] Contradiction detected: ${candidate.name}/${topic} — "${item.headline}"`)
          }
        }

        const existing = await prisma.newsItem.findMany({
          where: { candidateId: candidate.id, topic },
          select: {
            headline: true,
            summary: true,
            source: true,
            url: true,
            publishedAt: true,
            hasContradiction: true,
            contradictionNote: true,
          },
        })
        const changed = newsFingerprint(existing) !== newsFingerprint(preparedItems)
        if (changed) {
          const changedAt = new Date()
          await prisma.$transaction(async (tx) => {
            await tx.newsItem.deleteMany({
              where: { candidateId: candidate.id, topic },
            })
            if (preparedItems.length > 0) {
              await tx.newsItem.createMany({
                data: preparedItems.map((item) => ({
                  ...item,
                  candidateId: candidate.id,
                  topic,
                })),
              })
            }
            await tx.candidate.update({
              where: { id: candidate.id },
              data: { materialUpdatedAt: changedAt },
            })
          })
          materialChanged = true
          if (candidate.slug) touchedSlugs.add(candidate.slug)
        }

        totalSaved += preparedItems.length
        logger.info(
          preparedItems.length === 0
            ? `[weekly-news] No news for ${candidate.name}/${topic}`
            : `[weekly-news] ${candidate.name}/${topic}: saved ${preparedItems.length} items`,
        )
      } catch (err) {
        totalErrors++
        logger.error(
          `[weekly-news] Error processing ${candidate.name}/${topic}`,
          err instanceof Error ? err.message : err,
        )
      }
    }
  }

  logger.info(
    `[weekly-news] Done — ${totalSaved} items saved, ${totalContradictions} contradictions detected, ${totalErrors} errors`,
  )
  if (materialChanged) {
    await invalidateApiCandidateCaches()
    await revalidateCandidatePages([...touchedSlugs])
  }
  if (totalErrors > 0) {
    throw new Error(`[weekly-news] ${totalErrors} candidate/topic request(s) failed`)
  }
  return { saved: totalSaved, contradictions: totalContradictions, errors: totalErrors }
}

export async function runWeeklyNewsSync(): Promise<CompletedSyncRun> {
  return runDataSourceSync({
    source: DataSource.NEWS,
    kind: 'news-context',
    store: createPrismaSyncRunStore(prisma),
    execute: async () => {
      const metrics = await executeWeeklyNewsSync()
      return { noop: metrics.saved === 0, metrics: { ...metrics } }
    },
  })
}

export const weeklyNewsJob = cron.schedule(CRON_SCHEDULE, runWeeklyNewsSync, {
  scheduled: false,
  timezone: 'UTC',
})

// ── Direct execution ──────────────────────────────────────────────────────────
// Used by: pnpm run news:weekly
if (require.main === module) {
  runWeeklyNewsSync()
    .catch((err) => {
      logger.error('[weekly-news] Fatal error', err)
      process.exit(1)
    })
    .finally(() => prisma.$disconnect())
}
