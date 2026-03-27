import 'dotenv/config'
import cron from 'node-cron'
import { PrismaClient } from '@prisma/client'
import { fetchCandidateNews, TOPICS } from '../processors/newsProcessor'
import { detectContradiction, TOPIC_TO_CATEGORY, type ProposalRef } from '../processors/contradictionDetector'
import { logger } from '../utils/logger'

// Weekly cron job: fetch recent news/statements for each candidate via Gemini Search Grounding
// Schedule: every Wednesday at 04:00 UTC (01:00 BRT)
// Gemini Search Grounding has rate limits — process sequentially with delays

const CRON_SCHEDULE = '0 4 * * 3' // 04:00 UTC Wednesday = 01:00 BRT Wednesday
const DELAY_BETWEEN_REQUESTS_MS = 2_000 // 2s between Gemini calls to respect rate limits

const prisma = new PrismaClient()

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function runWeeklyNewsSync(): Promise<void> {
  logger.info('[weekly-news] Starting weekly news sync via Gemini Search Grounding…')

  const candidates = await prisma.candidate.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })

  if (candidates.length === 0) {
    logger.warn('[weekly-news] No candidates found in DB — skipping')
    return
  }

  logger.info(`[weekly-news] Processing ${candidates.length} candidates × ${TOPICS.length} topics`)

  let totalSaved = 0
  let totalContradictions = 0
  let totalErrors = 0

  for (const candidate of candidates) {
    for (const topic of TOPICS) {
      await sleep(DELAY_BETWEEN_REQUESTS_MS)

      try {
        const items = await fetchCandidateNews(candidate.name, topic)

        if (items.length === 0) {
          logger.info(`[weekly-news] No news for ${candidate.name}/${topic}`)
          continue
        }

        // Fetch proposals for this candidate+topic to check contradictions
        const category = TOPIC_TO_CATEGORY[topic]
        const proposals: ProposalRef[] = category
          ? await prisma.proposal.findMany({
              where: { candidateId: candidate.id, category },
              select: { id: true, title: true, description: true, summary: true },
            })
          : []

        // Delete stale entries for this candidate+topic (replace strategy)
        await prisma.newsItem.deleteMany({
          where: { candidateId: candidate.id, topic },
        })

        // Create each item individually to include contradiction analysis
        for (const item of items) {
          await sleep(500) // brief pause between Gemini calls

          const contradiction = await detectContradiction(item.headline, item.summary, proposals)
          const hasContradiction = contradiction?.hasContradiction ?? false
          const contradictionNote =
            hasContradiction && contradiction?.explanation ? contradiction.explanation : null

          await prisma.newsItem.create({
            data: {
              candidateId: candidate.id,
              headline: item.headline,
              summary: item.summary,
              source: item.source ?? null,
              url: item.url ?? null,
              topic,
              publishedAt: item.date ? new Date(item.date) : null,
              hasContradiction,
              contradictionNote,
            },
          })

          if (hasContradiction) {
            totalContradictions++
            logger.info(`[weekly-news] Contradiction detected: ${candidate.name}/${topic} — "${item.headline}"`)
          }
        }

        totalSaved += items.length
        logger.info(`[weekly-news] ${candidate.name}/${topic}: saved ${items.length} items`)
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
  await prisma.$disconnect()
}

export const weeklyNewsJob = cron.schedule(CRON_SCHEDULE, runWeeklyNewsSync, {
  scheduled: false,
  timezone: 'America/Sao_Paulo',
})

export { runWeeklyNewsSync }

// ── Direct execution ──────────────────────────────────────────────────────────
// Used by: pnpm run news:weekly
if (require.main === module) {
  runWeeklyNewsSync()
    .catch((err) => {
      logger.error('[weekly-news] Fatal error', err)
      process.exit(1)
    })
}
