import cron from 'node-cron'
import { syncCamara } from '../sources/camara'
import { syncSenado } from '../sources/senado'
import { syncTse } from '../sources/tse'
import { logger } from '../utils/logger'

// Daily cron job: sync government APIs (Câmara, Senado, TSE)
// Schedule: every day at 03:00 BRT (06:00 UTC)
// These APIs are relatively stable — daily refresh is sufficient

// TODO: Add distributed lock (Redis) to prevent concurrent runs
// TODO: Send Slack/email alert on sync failure
// TODO: Store sync run history (startedAt, finishedAt, recordsUpdated, errors)

const CRON_SCHEDULE = '0 6 * * *' // 06:00 UTC = 03:00 BRT

async function runDailySync(): Promise<void> {
  logger.info('[daily-sync] Starting daily government API sync…')

  // Fetch only votes from the last 2 days to avoid scanning full session history
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 2)
  const dateFrom = yesterday.toISOString().slice(0, 10) // YYYY-MM-DD

  const results = await Promise.allSettled([
    syncCamara({}, { dateFrom }),
    syncSenado(),
    syncTse(),
  ])

  results.forEach((result, index) => {
    const source = ['camara', 'senado', 'tse'][index]
    if (result.status === 'rejected') {
      logger.error(`[daily-sync] ${source} sync failed`, result.reason)
    } else {
      logger.info(`[daily-sync] ${source} sync completed`)
    }
  })

  logger.info('[daily-sync] Daily sync finished')
}

export const dailySyncJob = cron.schedule(CRON_SCHEDULE, runDailySync, {
  scheduled: false, // Start explicitly via dailySyncJob.start()
  timezone: 'America/Sao_Paulo',
})

// Allow running once immediately for testing
export { runDailySync }

// ── Direct execution ──────────────────────────────────────────────────────────
// Used by: pnpm run sync:all
if (require.main === module) {
  runDailySync()
    .catch((err) => {
      logger.error('[daily-sync] Fatal error', err)
      process.exit(1)
    })
}
