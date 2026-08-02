import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

import { syncCandidateSites, loadCandidateSiteConfigs } from '../sources/candidateSites'
import { runSenadoSync } from '../sources/senado'
import { logger } from '../utils/logger'

const prisma = new PrismaClient()

/**
 * Backward-compatible entry point for the old populate:senado command.
 * Legislative data is now normalized and never links current senators to a
 * 2026 Candidate through fuzzy name matching.
 */
async function populateSenado(): Promise<void> {
  logger.info('[populate] Senado now uses the normalized official sync')
  await runSenadoSync({ prisma })
}

async function scrapeAllSites(): Promise<void> {
  logger.info('[populate] Scraping configured candidate websites')
  const configs = await loadCandidateSiteConfigs()
  if (configs.length === 0) {
    logger.warn('[populate] No published candidate site configuration found; skipping')
    return
  }
  await syncCandidateSites(configs)
}

async function main(): Promise<void> {
  const mode = process.argv[2] ?? 'all'
  if (mode === 'senado' || mode === 'all') await populateSenado()
  if (mode === 'sites' || mode === 'all') await scrapeAllSites()
}

main()
  .catch((error) => {
    logger.error('[populate] Fatal error', error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
