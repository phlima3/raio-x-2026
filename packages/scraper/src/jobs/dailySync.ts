import cron from 'node-cron'

import { syncCamara } from '../sources/camara'
import { syncSenado } from '../sources/senado'
import { logger } from '../utils/logger'

// Compatibility cron for legislative sources. TSE and documents have
// independent schedules in GitHub Actions.
const CRON_SCHEDULE = '0 3 * * *'

async function runDailySync(): Promise<void> {
  logger.info('[daily-sync] Starting daily government API sync…')

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 2)
  const dateFrom = yesterday.toISOString().slice(0, 10)

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

  const failures = results.filter((result): result is PromiseRejectedResult =>
    result.status === 'rejected',
  )
  if (failures.length > 0) {
    throw new AggregateError(
      failures.map((failure) => failure.reason),
      `[daily-sync] ${failures.length} source(s) failed`,
    )
  }

  logger.info('[daily-sync] Daily sync finished')
}

export const dailySyncJob = cron.schedule(CRON_SCHEDULE, runDailySync, {
  scheduled: false,
  timezone: 'UTC',
})

export { runDailySync }

if (require.main === module) {
  runDailySync().catch((error) => {
    logger.error('[daily-sync] Fatal error', error)
    process.exit(1)
  })
}
