import cron from 'node-cron'
import { syncCandidateSites, loadCandidateSiteConfigs } from '../sources/candidateSites'
import { logger } from '../utils/logger'

// Weekly cron job: scrape candidate websites for programmatic proposals
// Schedule: every Sunday at 02:00 BRT (05:00 UTC)
// Playwright scraping is heavier — weekly frequency avoids overloading candidate sites

const CRON_SCHEDULE = '0 5 * * 0' // 05:00 UTC Sunday = 02:00 BRT Sunday

async function runWeeklyProposalsSync(): Promise<void> {
  logger.info('[weekly-proposals] Starting weekly candidate sites scrape…')

  const configs = await loadCandidateSiteConfigs()

  if (configs.length === 0) {
    logger.warn('[weekly-proposals] No candidates with siteUrl found in DB — skipping')
    return
  }

  logger.info(`[weekly-proposals] ${configs.length} candidate sites to scrape`)

  try {
    await syncCandidateSites(configs)
    logger.info('[weekly-proposals] Candidate sites scrape completed')
  } catch (err) {
    logger.error('[weekly-proposals] Candidate sites scrape failed', err)
    throw err
  }
}

export const weeklyProposalsJob = cron.schedule(CRON_SCHEDULE, runWeeklyProposalsSync, {
  scheduled: false,
  timezone: 'America/Sao_Paulo',
})

export { runWeeklyProposalsSync }
