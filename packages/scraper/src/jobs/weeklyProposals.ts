import { createScraperPrismaClient } from '../utils/prisma'
import cron from 'node-cron'
import { DataSource } from '@prisma/client'

import { syncCandidateSites, loadCandidateSiteConfigs } from '../sources/candidateSites'
import {
  createPrismaSyncRunStore,
  runDataSourceSync,
  type CompletedSyncRun,
} from '../sync/runDataSourceSync'
import { logger } from '../utils/logger'

const prisma = createScraperPrismaClient()
const CRON_SCHEDULE = '0 4 * * 1'

export async function runWeeklyProposalsSync(): Promise<CompletedSyncRun> {
  return runDataSourceSync({
    source: DataSource.CANDIDATE_SITE,
    kind: 'campaign-proposals',
    store: createPrismaSyncRunStore(prisma),
    execute: async () => {
      const configs = await loadCandidateSiteConfigs()
      if (configs.length === 0) {
        return { noop: true, metrics: { sites: 0, succeeded: 0, failed: 0, proposals: 0 } }
      }
      const metrics = await syncCandidateSites(configs)
      return { metrics: { ...metrics } }
    },
  })
}

export const weeklyProposalsJob = cron.schedule(CRON_SCHEDULE, runWeeklyProposalsSync, {
  scheduled: false,
  timezone: 'UTC',
})

if (require.main === module) {
  runWeeklyProposalsSync()
    .catch((error) => {
      logger.error('[weekly-proposals] Fatal error', error)
      process.exit(1)
    })
    .finally(() => prisma.$disconnect())
}
