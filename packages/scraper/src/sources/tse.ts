import 'dotenv/config'
import { DataSource, Position, PrismaClient } from '@prisma/client'

import {
  createPrismaSyncRunStore,
  runDataSourceSync,
  type CompletedSyncRun,
} from '../sync/runDataSourceSync'
import { logger } from '../utils/logger'
import { invalidateApiCandidateCaches } from '../utils/invalidateApiCache'
import { revalidateCandidatePages } from '../utils/revalidateWeb'
import { parseTseCandidateArchive } from './tse/candidateArchive'
import {
  createTseCkanClient,
  TseResourceKind,
  type TseCkanClient,
} from './tse/ckanClient'
import { importTseCandidates } from './tse/importCandidates'
import { parseTseTabularArchive } from './tse/tabularArchive'

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

      const complementResource = resources.find(
        (candidate) => candidate.kind === TseResourceKind.CANDIDATE_COMPLEMENT,
      )
      if (!complementResource) {
        throw new Error(
          `Catálogo TSE candidatos-${year} não contém o complemento obrigatório de julgamento`,
        )
      }
      const [downloaded, complementDownload] = await Promise.all([
        client.download(resource),
        client.download(complementResource),
      ])
      await options.prisma.dataSyncRun.update({
        where: { id: runId },
        data: {
          sourceUrl: resource.url,
          checksum: downloaded.sha256,
        },
      })

      const parsed = parseTseCandidateArchive(downloaded.bytes)
      const complement = parseTseTabularArchive(complementDownload.bytes)
      if (parsed.records.length === 0 && parsed.rejected.length > 0) {
        throw new Error(
          `Snapshot TSE sem registros válidos (${parsed.rejected.length} linhas rejeitadas)`,
        )
      }
      if (parsed.records.length > 0 && complement.rows.length === 0) {
        throw new Error('Snapshot TSE sem linhas válidas no complemento de julgamento')
      }

      const imported = await importTseCandidates(options.prisma, {
        records: parsed.records,
        sourceUrl: resource.url,
        checksum: downloaded.sha256,
        syncRunId: runId,
        syncedAt: complementDownload.fetchedAt,
        dryRun: options.dryRun,
        complementRows: complement.rows,
        complementSourceUrl: complementResource.url,
        requireComplementJudgment: true,
      })
      if (!options.dryRun && imported.created + imported.updated > 0) {
        await invalidateApiCandidateCaches()
        const touchedCandidates = await options.prisma.candidate.findMany({
          where: {
            syncRunId: runId,
            position: { in: [Position.PRESIDENTE, Position.GOVERNADOR, Position.SENADOR] },
            slug: { not: null },
          },
          select: { slug: true },
        })
        await revalidateCandidatePages(
          touchedCandidates.flatMap((candidate) => candidate.slug ? [candidate.slug] : []),
        )
      }

      return {
        noop: parsed.records.length === 0,
        metrics: {
          catalogResources: resources.length,
          parsed: parsed.records.length,
          rejected: parsed.rejected.length,
          complementRows: complement.rows.length,
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
  const prisma = new PrismaClient()
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
