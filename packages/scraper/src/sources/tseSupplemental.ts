import 'dotenv/config'
import { createHash } from 'node:crypto'
import {
  DataSource,
  DocumentExtractionStatus,
  OfficialCandidacyStatus,
  Position,
  Prisma,
  PrismaClient,
  SourceDocumentType,
} from '@prisma/client'

import {
  createPrismaSyncRunStore,
  runDataSourceSync,
  type CompletedSyncRun,
} from '../sync/runDataSourceSync'
import { logger } from '../utils/logger'
import {
  createTseCkanClient,
  TseResourceKind,
  type TseCkanClient,
} from './tse/ckanClient'
import { parseTseTabularArchive } from './tse/tabularArchive'

const SUPPLEMENTAL_KINDS = new Set<TseResourceKind>([
  TseResourceKind.CANDIDATE_COMPLEMENT,
  TseResourceKind.ASSETS,
  TseResourceKind.COALITIONS,
  TseResourceKind.VACANCIES,
  TseResourceKind.CASSATIONS,
  TseResourceKind.SOCIAL_MEDIA,
])

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

function normalizedStatus(value: string): OfficialCandidacyStatus {
  const token = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
  if (token.includes('INAPTO') || token.includes('INDEFERIDO')) return OfficialCandidacyStatus.INELIGIBLE
  if (token.includes('CASSA') || token.includes('CANCEL') || token.includes('RENUNC')) {
    return OfficialCandidacyStatus.CANCELLED
  }
  if (token.includes('PENDENTE') || token.includes('AGUARDANDO')) return OfficialCandidacyStatus.PENDING
  if (token === 'APTO' || token.includes('DEFERIDO')) return OfficialCandidacyStatus.ELIGIBLE
  return OfficialCandidacyStatus.UNKNOWN
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

async function materializeResource(
  prisma: PrismaClient,
  kind: TseResourceKind,
  rows: Array<Record<string, string | null>>,
  sourceUrl: string,
  year: number,
): Promise<void> {
  if (kind === TseResourceKind.CANDIDATE_COMPLEMENT) {
    for (const row of rows) {
      const tseId = row.SQ_CANDIDATO
      const status = row.DS_SITUACAO_CANDIDATO_TOT
        ?? row.DS_SITUACAO_CANDIDATO_PLEITO
        ?? row.DS_SITUACAO_JULGAMENTO
      if (!tseId || !status) continue
      const officialStatus = normalizedStatus(status)
      await prisma.candidate.updateMany({
        where: { tseId },
        data: {
          officialStatusRaw: status,
          officialStatus,
          ...(officialStatus === OfficialCandidacyStatus.CANCELLED
            || officialStatus === OfficialCandidacyStatus.INELIGIBLE
            ? { isPublished: false }
            : {}),
        },
      })
    }
  }

  if (kind === TseResourceKind.ASSETS) {
    const grouped = new Map<string, Array<Record<string, string | null>>>()
    for (const row of rows) {
      if (!row.SQ_CANDIDATO) continue
      const key = `${row.SQ_CANDIDATO}:${electionYear(row) ?? year}`
      grouped.set(key, [...(grouped.get(key) ?? []), row])
    }
    for (const [key, assets] of grouped) {
      const [tseId, rowYear] = key.split(':')
      const candidate = await prisma.candidate.findUnique({ where: { tseId }, select: { id: true } })
      if (!candidate) continue
      const totalValue = assets.reduce(
        (total, asset) => total.plus(decimalValue(asset.VR_BEM_CANDIDATO)),
        new Prisma.Decimal(0),
      )
      await prisma.assetDeclaration.upsert({
        where: { candidateId_year: { candidateId: candidate.id, year: Number(rowYear) } },
        update: { totalValue, sourceUrl, assets: assets as Prisma.InputJsonArray },
        create: {
          candidateId: candidate.id,
          year: Number(rowYear),
          totalValue,
          sourceUrl,
          assets: assets as Prisma.InputJsonArray,
        },
      })
    }
  }

  if (kind === TseResourceKind.COALITIONS) {
    for (const row of rows) {
      const position = positionFromTse(row.DS_CARGO)
      const coalitionName = row.NM_COLIGACAO
      if (!position || !coalitionName || !row.SG_UF || !row.SG_PARTIDO) continue
      await prisma.candidate.updateMany({
        where: {
          electionYear: electionYear(row) ?? year,
          position,
          state: row.SG_UF,
          party: row.SG_PARTIDO,
        },
        data: { coalitionName },
      })
    }
  }

  if (kind === TseResourceKind.CASSATIONS) {
    for (const row of rows) {
      if (!row.SQ_CANDIDATO) continue
      await prisma.candidate.updateMany({
        where: { tseId: row.SQ_CANDIDATO },
        data: {
          officialStatus: OfficialCandidacyStatus.CANCELLED,
          officialStatusRaw: row.DS_MOTIVO ?? 'CASSAÇÃO',
          isPublished: false,
        },
      })
    }
  }

  if (kind === TseResourceKind.SOCIAL_MEDIA) {
    for (const row of rows) {
      if (!row.SQ_CANDIDATO || !row.DS_URL || !/^https?:\/\//i.test(row.DS_URL)) continue
      await prisma.candidate.updateMany({
        where: { tseId: row.SQ_CANDIDATO, siteUrl: null },
        data: { siteUrl: row.DS_URL },
      })
    }
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

      for (const resource of resources) {
        const downloaded = await client.download(resource)
        const parsed = parseTseTabularArchive(downloaded.bytes)
        recordCount += parsed.rows.length
        if (options.dryRun) continue

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
              fileName: parsed.fileName,
              encoding: parsed.encoding,
              recordCount: parsed.rows.length,
              columns: parsed.columns,
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
              fileName: parsed.fileName,
              encoding: parsed.encoding,
              recordCount: parsed.rows.length,
              columns: parsed.columns,
            },
          },
          select: { id: true },
        })
        createdDocuments++

        const candidateIds = new Map(
          (await options.prisma.candidate.findMany({
            where: { tseId: { not: null } },
            select: { id: true, tseId: true },
          })).flatMap((candidate) => candidate.tseId ? [[candidate.tseId, candidate.id]] : []),
        )
        for (let offset = 0; offset < parsed.rows.length; offset += batchSize) {
          const batch = parsed.rows.slice(offset, offset + batchSize)
          await options.prisma.$transaction(batch.map((row) =>
            options.prisma.officialDatasetRecord.upsert({
              where: {
                source_datasetKind_externalId: {
                  source: DataSource.TSE,
                  datasetKind: resource.kind,
                  externalId: stableExternalId(resource.kind, row),
                },
              },
              update: {
                electionYear: electionYear(row),
                payload: row as Prisma.InputJsonObject,
                candidateId: row.SQ_CANDIDATO ? candidateIds.get(row.SQ_CANDIDATO) ?? null : null,
                sourceDocumentId: sourceDocument.id,
                syncRunId: runId,
              },
              create: {
                source: DataSource.TSE,
                datasetKind: resource.kind,
                externalId: stableExternalId(resource.kind, row),
                electionYear: electionYear(row),
                payload: row as Prisma.InputJsonObject,
                candidateId: row.SQ_CANDIDATO ? candidateIds.get(row.SQ_CANDIDATO) ?? null : null,
                sourceDocumentId: sourceDocument.id,
                syncRunId: runId,
              },
            }),
          ))
        }
        await materializeResource(options.prisma, resource.kind, parsed.rows, resource.url, year)
      }

      return {
        noop: resources.length === 0,
        metrics: {
          resources: resources.length,
          records: recordCount,
          sourceDocuments: createdDocuments,
        },
      }
    },
  })
}

export async function syncTseSupplemental(
  year = 2026,
  dryRun = false,
): Promise<CompletedSyncRun> {
  const prisma = new PrismaClient()
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
