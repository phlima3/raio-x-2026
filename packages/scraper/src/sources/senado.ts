import 'dotenv/config'
import axios, { AxiosError, type AxiosInstance } from 'axios'
import {
  DataSource,
  MandateHouse,
  Prisma,
  PrismaClient,
  ProposalStatus,
  VoteType,
} from '@prisma/client'

import { upsertLegislatorMandate, type LegislatorMandateIds } from '../legislative/persistence'
import {
  createPrismaSyncRunStore,
  runDataSourceSync,
  type CompletedSyncRun,
} from '../sync/runDataSourceSync'
import { logger } from '../utils/logger'

export interface SenadoHttpPort {
  get<T>(
    url: string,
    config?: { params?: Record<string, unknown> },
  ): Promise<{ data: T; headers?: unknown }>
}

interface SenadoListaAtualResponse {
  ListaParlamentarEmExercicio?: {
    Parlamentares?: {
      Parlamentar?: SenadoParlamentarSummaryRaw | SenadoParlamentarSummaryRaw[]
    }
  }
}

interface SenadoDetalheResponse {
  DetalheParlamentar?: {
    Parlamentar?: {
      IdentificacaoParlamentar?: SenadoIdentificacao
    }
  }
}

interface SenadoMandatosResponse {
  MandatoParlamentar?: {
    Parlamentar?: {
      Mandatos?: {
        Mandato?: SenadoMandatoRaw | SenadoMandatoRaw[]
      }
    }
  }
}

interface SenadoIdentificacao {
  CodigoParlamentar: string
  NomeCompletoParlamentar?: string
  NomeParlamentar: string
  SiglaPartidoParlamentar: string
  UfParlamentar: string
  UrlFotoParlamentar?: string
  UrlPaginaParlamentar?: string
  EmailParlamentar?: string
  SiteParlamentar?: string
}

interface SenadoParlamentarSummaryRaw {
  IdentificacaoParlamentar: SenadoIdentificacao
}

interface SenadoLegislaturaRaw {
  NumeroLegislatura?: string
  DataInicio?: string
  DataFim?: string
}

interface SenadoMandatoRaw {
  CodigoMandato?: string
  UfParlamentar?: string
  PrimeiraLegislaturaDoMandato?: SenadoLegislaturaRaw
  SegundaLegislaturaDoMandato?: SenadoLegislaturaRaw
}

interface SenadoProcessoRaw {
  id?: number
  codigoMateria?: number
  identificacao?: string
  ementa?: string
  dataApresentacao?: string
  situacaoAtual?: string
  tipoDocumento?: string
  urlDocumento?: string
}

interface SenadoVotoRaw {
  codigoParlamentar?: number
  siglaVotoParlamentar?: string
}

interface SenadoVotacaoRaw {
  idProcesso?: number
  codigoMateria?: number
  codigoSessao?: number
  codigoSessaoVotacao?: number
  dataApresentacao?: string
  dataSessao?: string
  descricaoVotacao?: string
  identificacao?: string
  ementa?: string
  resultadoVotacao?: string
  sigla?: string
  votos?: SenadoVotoRaw | SenadoVotoRaw[]
}

export interface SenadoParlamentarSummary {
  codigo: string
  nome: string
  partido: string
  uf: string
  fotoUrl: string | null
  email: string | null
}

export interface SenadoParlamentarDetail extends SenadoParlamentarSummary {
  nomeCompleto: string
  siteUrl: string | null
  sourceUrl: string
}

export interface SenadoMandate {
  legislatureId: string
  startDate: Date | null
  endDate: Date | null
}

export interface SenadoVotacao {
  externalId: string
  processId: string
  materiaId: string | null
  dataSessao: string
  dataApresentacao: string | null
  descricao: string
  identificacao: string
  ementa: string | null
  resultado: string | null
  voto: string
  session: string | null
}

export interface SenadoMateria {
  codigo: string
  materiaId: string | null
  titulo: string
  ementa: string
  dataApresentacao: string | null
  situacao: string | null
  tipo: string | null
  url: string
}

export interface VotacoesSenadoFilters {
  /** ISO date YYYY-MM-DD; legacy YYYYMMDD input is normalized for compatibility. */
  dataInicio?: string
  /** ISO date YYYY-MM-DD; legacy YYYYMMDD input is normalized for compatibility. */
  dataFim?: string
}

interface SenadoPage<T> {
  dados: T[]
  links?: Array<{ rel: string; href: string }>
}

const DEFAULT_BASE_URL = 'https://legis.senado.leg.br/dadosabertos'
const DAILY_LOOKBACK_DAYS = 7

const sleep = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve()

function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return []
  return Array.isArray(value) ? value : [value]
}

function normalizeIsoDate(value: string | undefined): string | undefined {
  if (!value) return undefined
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
  }
  return value
}

function rollingDateFrom(syncDate: Date): string {
  const from = new Date(syncDate)
  from.setUTCDate(from.getUTCDate() - DAILY_LOOKBACK_DAYS)
  return from.toISOString().slice(0, 10)
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 1_000,
): Promise<T> {
  let lastError: unknown

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      const status = error instanceof AxiosError ? error.response?.status : undefined
      if (status !== undefined && status >= 400 && status < 500 && status !== 429) throw error

      if (attempt < maxAttempts - 1) {
        const retryAfter = error instanceof AxiosError
          ? Number(error.response?.headers?.['retry-after'] ?? 0) * 1_000
          : 0
        const delay = Math.max(baseDelayMs * 2 ** attempt, retryAfter)
        logger.warn(
          `[senado] attempt ${attempt + 1}/${maxAttempts} failed, retrying in ${delay}ms`,
          error instanceof Error ? error.message : String(error),
        )
        await sleep(delay)
      }
    }
  }

  throw lastError
}

function readLinkHeader(headers: unknown): unknown {
  if (!headers || typeof headers !== 'object') return undefined
  return (headers as Record<string, unknown>).link
}

function parseHeaderNext(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const match = value.match(/<([^>]+)>\s*;\s*rel=["']?next["']?/i)
  return match?.[1]
}

/**
 * The modern Senado endpoints currently return one JSON array. This collector
 * also follows body or RFC 8288 next links so deployments that paginate cannot
 * be silently truncated.
 */
export async function collectSenadoPages<T>(
  client: SenadoHttpPort,
  initialUrl: string,
  params?: Record<string, unknown>,
): Promise<T[]> {
  const rows: T[] = []
  const visited = new Set<string>()
  let url: string | undefined = initialUrl
  let firstRequest = true

  while (url) {
    if (visited.has(url)) throw new Error(`[senado] Pagination loop detected at ${url}`)
    visited.add(url)
    if (visited.size > 10_000) throw new Error('[senado] Pagination exceeded 10,000 pages')

    const response = await withRetry(() =>
      client.get<T[] | SenadoPage<T>>(url as string, firstRequest ? { params } : undefined),
    )
    if (Array.isArray(response.data)) {
      rows.push(...response.data)
      url = parseHeaderNext(readLinkHeader(response.headers))
    } else {
      rows.push(...response.data.dados)
      url = response.data.links?.find((link) => link.rel.toLowerCase() === 'next')?.href
        ?? parseHeaderNext(readLinkHeader(response.headers))
    }
    firstRequest = false
  }

  return rows
}

function createClient(): AxiosInstance {
  const client = axios.create({
    baseURL: process.env.SENADO_API_URL ?? DEFAULT_BASE_URL,
    headers: {
      Accept: 'application/json',
      'User-Agent': 'RaioX2026Bot/1.0 (https://raiox2026.com.br)',
    },
    timeout: 15_000,
  })
  client.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
      logger.error(
        `[senado] HTTP ${error.response?.status ?? 'network'} on ${error.config?.url}`,
        error.message,
      )
      return Promise.reject(error)
    },
  )
  return client
}

const http = createClient()

const VOTE_MAP: Record<string, VoteType> = {
  sim: VoteType.YES,
  não: VoteType.NO,
  nao: VoteType.NO,
  abstenção: VoteType.ABSTENTION,
  abstencao: VoteType.ABSTENTION,
  'p-nrv': VoteType.OBSTRUCTION,
  'p nrv': VoteType.OBSTRUCTION,
  'art. 17': VoteType.OBSTRUCTION,
  obstrução: VoteType.OBSTRUCTION,
  obstrucao: VoteType.OBSTRUCTION,
}

function mapVoteType(value: string): VoteType {
  return VOTE_MAP[value.trim().toLowerCase()] ?? VoteType.ABSENT
}

function mapProposalStatus(value: string): ProposalStatus {
  const status = value.toLowerCase()
  if (status.includes('aprovad') || status.includes('transform') || status.includes('sancionad')) {
    return ProposalStatus.APPROVED
  }
  if (status.includes('rejeitad') || status.includes('prejudicad')) return ProposalStatus.REJECTED
  if (status.includes('arquivad')) return ProposalStatus.ARCHIVED
  if (status.includes('plenário') || status.includes('votação')) return ProposalStatus.VOTED
  if (status.includes('comissão') || status.includes('relator') || status.includes('tramitação')) {
    return ProposalStatus.IN_COMMITTEE
  }
  return ProposalStatus.SUBMITTED
}

export async function getSenadores(
  client: SenadoHttpPort = http,
): Promise<SenadoParlamentarSummary[]> {
  const response = await withRetry(() =>
    client.get<SenadoListaAtualResponse>('/senador/lista/atual'),
  )
  return toArray(
    response.data.ListaParlamentarEmExercicio?.Parlamentares?.Parlamentar,
  ).map(({ IdentificacaoParlamentar: identity }) => ({
    codigo: identity.CodigoParlamentar,
    nome: identity.NomeParlamentar,
    partido: identity.SiglaPartidoParlamentar,
    uf: identity.UfParlamentar,
    fotoUrl: identity.UrlFotoParlamentar ?? null,
    email: identity.EmailParlamentar ?? null,
  }))
}

export async function getSenadoreById(
  codigo: string,
  client: SenadoHttpPort = http,
): Promise<SenadoParlamentarDetail> {
  const response = await withRetry(() =>
    client.get<SenadoDetalheResponse>(`/senador/${codigo}`),
  )
  const identity = response.data.DetalheParlamentar?.Parlamentar?.IdentificacaoParlamentar
  if (!identity) throw new Error(`[senado] Missing details for senator ${codigo}`)
  const sourceUrl = identity.UrlPaginaParlamentar
    ?? `https://www25.senado.leg.br/web/senadores/senador/-/perfil/${codigo}`
  return {
    codigo: identity.CodigoParlamentar,
    nome: identity.NomeParlamentar,
    nomeCompleto: identity.NomeCompletoParlamentar ?? identity.NomeParlamentar,
    partido: identity.SiglaPartidoParlamentar,
    uf: identity.UfParlamentar,
    fotoUrl: identity.UrlFotoParlamentar ?? null,
    email: identity.EmailParlamentar ?? null,
    siteUrl: identity.SiteParlamentar ?? null,
    sourceUrl,
  }
}

export async function getMandatoAtual(
  codigo: string,
  client: SenadoHttpPort = http,
  now = new Date(),
): Promise<SenadoMandate> {
  const response = await withRetry(() =>
    client.get<SenadoMandatosResponse>(`/senador/${codigo}/mandatos`, { params: { v: 5 } }),
  )
  const legislatures = toArray(
    response.data.MandatoParlamentar?.Parlamentar?.Mandatos?.Mandato,
  ).flatMap((mandate) => [
    mandate.PrimeiraLegislaturaDoMandato,
    mandate.SegundaLegislaturaDoMandato,
  ]).filter((legislature): legislature is SenadoLegislaturaRaw => Boolean(legislature))
    .map((legislature) => ({
      legislatureId: legislature.NumeroLegislatura ?? 'unknown',
      startDate: parseDate(legislature.DataInicio),
      endDate: parseDate(legislature.DataFim),
    }))

  const current = legislatures.find((legislature) =>
    (!legislature.startDate || legislature.startDate <= now)
    && (!legislature.endDate || legislature.endDate >= now),
  )
  const latest = [...legislatures].sort(
    (left, right) => (right.startDate?.getTime() ?? 0) - (left.startDate?.getTime() ?? 0),
  )[0]
  return current ?? latest ?? { legislatureId: 'unknown', startDate: null, endDate: null }
}

export async function getMateriasBySenador(
  codigo: string,
  filters: VotacoesSenadoFilters = {},
  client: SenadoHttpPort = http,
): Promise<SenadoMateria[]> {
  const raw = await collectSenadoPages<SenadoProcessoRaw>(client, '/processo', {
    codigoParlamentarAutor: Number(codigo),
    ...(filters.dataInicio && { dataInicioApresentacao: normalizeIsoDate(filters.dataInicio) }),
    ...(filters.dataFim && { dataFimApresentacao: normalizeIsoDate(filters.dataFim) }),
    v: 1,
  })
  return raw.flatMap((process) => {
    if (process.id == null) return []
    const processId = String(process.id)
    return [{
      codigo: processId,
      materiaId: process.codigoMateria == null ? null : String(process.codigoMateria),
      titulo: process.identificacao ?? `Processo ${processId}`,
      ementa: process.ementa ?? '',
      dataApresentacao: process.dataApresentacao ?? null,
      situacao: process.situacaoAtual ?? null,
      tipo: process.tipoDocumento ?? null,
      url: process.codigoMateria == null
        ? (process.urlDocumento ?? `${DEFAULT_BASE_URL}/processo/${processId}`)
        : `https://www25.senado.leg.br/web/atividade/materias/-/materia/${process.codigoMateria}`,
    }]
  })
}

export async function getVotacoesBySenador(
  codigo: string,
  filters: VotacoesSenadoFilters = {},
  client: SenadoHttpPort = http,
): Promise<SenadoVotacao[]> {
  const raw = await collectSenadoPages<SenadoVotacaoRaw>(client, '/votacao', {
    codigoParlamentar: Number(codigo),
    ...(filters.dataInicio && { dataInicio: normalizeIsoDate(filters.dataInicio) }),
    ...(filters.dataFim && { dataFim: normalizeIsoDate(filters.dataFim) }),
    v: 1,
  })
  return raw.flatMap((vote) => {
    if (vote.idProcesso == null || !vote.dataSessao) return []
    const individual = toArray(vote.votos).find(
      (candidateVote) => String(candidateVote.codigoParlamentar) === codigo,
    )
    if (!individual?.siglaVotoParlamentar) return []
    const processId = String(vote.idProcesso)
    const sessionVote = vote.codigoSessaoVotacao ?? vote.codigoSessao
    if (sessionVote == null) return []
    return [{
      externalId: `${sessionVote}:${processId}`,
      processId,
      materiaId: vote.codigoMateria == null ? null : String(vote.codigoMateria),
      dataSessao: vote.dataSessao,
      dataApresentacao: vote.dataApresentacao ?? null,
      descricao: vote.descricaoVotacao ?? vote.identificacao ?? `Processo ${processId}`,
      identificacao: vote.identificacao ?? `Processo ${processId}`,
      ementa: vote.ementa ?? null,
      resultado: vote.resultadoVotacao ?? null,
      voto: individual.siglaVotoParlamentar,
      session: vote.codigoSessao == null ? null : String(vote.codigoSessao),
    }]
  })
}

async function saveSenador(
  prisma: PrismaClient,
  detail: SenadoParlamentarDetail,
  mandate: SenadoMandate,
  syncedAt: Date,
): Promise<LegislatorMandateIds> {
  return upsertLegislatorMandate(prisma, {
    source: DataSource.SENADO,
    house: MandateHouse.SENADO,
    externalId: detail.codigo,
    legislatureId: mandate.legislatureId,
    name: detail.nomeCompleto,
    socialName: detail.nome,
    party: detail.partido,
    state: detail.uf,
    role: 'SENADOR',
    sourceUrl: detail.sourceUrl,
    syncedAt,
    startDate: mandate.startDate,
    endDate: mandate.endDate,
    isCurrent: true,
  })
}

async function upsertBill(
  prisma: PrismaClient,
  input: {
    processId: string
    materiaId: string | null
    title: string
    description: string | null
    status: ProposalStatus
    introducedAt: Date | null
    url?: string
    tags?: string[]
  },
): Promise<{ id: string }> {
  const url = input.url ?? (input.materiaId
    ? `https://www25.senado.leg.br/web/atividade/materias/-/materia/${input.materiaId}`
    : `${DEFAULT_BASE_URL}/processo/${input.processId}`)
  return prisma.legislativeBill.upsert({
    where: {
      source_externalId: { source: DataSource.SENADO, externalId: input.processId },
    },
    update: {
      title: input.title,
      description: input.description,
      status: input.status,
      introducedAt: input.introducedAt,
      url,
      tags: input.tags ?? [],
    },
    create: {
      source: DataSource.SENADO,
      externalId: input.processId,
      title: input.title,
      description: input.description,
      status: input.status,
      introducedAt: input.introducedAt,
      url,
      tags: input.tags ?? [],
    },
    select: { id: true },
  })
}

async function saveMaterias(
  prisma: PrismaClient,
  mandateId: string,
  materias: SenadoMateria[],
): Promise<number> {
  for (const materia of materias) {
    const bill = await upsertBill(prisma, {
      processId: materia.codigo,
      materiaId: materia.materiaId,
      title: materia.titulo,
      description: materia.ementa || null,
      status: mapProposalStatus(materia.situacao ?? ''),
      introducedAt: parseDate(materia.dataApresentacao ?? undefined),
      url: materia.url,
      tags: materia.tipo ? [materia.tipo] : [],
    })
    await prisma.legislativeBillAuthor.upsert({
      where: {
        legislativeBillId_mandateId: {
          legislativeBillId: bill.id,
          mandateId,
        },
      },
      update: {},
      create: { legislativeBillId: bill.id, mandateId },
    })
  }
  return materias.length
}

async function saveVotacoes(
  prisma: PrismaClient,
  ids: LegislatorMandateIds,
  votacoes: SenadoVotacao[],
): Promise<number> {
  let processed = 0
  for (const vote of votacoes) {
    const bill = await upsertBill(prisma, {
      processId: vote.processId,
      materiaId: vote.materiaId,
      title: vote.identificacao,
      description: vote.ementa,
      status: mapProposalStatus(vote.resultado ?? 'votação'),
      introducedAt: parseDate(vote.dataApresentacao ?? undefined),
      tags: [],
    })
    const votedAt = parseDate(vote.dataSessao)
    if (!votedAt) continue
    await prisma.votingRecord.upsert({
      where: {
        source_externalId_mandateId: {
          source: 'senado',
          externalId: vote.externalId,
          mandateId: ids.mandateId,
        },
      },
      update: {
        proposalName: vote.descricao.slice(0, 500),
        voteType: mapVoteType(vote.voto),
        votedAt,
        session: vote.session,
        personId: ids.personId,
        legislativeBillId: bill.id,
      },
      create: {
        externalId: vote.externalId,
        source: 'senado',
        proposalName: vote.descricao.slice(0, 500),
        proposalUrl: vote.materiaId
          ? `https://www25.senado.leg.br/web/atividade/materias/-/materia/${vote.materiaId}`
          : null,
        voteType: mapVoteType(vote.voto),
        votedAt,
        session: vote.session,
        personId: ids.personId,
        mandateId: ids.mandateId,
        legislativeBillId: bill.id,
      },
    })
    processed++
  }
  return processed
}

export interface RunSenadoSyncOptions {
  prisma: PrismaClient
  client?: SenadoHttpPort
  dateFrom?: string
  dateTo?: string
  pauseMs?: number
  syncDate?: Date
}

export async function runSenadoSync(
  options: RunSenadoSyncOptions,
): Promise<CompletedSyncRun> {
  const client = options.client ?? http
  const syncDate = options.syncDate ?? new Date()
  const dateFrom = normalizeIsoDate(options.dateFrom ?? rollingDateFrom(syncDate))
  const dateTo = normalizeIsoDate(
    options.dateTo ?? syncDate.toISOString().slice(0, 10),
  )
  const pauseMs = options.pauseMs ?? 200

  return runDataSourceSync({
    source: DataSource.SENADO,
    kind: 'legislative',
    sourceUrl: process.env.SENADO_API_URL ?? DEFAULT_BASE_URL,
    store: createPrismaSyncRunStore(options.prisma),
    execute: async () => {
      const senators = await getSenadores(client)
      const concurrency = Math.max(1, Number(process.env.SCRAPER_CONCURRENCY) || 3)
      let synced = 0
      let failed = 0
      let bills = 0
      let votes = 0

      for (let index = 0; index < senators.length; index += concurrency) {
        const batch = senators.slice(index, index + concurrency)
        await Promise.all(batch.map(async (senator) => {
          try {
            const [detail, mandate] = await Promise.all([
              getSenadoreById(senator.codigo, client),
              getMandatoAtual(senator.codigo, client, syncDate),
            ])
            const ids = await saveSenador(options.prisma, detail, mandate, syncDate)
            const filters = { dataInicio: dateFrom, dataFim: dateTo }
            const [materias, votacoes] = await Promise.all([
              getMateriasBySenador(senator.codigo, filters, client),
              getVotacoesBySenador(senator.codigo, filters, client),
            ])
            // Each persistence path opens several Prisma operations. Keeping
            // them sequential per senator avoids exhausting the small
            // production connection pool while senators still run in batches.
            const savedBills = await saveMaterias(options.prisma, ids.mandateId, materias)
            const savedVotes = await saveVotacoes(options.prisma, ids, votacoes)
            bills += savedBills
            votes += savedVotes
            synced++
          } catch (error) {
            failed++
            logger.error(
              `[senado] Failed senator ${senator.codigo} (${senator.nome})`,
              error instanceof Error ? error.message : error,
            )
          }
        }))
        if (index + concurrency < senators.length) await sleep(pauseMs)
      }

      if (failed > 0) throw new Error(`[senado] ${failed} of ${senators.length} legislators failed`)
      return {
        noop: senators.length === 0,
        metrics: {
          legislators: senators.length,
          synced,
          failed,
          bills,
          votes,
        },
      }
    },
  })
}

export async function syncSenado(
  dateFrom?: string,
  dateTo?: string,
): Promise<CompletedSyncRun> {
  const prisma = new PrismaClient()
  try {
    logger.info('[senado] Starting official legislative sync')
    const result = await runSenadoSync({ prisma, dateFrom, dateTo })
    logger.info('[senado] Official legislative sync complete', result)
    return result
  } finally {
    await prisma.$disconnect()
  }
}

if (require.main === module) {
  const from = process.argv.find((argument) => argument.startsWith('--from='))?.split('=')[1]
  const to = process.argv.find((argument) => argument.startsWith('--to='))?.split('=')[1]
  syncSenado(from, to).catch((error) => {
    logger.error('[senado] Fatal error', error)
    process.exit(1)
  })
}
