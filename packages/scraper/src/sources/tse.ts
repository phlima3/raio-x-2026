import { createScraperPrismaClient } from '../utils/prisma'
import 'dotenv/config'
import { DataSource, type PrismaClient } from '@prisma/client'

import {
  createPrismaSyncRunStore,
  runDataSourceSync,
  type CompletedSyncRun,
} from '../sync/runDataSourceSync'
import { logger } from '../utils/logger'
import { parseTseCandidateArchive } from './tse/candidateArchive'
import {
  createTseCkanClient,
  TseResourceKind,
  type TseCkanClient,
} from './tse/ckanClient'
import { importTseCandidates } from './tse/importCandidates'

export interface RunTseCandidateSyncOptions {
  prisma: PrismaClient
  client?: TseCkanClient
  year?: number
  dryRun?: boolean
}

export async function runTseCandidateSync(
  options: RunTseCandidateSyncOptions,
): Promise<CompletedSyncRun> {
  const year = options.year ?? 2026
  const client = options.client ?? createTseCkanClient()

  return runDataSourceSync({
    source: DataSource.TSE,
    kind: 'candidates',
    dryRun: options.dryRun,
    store: createPrismaSyncRunStore(options.prisma),
    execute: async ({ runId }) => {
      const resources = await client.discover(year)
      const resource = resources.find((candidate) => candidate.kind === TseResourceKind.CANDIDATES)
      if (!resource) {
        throw new Error(`Catálogo TSE candidatos-${year} não contém o recurso de candidaturas`)
      }

      const downloaded = await client.download(resource)
      await options.prisma.dataSyncRun.update({
        where: { id: runId },
        data: {
          sourceUrl: resource.url,
          checksum: downloaded.sha256,
        },
      })

      const parsed = parseTseCandidateArchive(downloaded.bytes)
      if (parsed.records.length === 0 && parsed.rejected.length > 0) {
        throw new Error(
          `Snapshot TSE sem registros válidos (${parsed.rejected.length} linhas rejeitadas)`,
        )
      }

      const imported = await importTseCandidates(options.prisma, {
        records: parsed.records,
        sourceUrl: resource.url,
        checksum: downloaded.sha256,
        syncRunId: runId,
        syncedAt: downloaded.fetchedAt,
        dryRun: options.dryRun,
      })

      return {
        noop: parsed.records.length === 0,
        metrics: {
          catalogResources: resources.length,
          archiveFiles: parsed.fileNames.length,
          archiveFileNames: parsed.fileNames.join(', '),
          parsed: parsed.records.length,
          rejected: parsed.rejected.length,
          duplicates: parsed.duplicates,
          created: imported.created,
          matched: imported.matched,
          updated: imported.updated,
          ambiguous: imported.ambiguous,
          conflicts: imported.conflicts,
          reviewItems: imported.reviewItems,
          published: imported.published,
          hidden: imported.hidden,
        },
      }
    },
  })
}

export async function syncTse(year = 2026, dryRun = false): Promise<CompletedSyncRun> {
  const prisma = createScraperPrismaClient()
  try {
    logger.info(`[tse] Starting official candidate sync for ${year}${dryRun ? ' (dry-run)' : ''}`)
    const result = await runTseCandidateSync({ prisma, year, dryRun })
    logger.info('[tse] Official candidate sync complete', result)
    return result
  } finally {
    await prisma.$disconnect()
  }
}

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run')
  const yearArg = process.argv.find((argument) => /^--year=\d{4}$/.test(argument))
  const year = yearArg ? Number(yearArg.split('=')[1]) : 2026

  syncTse(year, dryRun).catch((error) => {
    logger.error('[tse] Fatal error', error)
    process.exit(1)
  })
}
