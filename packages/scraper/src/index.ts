import 'dotenv/config'
import { dailySyncJob } from './jobs/dailySync'
import { weeklyNewsJob } from './jobs/weeklyNews'
import { weeklyProposalsJob } from './jobs/weeklyProposals'
import { logger } from './utils/logger'

// ── Entry point ───────────────────────────────────────────────────────────────
// Run with: npm run sync (one-shot)
// In production: cron jobs in dailySync and weeklyProposals schedule themselves

async function main(): Promise<void> {
  logger.info('Raio-X 2026 Scraper starting…')

  // TODO: Parse CLI args to run specific sources
  // e.g.: --source=camara --source=tse --once

  // TSE runs in sync-tse.yml on every main update and every two hours. This
  // local long-running entrypoint only owns the remaining legacy cron jobs.
  dailySyncJob.start()
  weeklyNewsJob.start()
  weeklyProposalsJob.start()

  logger.info('Cron jobs started. Scraper is running.')
}

main().catch((err) => {
  logger.error('Fatal error in scraper', err)
  process.exit(1)
})
