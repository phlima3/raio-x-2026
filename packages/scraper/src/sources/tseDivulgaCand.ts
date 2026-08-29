import { createScraperPrismaClient } from '../utils/prisma'
import 'dotenv/config'
import { createHash } from 'node:crypto'
import {
  DataSource,
  DocumentExtractionStatus,
  Position,
  Prisma,
  SourceDocumentType,
  type PrismaClient,
} from '@prisma/client'

import { extractPdfText } from '../documents/pdfText'
import {
  createPrismaSyncRunStore,
  runDataSourceSync,
  type CompletedSyncRun,
} from '../sync/runDataSourceSync'
import { invalidateApiCandidateCaches } from '../utils/invalidateApiCache'
import { logger } from '../utils/logger'
import { revalidateCandidatePages } from '../utils/revalidateWeb'
import { tseBrowserEnabled } from './tse/browserTransport'
import {
  createBrowserDivulgaCandHttpPort,
  type DisposableDivulgaCandHttpPort,
} from './tse/divulgaCandBrowserPort'
import {
  configuredElectionId,
  createDivulgaCandClient,
  DivulgaCandError,
  parseDivulgaCandUrl,
  targetForCandidate,
  type DivulgaCandCandidate,
  type DivulgaCandClient,
  type DivulgaCandTarget,
} from './tse/divulgaCand'

export const DIVULGACAND_DATASET_KIND = 'DIVULGACAND_CANDIDATURA'

type PdfTextExtractor = (bytes: Buffer) => Promise<string>

export interface RunDivulgaCandSyncOptions {
  prisma: PrismaClient
  client?: DivulgaCandClient
  year?: number
  electionId?: string
  /** Cargos varridos quando nenhuma URL explícita é passada. */
  positions?: Position[]
  /** URLs públicas do DivulgaCandContas; sobrepõem a varredura por cargo. */
  urls?: string[]
  tseIds?: string[]
  limit?: number
  dryRun?: boolean
  extractText?: PdfTextExtractor
}

export interface CandidateRow {
  id: string
  tseId: string | null
  name: string
  slug: string | null
  party: string
  state: string
  position: Position
  ballotNumber: number | null
  siteUrl: string | null
  electionYear: number
}

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex')
}

function looksLikePdf(bytes: Buffer): boolean {
  return bytes.subarray(0, 5).toString('ascii') === '%PDF-'
}

function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

function effectiveSlug(candidate: CandidateRow): string {
  return candidate.slug ??
    `${slugify(candidate.name)}-${slugify(candidate.party)}-${slugify(candidate.state)}`
}

/**
 * O que fica gravado como registro oficial da candidatura: só os links e os
 * anexos, normalizados. Guardar o JSON cru faria o SHA-256 mudar a cada
 * consulta — o TSE devolve campos voláteis — e cada execução criaria um
 * documento novo para o mesmo conteúdo.
 */
export function divulgaCandLinkPayload(
  detail: DivulgaCandCandidate,
): Prisma.InputJsonObject {
  return {
    electionId: detail.target.electionId,
    electionYear: detail.target.year,
    electoralUnit: detail.target.electoralUnit,
    tseId: detail.tseId,
    ballotName: detail.ballotName,
    fullName: detail.fullName,
    party: detail.party,
    positionLabel: detail.positionLabel,
    statusLabel: detail.statusLabel,
    publicUrl: detail.publicUrl,
    apiUrl: detail.apiUrl,
    sites: detail.sites,
    emails: detail.emails,
    files: detail.files.map((file) => ({
      id: file.id,
      name: file.name,
      kind: file.kind,
      typeCode: file.typeCode,
      typeLabel: file.typeLabel,
      url: file.url,
    })),
  }
}

export async function resolveTargets(
  options: RunDivulgaCandSyncOptions,
  year: number,
  electionId: string,
): Promise<Array<{ target: DivulgaCandTarget; candidate: CandidateRow | null }>> {
  const select = {
    id: true,
    tseId: true,
    name: true,
    slug: true,
    party: true,
    state: true,
    position: true,
    ballotNumber: true,
    siteUrl: true,
    electionYear: true,
  } as const

  if (options.urls?.length) {
    const targets = options.urls.map(parseDivulgaCandUrl)
    const candidates = await options.prisma.candidate.findMany({
      where: { tseId: { in: targets.map((target) => target.candidateId) } },
      select,
    })
    const byTseId = new Map(candidates.map((candidate) => [candidate.tseId, candidate]))
    return targets.map((target) => ({
      target,
      candidate: byTseId.get(target.candidateId) ?? null,
    }))
  }

  const candidates = await options.prisma.candidate.findMany({
    where: {
      electionYear: year,
      isPublished: true,
      tseId: options.tseIds?.length ? { in: options.tseIds } : { not: null },
      ...(options.positions?.length ? { position: { in: options.positions } } : {}),
    },
    select,
    orderBy: { name: 'asc' },
    ...(options.limit ? { take: options.limit } : {}),
  })

  return candidates.flatMap((candidate) => {
    if (!candidate.tseId) return []
    return [{
      candidate,
      target: targetForCandidate({
        tseId: candidate.tseId,
        position: candidate.position,
        state: candidate.state,
        electionYear: candidate.electionYear,
        electionId,
      }),
    }]
  })
}

/**
 * Anexa, candidatura por candidatura, o que o DivulgaCandContas publica: a
 * proposta de governo, os sites declarados e os e-mails de campanha.
 *
 * É o caminho por candidato equivalente ao `sync:documents`, que baixa o ZIP
 * do catálogo inteiro. Os dois convergem: um PDF já importado pelo pacote é
 * reconhecido pelo SHA-256 e só tem o vínculo com a candidatura refeito, em
 * vez de virar um documento duplicado.
 */
export async function runDivulgaCandSync(
  options: RunDivulgaCandSyncOptions,
): Promise<CompletedSyncRun> {
  const year = options.year ?? 2026
  const electionId = options.electionId ?? configuredElectionId()
  const client = options.client ?? createDivulgaCandClient()
  const extractText = options.extractText ?? extractPdfText

  return runDataSourceSync({
    source: DataSource.TSE,
    kind: 'divulgacand-attachments',
    sourceUrl: `https://divulgacandcontas.tse.jus.br/divulga/#/candidato/BR/BR/${electionId}`,
    dryRun: options.dryRun,
    store: createPrismaSyncRunStore(options.prisma),
    execute: async ({ runId }) => {
      const targets = await resolveTargets(options, year, electionId)
      if (targets.length === 0) {
        return { noop: true, metrics: { candidates: 0, documents: 0 } }
      }

      let consulted = 0
      let documents = 0
      let created = 0
      let deduplicated = 0
      let extracted = 0
      let needsOcr = 0
      let sitesLinked = 0
      let unmatched = 0
      let missing = 0
      let ignored = 0
      let failed = 0
      const touchedSlugs = new Set<string>()

      for (const { target, candidate } of targets) {
        if (!candidate) {
          // A criação de candidatura é do snapshot canônico; aqui só se anexa.
          unmatched++
          logger.warn(
            `[divulgacand] ${target.candidateId} não corresponde a nenhuma candidatura importada`,
          )
          continue
        }

        let detail: DivulgaCandCandidate
        try {
          detail = await client.fetchCandidate(target)
        } catch (error) {
          if (error instanceof DivulgaCandError && error.code === 'NOT_FOUND') {
            missing++
            logger.warn(`[divulgacand] ${candidate.name} sem registro em ${target.electionId}`)
            continue
          }
          failed++
          logger.error(
            `[divulgacand] Consulta falhou para ${candidate.name}`,
            error instanceof Error ? error.message : error,
          )
          continue
        }
        consulted++

        const payload = divulgaCandLinkPayload(detail)
        const snapshot = JSON.stringify(payload)
        const snapshotDigest = sha256(snapshot)
        const fetchedAt = new Date()

        if (!options.dryRun) {
          const snapshotData = {
            source: DataSource.TSE,
            type: SourceDocumentType.TSE_RESOURCE,
            sourceUrl: detail.publicUrl,
            contentType: 'application/json',
            fetchedAt,
            text: snapshot,
            extractionStatus: DocumentExtractionStatus.EXTRACTED,
            extractionError: null,
            candidateId: candidate.id,
            syncRunId: runId,
            metadata: {
              datasetKind: DIVULGACAND_DATASET_KIND,
              electionId: target.electionId,
              electoralUnit: target.electoralUnit,
              apiUrl: detail.apiUrl,
            } satisfies Prisma.InputJsonObject,
          }
          const snapshotDocument = await options.prisma.sourceDocument.upsert({
            where: { sha256: snapshotDigest },
            update: snapshotData,
            create: { ...snapshotData, sha256: snapshotDigest },
            select: { id: true },
          })

          const recordData = {
            source: DataSource.TSE,
            datasetKind: DIVULGACAND_DATASET_KIND,
            externalId: `${target.electionId}:${target.candidateId}`,
            electionYear: target.year,
            payload,
            candidateId: candidate.id,
            sourceDocumentId: snapshotDocument.id,
            syncRunId: runId,
          }
          await options.prisma.officialDatasetRecord.upsert({
            where: {
              source_datasetKind_externalId: {
                source: DataSource.TSE,
                datasetKind: DIVULGACAND_DATASET_KIND,
                externalId: recordData.externalId,
              },
            },
            update: recordData,
            create: recordData,
          })
        }

        // O site declarado no DivulgaCandContas só preenche um campo vazio: a
        // reconciliação das redes sociais (sync:tse:supplemental) é a dona do
        // `siteUrl` e escolhe pela ordem declarada pelo próprio candidato.
        const declaredSite = detail.sites[0] ?? null
        if (declaredSite && !candidate.siteUrl) {
          sitesLinked++
          touchedSlugs.add(effectiveSlug(candidate))
          if (!options.dryRun) {
            await options.prisma.candidate.update({
              where: { id: candidate.id },
              data: { siteUrl: declaredSite, materialUpdatedAt: fetchedAt },
            })
          }
        }

        for (const file of detail.files) {
          if (file.kind !== 'CAMPAIGN_PROGRAM') {
            ignored++
            continue
          }

          let bytes: Buffer
          try {
            bytes = await client.downloadFile(file)
          } catch (error) {
            if (error instanceof DivulgaCandError && error.code === 'NOT_FOUND') {
              missing++
              logger.warn(`[divulgacand] Anexo ausente: ${file.url}`)
              continue
            }
            failed++
            logger.error(
              `[divulgacand] Download falhou para ${file.url}`,
              error instanceof Error ? error.message : error,
            )
            continue
          }

          if (!looksLikePdf(bytes)) {
            ignored++
            logger.warn(`[divulgacand] ${file.name} não é PDF; ignorado`)
            continue
          }
          documents++

          const digest = sha256(bytes)
          const existing = await options.prisma.sourceDocument.findUnique({
            where: { sha256: digest },
          })
          if (existing && existing.extractionStatus !== DocumentExtractionStatus.FAILED) {
            // Mesmo PDF já trazido pelo pacote do catálogo: refaz o vínculo com
            // a candidatura, que aqui é conhecido, em vez de duplicar a linha.
            deduplicated++
            if (!options.dryRun) {
              await options.prisma.sourceDocument.update({
                where: { id: existing.id },
                data: {
                  fetchedAt,
                  sourceUrl: file.url,
                  syncRunId: runId,
                  candidateId: candidate.id,
                  metadata: {
                    datasetKind: DIVULGACAND_DATASET_KIND,
                    electionId: target.electionId,
                    filename: file.name,
                    fileId: file.id,
                    fileTypeLabel: file.typeLabel,
                    candidatePage: detail.publicUrl,
                  } satisfies Prisma.InputJsonObject,
                },
              })
            }
            continue
          }

          let text: string | null = null
          let status: DocumentExtractionStatus
          let extractionError: string | null = null
          try {
            const content = (await extractText(bytes)).trim()
            if (content.length === 0) {
              status = DocumentExtractionStatus.NEEDS_OCR
              needsOcr++
            } else {
              text = content
              status = DocumentExtractionStatus.EXTRACTED
              extracted++
            }
          } catch (error) {
            status = DocumentExtractionStatus.FAILED
            extractionError = error instanceof Error ? error.message : String(error)
            failed++
          }

          if (!options.dryRun) {
            const documentData = {
              source: DataSource.TSE,
              type: SourceDocumentType.CAMPAIGN_PROGRAM,
              sourceUrl: file.url,
              contentType: 'application/pdf',
              fetchedAt,
              text,
              extractionStatus: status,
              extractionError,
              candidateId: candidate.id,
              syncRunId: runId,
              metadata: {
                datasetKind: DIVULGACAND_DATASET_KIND,
                electionId: target.electionId,
                filename: file.name,
                fileId: file.id,
                fileTypeLabel: file.typeLabel,
                candidatePage: detail.publicUrl,
              } satisfies Prisma.InputJsonObject,
            }
            await options.prisma.sourceDocument.upsert({
              where: { sha256: digest },
              update: documentData,
              create: { ...documentData, sha256: digest },
            })
          }
          created++
        }
      }

      if (!options.dryRun && touchedSlugs.size > 0) {
        await invalidateApiCandidateCaches()
        await revalidateCandidatePages([...touchedSlugs])
      }

      const metrics = {
        candidates: targets.length,
        consulted,
        documents,
        created,
        deduplicated,
        extracted,
        needsOcr,
        sitesLinked,
        unmatched,
        missing,
        ignored,
        failed,
      }
      // Falha parcial é falha: um presidenciável sem programa por erro de rede
      // fica indistinguível de um que não protocolou nada.
      if (failed > 0) {
        throw new Error(`[divulgacand] ${failed} consulta(s)/anexo(s) falharam`)
      }
      return { noop: consulted === 0, metrics }
    },
  })
}

function parseListFlag(prefix: string): string[] {
  return process.argv
    .filter((argument) => argument.startsWith(prefix))
    .flatMap((argument) => argument.slice(prefix.length).split(','))
    .map((value) => value.trim())
    .filter(Boolean)
}

function parsePositions(): Position[] | undefined {
  const raw = parseListFlag('--position=').map((value) => value.toUpperCase())
  if (raw.length === 0) return undefined
  const invalid = raw.filter((value) => !(value in Position))
  if (invalid.length > 0) throw new Error(`Cargo inválido: ${invalid.join(', ')}`)
  return raw.map((value) => Position[value as keyof typeof Position])
}

export async function syncDivulgaCand(
  options: Omit<RunDivulgaCandSyncOptions, 'prisma'> = {},
): Promise<CompletedSyncRun> {
  const prisma = createScraperPrismaClient()
  // Só na máquina de desenvolvimento, onde o TSE barra cliente automatizado.
  // Em CI `browserPortEnabled()` é falso e o cliente cai no `fetch` puro.
  const browserPort: DisposableDivulgaCandHttpPort | null =
    !options.client && tseBrowserEnabled() ? createBrowserDivulgaCandHttpPort() : null
  try {
    logger.info('[divulgacand] Iniciando anexação por candidatura', {
      year: options.year ?? 2026,
      electionId: options.electionId ?? configuredElectionId(),
      positions: options.positions,
      urls: options.urls?.length ?? 0,
      transport: browserPort ? 'browser' : 'fetch',
    })
    const result = await runDivulgaCandSync({
      prisma,
      ...options,
      client: options.client ??
        (browserPort ? createDivulgaCandClient({ http: browserPort }) : undefined),
    })
    logger.info('[divulgacand] Concluído', result)
    return result
  } finally {
    await browserPort?.dispose()
    await prisma.$disconnect()
  }
}

if (require.main === module) {
  const yearArgument = process.argv.find((argument) => /^--year=\d{4}$/.test(argument))
  const electionArgument = process.argv.find((argument) => /^--election=\d+$/.test(argument))
  const limitArgument = process.argv.find((argument) => /^--limit=\d+$/.test(argument))
  const urls = parseListFlag('--url=')

  syncDivulgaCand({
    dryRun: process.argv.includes('--dry-run'),
    year: yearArgument ? Number(yearArgument.split('=')[1]) : undefined,
    electionId: electionArgument?.split('=')[1],
    limit: limitArgument ? Number(limitArgument.split('=')[1]) : undefined,
    urls: urls.length > 0 ? urls : undefined,
    tseIds: parseListFlag('--tse-id=').length > 0 ? parseListFlag('--tse-id=') : undefined,
    // Sem cargo explícito o alvo é a eleição presidencial, que é onde o
    // programa de governo é obrigatório e onde a cobertura importa hoje.
    positions: urls.length > 0
      ? undefined
      : parsePositions() ?? [Position.PRESIDENTE, Position.VICE_PRESIDENTE],
  }).catch((error) => {
    logger.error('[divulgacand] Erro fatal', error)
    process.exit(1)
  })
}
