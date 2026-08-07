import cron from 'node-cron'
import { syncCamara } from '../sources/camara'
import { syncSenado } from '../sources/senado'
import { syncTse } from '../sources/tse'
import { logger } from '../utils/logger'

// Daily cron job: sync stable Câmara/Senado data. TSE candidacy status has a
// separate two-hour schedule because it is time-sensitive during registration.
// Schedule: every day at 03:00 BRT (06:00 UTC)
// These APIs are relatively stable — daily refresh is sufficient

// TODO: Add distributed lock (Redis) to prevent concurrent runs
// TODO: Send Slack/email alert on sync failure
// TODO: Store sync run history (startedAt, finishedAt, recordsUpdated, errors)

const CRON_SCHEDULE = '0 6 * * *' // 06:00 UTC = 03:00 BRT
const TSE_STATUS_CRON_SCHEDULE = '15 */2 * * *'

async function runDailySync(): Promise<void> {
  logger.info('[daily-sync] Starting daily government API sync…')

  // Fetch only votes from the last 2 days to avoid scanning full session history
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 2)
  const dateFrom = yesterday.toISOString().slice(0, 10) // YYYY-MM-DD

  const results = await Promise.allSettled([
    syncCamara({}, { dateFrom }),
    syncSenado(),
  ])

  results.forEach((result, index) => {
    const source = ['camara', 'senado'][index]
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

let tseStatusSyncRunning = false

export async function runTseStatusSync(): Promise<void> {
  if (tseStatusSyncRunning) {
    logger.warn('[tse-status] Sincronização anterior ainda está em execução; rodada ignorada')
    return
  }
  tseStatusSyncRunning = true
  try {
    await syncTse(2026)
  } finally {
    tseStatusSyncRunning = false
  }
}

export const tseStatusJob = cron.schedule(TSE_STATUS_CRON_SCHEDULE, runTseStatusSync, {
  scheduled: false,
  timezone: 'America/Sao_Paulo',
})

// Allow running once immediately for testing
export { runDailySync }

// ── Direct execution ──────────────────────────────────────────────────────────
// Used by: pnpm run sync:all
if (require.main === module) {
  Promise.all([runDailySync(), runTseStatusSync()])
    .catch((err) => {
      logger.error('[daily-sync] Fatal error', err)
      process.exit(1)
    })
}
