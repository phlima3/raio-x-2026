import { createScraperPrismaClient } from '../utils/prisma'
import 'dotenv/config'
import { createHash } from 'node:crypto'
import { DataSource, DocumentExtractionStatus, OfficialCandidacyStatus, Position, Prisma, SourceDocumentType, type PrismaClient } from '@prisma/client'

import {
  createPrismaSyncRunStore,
  runDataSourceSync,
  type CompletedSyncRun,
} from '../sync/runDataSourceSync'
import { logger } from '../utils/logger'
import { invalidateApiCandidateCaches } from '../utils/invalidateApiCache'
import { revalidateCandidatePages } from '../utils/revalidateWeb'
import {
  createTseCkanClient,
  TseResourceKind,
  type TseCkanClient,
} from './tse/ckanClient'
import { isPublishableStatus, resolveTseCandidateJudgments } from './tse/candidacyStatus'
import { nullableName } from './tse/candidateCsv'
import { parseTseTabularArchives } from './tse/tabularArchive'

const SUPPLEMENTAL_KINDS = new Set<TseResourceKind>([
  TseResourceKind.CANDIDATE_COMPLEMENT,
  TseResourceKind.ASSETS,
  TseResourceKind.COALITIONS,
  TseResourceKind.VACANCIES,
  TseResourceKind.CASSATIONS,
  TseResourceKind.SOCIAL_MEDIA,
])
const DATABASE_BATCH_SIZE = 250
const SOCIAL_MEDIA_REQUIRED_COLUMNS = ['SQ_CANDIDATO', 'DS_URL'] as const

export interface RunTseSupplementalSyncOptions {
  prisma: PrismaClient
  client?: TseCkanClient
  year?: number
  dryRun?: boolean
  batchSize?: number
}

function stableExternalId(kind: TseResourceKind, row: Record<string, string | null>): string {
  return createHash('sha256').update(`${kind}:${JSON.stringify(row)}`).digest('hex')
}

function electionYear(row: Record<string, string | null>): number | null {
  const value = Number(row.ANO_ELEICAO ?? row.AA_ELEICAO)
  return Number.isInteger(value) ? value : null
}

function positionFromTse(value: string | null): Position | null {
  const token = (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
  const positions: Record<string, Position> = {
    PRESIDENTE: Position.PRESIDENTE,
    VICE_PRESIDENTE: Position.VICE_PRESIDENTE,
    GOVERNADOR: Position.GOVERNADOR,
    VICE_GOVERNADOR: Position.VICE_GOVERNADOR,
    SENADOR: Position.SENADOR,
    '1_SUPLENTE': Position.PRIMEIRO_SUPLENTE,
    '2_SUPLENTE': Position.SEGUNDO_SUPLENTE,
    DEPUTADO_FEDERAL: Position.DEPUTADO_FEDERAL,
    DEPUTADO_ESTADUAL: Position.DEPUTADO_ESTADUAL,
    DEPUTADO_DISTRITAL: Position.DEPUTADO_DISTRITAL,
    PREFEITO: Position.PREFEITO,
    VICE_PREFEITO: Position.VICE_PREFEITO,
    VEREADOR: Position.VEREADOR,
  }
  return positions[token.replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '')] ?? null
}

function decimalValue(value: string | null): Prisma.Decimal {
  if (!value) return new Prisma.Decimal(0)
  const normalized = value.replace(/\./g, '').replace(',', '.')
  try {
    return new Prisma.Decimal(normalized)
  } catch {
    return new Prisma.Decimal(0)
  }
}

function chunks<T>(values: T[], size = DATABASE_BATCH_SIZE): T[][] {
  const result: T[][] = []
  for (let offset = 0; offset < values.length; offset += size) {
    result.push(values.slice(offset, offset + size))
  }
  return result
}

function assertSocialMediaSchema(columns: string[], resourceId: string): void {
  const normalized = new Set(
    columns.map((column) => column.replace(/^\uFEFF/, '').trim().toUpperCase()),
  )
  const missing = SOCIAL_MEDIA_REQUIRED_COLUMNS.filter((column) => !normalized.has(column))
  if (missing.length > 0) {
    throw new Error(
      `Recurso social TSE ${resourceId} sem colunas obrigatórias: ${missing.join(', ')}`,
    )
  }
}

async function runTransactionsInBatches(
  prisma: PrismaClient,
  operations: Array<Prisma.PrismaPromise<unknown>>,
): Promise<void> {
  for (const batch of chunks(operations, 100)) {
    await prisma.$transaction(batch)
  }
}

async function reconcileCandidateSites(
  prisma: PrismaClient,
  rows: Array<Record<string, string | null>>,
  year: number,
  verifiedAt: Date,
): Promise<number> {
  const canonicalByCandidate = new Map<string, { url: string; order: number }>()
  for (const row of rows) {
    const tseId = row.SQ_CANDIDATO
    const url = row.DS_URL?.trim()
    if (!tseId || !url || !/^https?:\/\//i.test(url)) continue

    const parsedOrder = Number(row.NR_ORDEM_REDE_SOCIAL)
    const order = Number.isFinite(parsedOrder) ? parsedOrder : Number.MAX_SAFE_INTEGER
    const current = canonicalByCandidate.get(tseId)
    if (
      !current ||
      order < current.order ||
      (order === current.order && url.localeCompare(current.url) < 0)
    ) {
      canonicalByCandidate.set(tseId, { url, order })
    }
  }

  const candidates = await prisma.candidate.findMany({
    where: {
      electionYear: year,
      isOfficial: true,
      dataSource: DataSource.TSE,
      tseId: { not: null },
    },
    select: { id: true, tseId: true, siteUrl: true },
  })
  const changes = candidates.flatMap((candidate) => {
    if (!candidate.tseId) return []
    const siteUrl = canonicalByCandidate.get(candidate.tseId)?.url ?? null
    if (candidate.siteUrl === siteUrl) return []
    return [prisma.candidate.update({
      where: { id: candidate.id },
      data: { siteUrl, materialUpdatedAt: verifiedAt },
    })]
  })

  await runTransactionsInBatches(prisma, changes)
  return changes.length
}

async function materializeResource(
  prisma: PrismaClient,
  kind: TseResourceKind,
  rows: Array<Record<string, string | null>>,
  sourceUrl: string,
  year: number,
  verifiedAt: Date,
): Promise<void> {
  if (kind === TseResourceKind.CANDIDATE_COMPLEMENT) {
    const judgments = resolveTseCandidateJudgments(rows)
    const candidates = await prisma.candidate.findMany({
      where: { tseId: { in: [...judgments.keys()] } },
      select: {
        id: true,
        tseId: true,
        officialStatusRaw: true,
        officialStatus: true,
        candidacyStatus: true,
        candidacyStatusSourceUrl: true,
      },
    })
    const operations = candidates.flatMap((candidate) => {
      if (!candidate.tseId) return []
      const judgment = judgments.get(candidate.tseId)
      if (!judgment) return []
      const materialChanged =
        candidate.officialStatusRaw !== judgment.rawStatus ||
        candidate.officialStatus !== judgment.officialStatus ||
        candidate.candidacyStatus !== judgment.candidacyStatus ||
        candidate.candidacyStatusSourceUrl !== sourceUrl

      return [prisma.candidate.update({
        where: { id: candidate.id },
        data: {
          officialStatusRaw: judgment.rawStatus,
          officialStatus: judgment.officialStatus,
          candidacyStatus: judgment.candidacyStatus,
          candidacyStatusSourceUrl: sourceUrl,
          candidacyStatusVerifiedAt: verifiedAt,
          ...(isPublishableStatus(judgment.officialStatus)
            ? {}
            : { isPublished: false }),
          ...(materialChanged ? { materialUpdatedAt: verifiedAt } : {}),
        },
      })]
    })
    await runTransactionsInBatches(prisma, operations)
  }

  if (kind === TseResourceKind.ASSETS) {
    const grouped = new Map<string, Array<Record<string, string | null>>>()
    const tseIds = new Set<string>()
    for (const row of rows) {
      if (!row.SQ_CANDIDATO) continue
      tseIds.add(row.SQ_CANDIDATO)
      const key = `${row.SQ_CANDIDATO}:${electionYear(row) ?? year}`
      grouped.set(key, [...(grouped.get(key) ?? []), row])
    }
    const candidateIds = new Map(
      (await prisma.candidate.findMany({
        where: { tseId: { in: [...tseIds] } },
        select: { id: true, tseId: true },
      })).flatMap((candidate) => candidate.tseId ? [[candidate.tseId, candidate.id]] : []),
    )
    const existingAssets = new Map(
      (await prisma.assetDeclaration.findMany({
        where: { candidateId: { in: [...candidateIds.values()] } },
        select: {
          candidateId: true,
          year: true,
          totalValue: true,
          sourceUrl: true,
          assets: true,
        },
      })).map((declaration) => [
        `${declaration.candidateId}:${declaration.year}`,
        declaration,
      ]),
    )
    const operations: Array<Prisma.PrismaPromise<unknown>> = []
    for (const [key, assets] of grouped) {
      const [tseId, rowYear] = key.split(':')
      const candidateId = candidateIds.get(tseId)
      if (!candidateId) continue
      const declarationYear = Number(rowYear)
      const canonicalAssets = [...assets].sort((left, right) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right)),
      )
      const totalValue = canonicalAssets.reduce(
        (total, asset) => total.plus(decimalValue(asset.VR_BEM_CANDIDATO)),
        new Prisma.Decimal(0),
      )
      const existing = existingAssets.get(`${candidateId}:${declarationYear}`)
      const materialChanged =
        !existing ||
        !existing.totalValue.equals(totalValue) ||
        existing.sourceUrl !== sourceUrl ||
        JSON.stringify(existing.assets) !== JSON.stringify(canonicalAssets)
      if (!materialChanged) continue

      operations.push(prisma.assetDeclaration.upsert({
        where: { candidateId_year: { candidateId, year: declarationYear } },
        update: { totalValue, sourceUrl, assets: canonicalAssets as Prisma.InputJsonArray },
        create: {
          candidateId,
          year: declarationYear,
          totalValue,
          sourceUrl,
          assets: canonicalAssets as Prisma.InputJsonArray,
        },
      }))
      operations.push(prisma.candidate.update({
        where: { id: candidateId },
        data: { materialUpdatedAt: verifiedAt },
      }))
    }
    await runTransactionsInBatches(prisma, operations)
  }

  if (kind === TseResourceKind.COALITIONS) {
    const coalitions = new Map<
      string,
      { electionYear: number; position: Position; state: string; party: string; name: string }
    >()
    for (const row of rows) {
      const position = positionFromTse(row.DS_CARGO)
      // `NM_COLIGACAO` é coluna de nome: quem concorre por partido isolado vem
      // como "#NULO", que guardado literalmente vira "Coligação #NULO" na ficha.
      // O marcador sem `#` final não é nulificado pelo leitor tabular, porque
      // em `DS_SITUACAO_CANDIDATURA` ele significa "sem julgamento".
      const coalitionName = nullableName(row.NM_COLIGACAO ?? null)
      if (!position || !coalitionName || !row.SG_UF || !row.SG_PARTIDO) continue
      const coalition = {
        electionYear: electionYear(row) ?? year,
        position,
        state: row.SG_UF,
        party: row.SG_PARTIDO,
        name: coalitionName,
      }
      coalitions.set(
        `${coalition.electionYear}\u0000${position}\u0000${coalition.state}\u0000${coalition.party}`,
        coalition,
      )
    }
    const operations = [...coalitions.values()].map((coalition) =>
      prisma.candidate.updateMany({
        where: {
          electionYear: coalition.electionYear,
          position: coalition.position,
          state: coalition.state,
          party: coalition.party,
          OR: [
            { coalitionName: null },
            { coalitionName: { not: coalition.name } },
          ],
        },
        data: { coalitionName: coalition.name, materialUpdatedAt: verifiedAt },
      }),
    )
    await runTransactionsInBatches(prisma, operations)
  }

  if (kind === TseResourceKind.CASSATIONS) {
    const latestReasonByCandidate = new Map<string, string>()
    for (const row of rows) {
      if (!row.SQ_CANDIDATO) continue
      latestReasonByCandidate.set(row.SQ_CANDIDATO, row.DS_MOTIVO ?? 'CASSAÇÃO')
    }
    const candidatesByReason = new Map<string, string[]>()
    for (const [tseId, reason] of latestReasonByCandidate) {
      candidatesByReason.set(reason, [...(candidatesByReason.get(reason) ?? []), tseId])
    }
    const operations = [...candidatesByReason].flatMap(([reason, tseIds]) =>
      chunks(tseIds).map((candidateTseIds) => prisma.candidate.updateMany({
        where: {
          tseId: { in: candidateTseIds },
          OR: [
            { officialStatus: null },
            { officialStatus: { not: OfficialCandidacyStatus.CANCELLED } },
            { officialStatusRaw: null },
            { officialStatusRaw: { not: reason } },
            { isPublished: true },
          ],
        },
        data: {
          officialStatus: OfficialCandidacyStatus.CANCELLED,
          officialStatusRaw: reason,
          isPublished: false,
          materialUpdatedAt: verifiedAt,
        },
      })),
    )
    await runTransactionsInBatches(prisma, operations)
  }

}

export async function runTseSupplementalSync(
  options: RunTseSupplementalSyncOptions,
): Promise<CompletedSyncRun> {
  const year = options.year ?? 2026
  const batchSize = options.batchSize ?? 250
  const client = options.client ?? createTseCkanClient()

  return runDataSourceSync({
    source: DataSource.TSE,
    kind: 'supplemental',
    sourceUrl: `https://dadosabertos.tse.jus.br/dataset/candidatos-${year}`,
    dryRun: options.dryRun,
    store: createPrismaSyncRunStore(options.prisma),
    execute: async ({ runId }) => {
      const resources = (await client.discover(year)).filter((resource) =>
        SUPPLEMENTAL_KINDS.has(resource.kind),
      )
      let recordCount = 0
      let createdDocuments = 0
      let siteChanges = 0
      const socialRows: Array<Record<string, string | null>> = []
      let socialVerifiedAt: Date | null = null
      const candidateIds = options.dryRun
        ? new Map<string, string>()
        : new Map(
            (await options.prisma.candidate.findMany({
              where: { tseId: { not: null } },
              select: { id: true, tseId: true },
            })).flatMap((candidate) => candidate.tseId ? [[candidate.tseId, candidate.id]] : []),
          )

      for (const resource of resources) {
        const downloaded = await client.download(resource)
        const parsedFiles = parseTseTabularArchives(downloaded.bytes)
        const archiveRows = parsedFiles.reduce((total, file) => total + file.rows.length, 0)
        recordCount += archiveRows
        if (resource.kind === TseResourceKind.SOCIAL_MEDIA) {
          for (const file of parsedFiles) {
            assertSocialMediaSchema(file.columns, resource.id)
            socialRows.push(...file.rows)
          }
          if (!socialVerifiedAt || downloaded.fetchedAt > socialVerifiedAt) {
            socialVerifiedAt = downloaded.fetchedAt
          }
        }
        if (options.dryRun) continue

        const archiveMetadata = {
          fileName: parsedFiles[0].fileName,
          fileNames: parsedFiles.map((file) => file.fileName),
          encoding: parsedFiles[0].encoding,
          recordCount: archiveRows,
          columns: [...new Set(parsedFiles.flatMap((file) => file.columns))],
        }

        const sourceDocument = await options.prisma.sourceDocument.upsert({
          where: { sha256: downloaded.sha256 },
          update: {
            sourceUrl: resource.url,
            fetchedAt: downloaded.fetchedAt,
            syncRunId: runId,
            metadata: {
              resourceId: resource.id,
              resourceName: resource.name,
              datasetKind: resource.kind,
              ...archiveMetadata,
            },
          },
          create: {
            source: DataSource.TSE,
            type: SourceDocumentType.TSE_RESOURCE,
            sourceUrl: resource.url,
            sha256: downloaded.sha256,
            contentType: 'application/zip',
            fetchedAt: downloaded.fetchedAt,
            extractionStatus: DocumentExtractionStatus.EXTRACTED,
            syncRunId: runId,
            metadata: {
              resourceId: resource.id,
              resourceName: resource.name,
              datasetKind: resource.kind,
              ...archiveMetadata,
            },
          },
          select: { id: true },
        })
        createdDocuments++

        // Um recurso pode trazer um CSV consolidado ou um por UF. Percorrer
        // arquivo a arquivo mantém o pico de memória no tamanho de um CSV.
        for (const parsed of parsedFiles) {
          for (let offset = 0; offset < parsed.rows.length; offset += batchSize) {
            const batch = parsed.rows.slice(offset, offset + batchSize)
            const records = batch.map((row) => ({
              source: DataSource.TSE,
              datasetKind: resource.kind,
              externalId: stableExternalId(resource.kind, row),
              electionYear: electionYear(row),
              payload: row as Prisma.InputJsonObject,
              candidateId: row.SQ_CANDIDATO ? candidateIds.get(row.SQ_CANDIDATO) ?? null : null,
              sourceDocumentId: sourceDocument.id,
              syncRunId: runId,
            }))
            await options.prisma.officialDatasetRecord.createMany({
              data: records,
              skipDuplicates: true,
            })
            const externalIds = records.map((record) => record.externalId)
            await options.prisma.officialDatasetRecord.updateMany({
              where: {
                source: DataSource.TSE,
                datasetKind: resource.kind,
                externalId: { in: externalIds },
              },
              data: { sourceDocumentId: sourceDocument.id, syncRunId: runId },
            })

            // If supplemental data arrived before canonical candidacies, repair
            // only archive rows that still have no Candidate link.
            const unlinked = await options.prisma.officialDatasetRecord.findMany({
              where: {
                source: DataSource.TSE,
                datasetKind: resource.kind,
                externalId: { in: externalIds },
                candidateId: null,
              },
              select: { externalId: true },
            })
            const candidateIdByExternalId = new Map(
              records.flatMap((record) => record.candidateId
                ? [[record.externalId, record.candidateId] as const]
                : []),
            )
            const externalIdsByCandidate = new Map<string, string[]>()
            for (const record of unlinked) {
              const candidateId = candidateIdByExternalId.get(record.externalId)
              if (!candidateId) continue
              externalIdsByCandidate.set(candidateId, [
                ...(externalIdsByCandidate.get(candidateId) ?? []),
                record.externalId,
              ])
            }
            await runTransactionsInBatches(
              options.prisma,
              [...externalIdsByCandidate].map(([candidateId, ids]) =>
                options.prisma.officialDatasetRecord.updateMany({
                  where: {
                    source: DataSource.TSE,
                    datasetKind: resource.kind,
                    externalId: { in: ids },
                    candidateId: null,
                  },
                  data: { candidateId },
                }),
              ),
            )
          }
          // As redes sociais são reconciliadas depois, uma única vez, com as
          // linhas acumuladas de todos os arquivos do recurso.
          if (resource.kind !== TseResourceKind.SOCIAL_MEDIA) {
            await materializeResource(
              options.prisma,
              resource.kind,
              parsed.rows,
              resource.url,
              year,
              downloaded.fetchedAt,
            )
          }
        }
      }

      if (!options.dryRun && socialVerifiedAt) {
        siteChanges = await reconcileCandidateSites(
          options.prisma,
          socialRows,
          year,
          socialVerifiedAt,
        )
      }

      if (!options.dryRun && (recordCount > 0 || siteChanges > 0)) {
        await invalidateApiCandidateCaches()
        const touchedCandidates = await options.prisma.candidate.findMany({
          where: {
            id: { in: [...candidateIds.values()] },
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
        noop: resources.length === 0,
        metrics: {
          resources: resources.length,
          records: recordCount,
          sourceDocuments: createdDocuments,
          siteChanges,
        },
      }
    },
  })
}

export async function syncTseSupplemental(
  year = 2026,
  dryRun = false,
): Promise<CompletedSyncRun> {
  const prisma = createScraperPrismaClient()
  try {
    logger.info(`[tse-supplemental] Starting official supplemental sync for ${year}`)
    const result = await runTseSupplementalSync({ prisma, year, dryRun })
    logger.info('[tse-supplemental] Official supplemental sync complete', result)
    return result
  } finally {
    await prisma.$disconnect()
  }
}

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run')
  const yearArg = process.argv.find((argument) => /^--year=\d{4}$/.test(argument))
  const year = yearArg ? Number(yearArg.split('=')[1]) : 2026
  syncTseSupplemental(year, dryRun).catch((error) => {
    logger.error('[tse-supplemental] Fatal error', error)
    process.exit(1)
  })
}
