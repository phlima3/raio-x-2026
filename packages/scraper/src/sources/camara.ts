import 'dotenv/config'
import axios, { AxiosError, AxiosInstance } from 'axios'
import {
  DataSource,
  MandateHouse,
  Prisma,
  PrismaClient,
  ProposalStatus,
  VoteType,
} from '@prisma/client'
import { logger } from '../utils/logger'
import { upsertLegislatorMandate, type LegislatorMandateIds } from '../legislative/persistence'

// ── API response envelope ─────────────────────────────────────────────────────

interface CamaraResponse<T> {
  dados: T
  links: Array<{ rel: string; href: string }>
}

export interface CamaraHttpPort {
  get<T>(url: string, config?: { params?: Record<string, unknown> }): Promise<{ data: T }>
}

// ── API types — /deputados ────────────────────────────────────────────────────

/** Shape returned by GET /deputados (list) */
export interface CamaraDeputadoSummary {
  id: number
  uri: string
  nome: string
  siglaPartido: string
  uriPartido: string
  siglaUf: string
  idLegislatura: number
  urlFoto: string
  email: string
}

/** Shape returned by GET /deputados/{id} */
export interface CamaraDeputadoDetail {
  id: number
  uri: string
  nomeCivil: string
  cpf: string | null
  sexo: string
  urlWebsite: string | null
  redeSocial: string[]
  dataNascimento: string | null
  dataFalecimento: string | null
  ufNascimento: string
  municipioNascimento: string
  escolaridade: string
  ultimoStatus: {
    id: number
    uri: string
    nome: string
    siglaPartido: string
    uriPartido: string
    siglaUf: string
    idLegislatura: number
    urlFoto: string
    email: string
    data: string
    nomeEleitoral: string
    gabinete: {
      nome: string
      predio: string
      sala: string
      andar: string
      telefone: string
      email: string
    } | null
    situacao: string
    condicaoEleitoral: string
    descricaoStatus: string | null
  }
}

// ── API types — /votacoes ─────────────────────────────────────────────────────

/**
 * A voting session returned by GET /votacoes.
 * Note: GET /deputados/{id}/votacoes was removed from the v2 API.
 * Individual votes per deputy are obtained via /votacoes/{id}/votos.
 */
export interface CamaraVotacaoSession {
  id: string
  uri: string
  data: string
  dataHoraRegistro: string
  siglaOrgao: string
  uriOrgao: string
  uriEvento: string | null
  proposicaoObjeto: string | null
  uriProposicaoObjeto: string | null
  descricao: string
  aprovacao: number | null
}

/** Individual vote cast by a deputy in a session (GET /votacoes/{id}/votos) */
export interface CamaraVotoDeputado {
  tipoVoto: string
  dataRegistroVoto: string
  deputado_: {
    id: number
    uri: string
    nome: string
    siglaPartido: string
    uriPartido: string
    siglaUf: string
    idLegislatura: number
    urlFoto: string
    email: string
  }
}

/** Aggregated vote for a specific deputy — used as return type of getVotacoesByDeputado */
export interface CamaraVotacaoDeputado {
  sessionId: string
  data: string
  dataHoraRegistro: string
  siglaOrgao: string
  proposicaoObjeto: string | null
  uriProposicaoObjeto: string | null
  descricao: string
  tipoVoto: string
}

// ── API types — /proposicoes ──────────────────────────────────────────────────

export interface CamaraProposicaoSummary {
  id: number
  uri: string
  siglaTipo: string
  codTipo: number
  numero: number
  ano: number
  ementa: string
  /** Available directly in the list response */
  dataApresentacao: string | null
}

export interface CamaraProposicaoDetail extends CamaraProposicaoSummary {
  urlInteiroTeor: string | null
  ementaDetalhada: string | null
  keywords: string | null
  statusProposicao: {
    dataHora: string | null
    descricaoTramitacao: string
    descricaoSituacao: string
    codSituacao: number
    despacho: string | null
    url: string | null
    ambito: string | null
    apreciacao: string | null
  } | null
}

// ── Filter options ────────────────────────────────────────────────────────────

export interface DeputadoFilters {
  nome?: string
  siglaPartido?: string
  siglaUf?: string
  idLegislatura?: number
  itens?: number
}

export interface VotacoesFilters {
  /** ISO date YYYY-MM-DD */
  dateFrom?: string
  /** ISO date YYYY-MM-DD */
  dateTo?: string
}

// ── Utilities ─────────────────────────────────────────────────────────────────

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Retries `fn` up to `maxAttempts` with exponential backoff.
 * Does not retry on 4xx (except 429).
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 1_000,
): Promise<T> {
  let lastError: unknown

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      const status = err instanceof AxiosError ? err.response?.status : undefined

      if (status !== undefined && status >= 400 && status < 500 && status !== 429) throw err

      if (attempt < maxAttempts - 1) {
        const backoff = baseDelayMs * 2 ** attempt
        const retryAfter = err instanceof AxiosError
          ? Number(err.response?.headers?.['retry-after'] ?? 0) * 1_000
          : 0
        const delay = Math.max(backoff, retryAfter)

        logger.warn(
          `[camara] attempt ${attempt + 1}/${maxAttempts} failed, retrying in ${delay}ms`,
          err instanceof Error ? err.message : String(err),
        )
        await sleep(delay)
      }
    }
  }

  throw lastError
}

export async function collectCamaraPages<T>(
  client: CamaraHttpPort,
  initialUrl: string,
  params?: Record<string, unknown>,
): Promise<T[]> {
  const rows: T[] = []
  const visited = new Set<string>()
  let url: string | undefined = initialUrl
  let firstRequest = true

  while (url) {
    if (visited.has(url)) throw new Error(`[camara] Pagination loop detected at ${url}`)
    visited.add(url)
    if (visited.size > 10_000) throw new Error('[camara] Pagination exceeded 10,000 pages')

    const response = await withRetry(() =>
      client.get<CamaraResponse<T[]>>(url as string, firstRequest ? { params } : undefined),
    )
    rows.push(...response.data.dados)
    url = response.data.links.find((link) => link.rel === 'next')?.href
    firstRequest = false
  }

  return rows
}

// ── HTTP client ───────────────────────────────────────────────────────────────

function createClient(): AxiosInstance {
  const client = axios.create({
    baseURL: process.env.CAMARA_API_URL ?? 'https://dadosabertos.camara.leg.br/api/v2',
    headers: {
      Accept: 'application/json',
      'User-Agent': 'RaioX2026Bot/1.0 (https://raiox2026.com.br)',
    },
    timeout: 15_000,
  })

  client.interceptors.response.use(
    (res) => res,
    (err: AxiosError) => {
      const status = err.response?.status
      const url = err.config?.url
      logger.error(`[camara] HTTP ${status ?? 'network'} on ${url}`, err.message)
      return Promise.reject(err)
    },
  )

  return client
}

// ── Enum mappers ──────────────────────────────────────────────────────────────

const VOTE_MAP: Record<string, VoteType> = {
  sim: VoteType.YES,
  não: VoteType.NO,
  nao: VoteType.NO,
  abstenção: VoteType.ABSTENTION,
  abstencao: VoteType.ABSTENTION,
  obstrução: VoteType.OBSTRUCTION,
  obstrucao: VoteType.OBSTRUCTION,
  'art. 17': VoteType.OBSTRUCTION,
  'artigo 17': VoteType.OBSTRUCTION,
}

function mapVoteType(tipoVoto: string): VoteType {
  return VOTE_MAP[tipoVoto.trim().toLowerCase()] ?? VoteType.ABSENT
}

function mapProposalStatus(situacao: string): ProposalStatus {
  const s = situacao.toLowerCase()
  if (s.includes('aprovad') || s.includes('transform') || s.includes('sancionad')) {
    return ProposalStatus.APPROVED
  }
  if (s.includes('rejeitad') || s.includes('prejudicad')) return ProposalStatus.REJECTED
  if (s.includes('arquivad')) return ProposalStatus.ARCHIVED
  if (s.includes('plenário') || s.includes('votação')) return ProposalStatus.VOTED
  if (s.includes('comissão') || s.includes('relator') || s.includes('tramitação')) {
    return ProposalStatus.IN_COMMITTEE
  }
  if (s.includes('apresentad') || s.includes('aguardando')) return ProposalStatus.SUBMITTED
  return ProposalStatus.DRAFT
}

// ── Module-level singletons ───────────────────────────────────────────────────

const http = createClient()
const prisma = new PrismaClient()

// ── Public API functions ──────────────────────────────────────────────────────

/**
 * Lists deputies with optional filters. Returns up to 100 per the API limit.
 */
export async function getDeputados(
  filters: DeputadoFilters = {},
  client: CamaraHttpPort = http,
): Promise<CamaraDeputadoSummary[]> {
  const { itens = 100, ...params } = filters

  logger.info('[camara] getDeputados', { itens, ...params })

  return collectCamaraPages<CamaraDeputadoSummary>(client, '/deputados', {
    itens: Math.min(itens, 100),
    ...params,
  })
}

/**
 * Returns full details for a single deputy.
 */
export async function getDeputadoById(
  id: number,
  client: CamaraHttpPort = http,
): Promise<CamaraDeputadoDetail> {
  logger.info(`[camara] getDeputadoById ${id}`)

  const res = await withRetry(() =>
    client.get<CamaraResponse<CamaraDeputadoDetail>>(`/deputados/${id}`),
  )

  return res.data.dados
}

/**
 * Returns voting history for a deputy within an optional date window.
 *
 * Implementation note: the Câmara v2 API removed /deputados/{id}/votacoes.
 * We now fetch voting sessions from /votacoes and scan /votacoes/{id}/votos
 * for the specific deputy. This is paginated by session (up to 100 sessions).
 */
export async function getVotacoesByDeputado(
  id: number,
  filters: VotacoesFilters = {},
  client: CamaraHttpPort = http,
): Promise<CamaraVotacaoDeputado[]> {
  const { dateFrom, dateTo } = filters
  logger.info(`[camara] getVotacoesByDeputado ${id}`, filters)

  // Step 1 — fetch recent voting sessions
  const sessions = await collectCamaraPages<CamaraVotacaoSession>(client, '/votacoes', {
    itens: 100,
    ordem: 'DESC',
    ordenarPor: 'dataHoraRegistro',
    ...(dateFrom && { dataInicio: dateFrom }),
    ...(dateTo && { dataFim: dateTo }),
  })
  if (sessions.length === 0) return []

  // Step 2 — for each session, fetch individual votes and filter by deputado id
  const results: CamaraVotacaoDeputado[] = []

  for (const session of sessions) {
    try {
      const votos = await collectCamaraPages<CamaraVotoDeputado>(
        client,
        `/votacoes/${session.id}/votos`,
        { itens: 100 },
      )
      const voto = votos.find((candidateVote) => candidateVote.deputado_?.id === id)
      if (voto) {
        results.push({
          sessionId: session.id,
          data: session.data,
          dataHoraRegistro: voto.dataRegistroVoto ?? session.dataHoraRegistro,
          siglaOrgao: session.siglaOrgao,
          proposicaoObjeto: session.proposicaoObjeto,
          uriProposicaoObjeto: session.uriProposicaoObjeto,
          descricao: session.descricao,
          tipoVoto: voto.tipoVoto,
        })
      }

      // Polite pace — avoid hammering /votos per session
      await sleep(150)
    } catch {
      // Non-critical: skip sessions that fail
    }
  }

  logger.info(`[camara] getVotacoesByDeputado ${id} → ${results.length} votes in ${sessions.length} sessions`)
  return results
}

/**
 * Returns up to 100 bills authored by a deputy (most recent first).
 * The list endpoint already includes dataApresentacao — no detail fetch needed.
 */
export async function getProposicoesByDeputado(
  id: number,
  client: CamaraHttpPort = http,
): Promise<CamaraProposicaoSummary[]> {
  logger.info(`[camara] getProposicoesByDeputado ${id}`)

  return collectCamaraPages<CamaraProposicaoSummary>(client, '/proposicoes', {
    idDeputadoAutor: id,
    itens: 100,
    ordem: 'DESC',
    ordenarPor: 'id',
  })
}

// ── DB persistence ────────────────────────────────────────────────────────────

/**
 * Upserts a deputy as a person with a Câmara mandate. It never creates a candidacy.
 */
async function saveDeputado(detail: CamaraDeputadoDetail): Promise<LegislatorMandateIds> {
  const s = detail.ultimoStatus
  return upsertLegislatorMandate(prisma, {
    source: DataSource.CAMARA,
    house: MandateHouse.CAMARA,
    externalId: String(detail.id),
    legislatureId: String(s.idLegislatura),
    name: detail.nomeCivil || s.nome,
    socialName: s.nomeEleitoral || s.nome || null,
    party: s.siglaPartido,
    state: s.siglaUf,
    role: 'DEPUTADO_FEDERAL',
    sourceUrl: detail.uri,
    syncedAt: new Date(),
    isCurrent: s.situacao.toLowerCase().includes('exercício'),
  })
}

/**
 * Bulk-inserts voting records, skipping rows that already exist.
 * Returns the number of new records inserted.
 */
async function saveVotacoes(
  ids: LegislatorMandateIds,
  votacoes: CamaraVotacaoDeputado[],
): Promise<number> {
  if (votacoes.length === 0) return 0

  // Load all existing externalIds for this candidate to skip duplicates
  const existing = await prisma.votingRecord.findMany({
    where: { mandateId: ids.mandateId, source: 'camara' },
    select: { externalId: true },
  })
  const existingIds = new Set(existing.map((r) => r.externalId))

  const records: Prisma.VotingRecordCreateManyInput[] = votacoes.flatMap((v) => {
    if (existingIds.has(v.sessionId)) return []

    const votedAt = new Date(v.dataHoraRegistro ?? v.data)
    if (isNaN(votedAt.getTime())) return []

    return [{
      externalId: v.sessionId,
      source: 'camara',
      proposalName: (v.proposicaoObjeto ?? v.descricao).slice(0, 500),
      proposalUrl: v.uriProposicaoObjeto ?? null,
      voteType: mapVoteType(v.tipoVoto),
      votedAt,
      session: v.siglaOrgao ?? null,
      personId: ids.personId,
      mandateId: ids.mandateId,
    }]
  })

  if (records.length === 0) return 0
  await prisma.votingRecord.createMany({ data: records })
  return records.length
}

/**
 * Upserts proposals authored by a deputy.
 * Fetches detail only to get accurate status; date comes from the list response.
 * Returns number of proposals processed.
 */
async function saveProposicoes(
  mandateId: string,
  proposicoes: CamaraProposicaoSummary[],
): Promise<number> {
  let count = 0

  for (const p of proposicoes) {
    const externalId = String(p.id)
    const title = `${p.siglaTipo} ${p.numero}/${p.ano}`

    // Parse presentation date from the list response (no detail fetch needed)
    let proposedAt: Date | null = null
    if (p.dataApresentacao) {
      const parsed = new Date(p.dataApresentacao)
      if (!isNaN(parsed.getTime())) proposedAt = parsed
    }

    // Fetch detail for accurate status (best-effort)
    let status: ProposalStatus = ProposalStatus.SUBMITTED
    let fullDescription = p.ementa

    try {
      const detailRes = await withRetry(() =>
        http.get<CamaraResponse<CamaraProposicaoDetail>>(`/proposicoes/${p.id}`),
      )
      const d = detailRes.data.dados
      if (d.statusProposicao?.descricaoSituacao) {
        status = mapProposalStatus(d.statusProposicao.descricaoSituacao)
      }
      if (d.ementaDetalhada) fullDescription = d.ementaDetalhada
    } catch {
      // Non-critical — proceed with summary data
    }

    const bill = await prisma.legislativeBill.upsert({
      where: {
        source_externalId: { source: DataSource.CAMARA, externalId },
      },
      update: { title, description: fullDescription, status },
      create: {
        externalId,
        source: DataSource.CAMARA,
        title,
        description: fullDescription,
        status,
        introducedAt: proposedAt ?? new Date(p.ano, 0, 1),
        url: `https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=${p.id}`,
        tags: [p.siglaTipo],
      },
      select: { id: true },
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

    count++
    await sleep(200) // pace detail fetches
  }

  return count
}

// ── Sync orchestrator ─────────────────────────────────────────────────────────

/**
 * Full sync: lists deputies, upserts candidates, and persists their
 * voting records and proposals in parallel batches.
 *
 * @param filters - Deputy filters (partido, UF, etc.)
 * @param votacoesFilters - Date window for vote fetching. For daily syncs,
 *   pass `{ dateFrom: yesterday }` to avoid scanning the full session history.
 */
export interface CamaraSyncMetrics {
  legislators: number
  synced: number
  failed: number
}

export async function syncCamara(
  filters: DeputadoFilters = {},
  votacoesFilters: VotacoesFilters = {},
): Promise<CamaraSyncMetrics> {
  logger.info('[camara] Starting sync…', votacoesFilters)

  const deputados = await getDeputados(filters)
  logger.info(`[camara] ${deputados.length} deputados to process`)

  const concurrency = Math.max(1, Number(process.env.SCRAPER_CONCURRENCY) || 3)
  let synced = 0
  let failed = 0

  for (let i = 0; i < deputados.length; i += concurrency) {
    const batch = deputados.slice(i, i + concurrency)

    await Promise.all(
      batch.map(async (dep) => {
        try {
          const detail = await getDeputadoById(dep.id)
          const ids = await saveDeputado(detail)

          const [votacoes, proposicoes] = await Promise.all([
            getVotacoesByDeputado(dep.id, votacoesFilters),
            getProposicoesByDeputado(dep.id),
          ])

          const [vSaved, pSaved] = await Promise.all([
            saveVotacoes(ids, votacoes),
            saveProposicoes(ids.mandateId, proposicoes),
          ])

          logger.info(
            `[camara] ✓ ${dep.nome} (${dep.siglaPartido}-${dep.siglaUf}) ` +
            `— ${vSaved} votes, ${pSaved} proposals`,
          )
          synced++
        } catch (err) {
          logger.error(
            `[camara] ✗ ${dep.id} (${dep.nome})`,
            err instanceof Error ? err.message : err,
          )
          failed++
        }
      }),
    )

    if (i + concurrency < deputados.length) await sleep(500)
  }

  logger.info(`[camara] Sync complete — ${synced} ok, ${failed} failed`)
  await prisma.$disconnect()
  if (failed > 0) throw new Error(`[camara] ${failed} of ${deputados.length} legislators failed`)
  return { legislators: deputados.length, synced, failed }
}

// ── Direct execution ──────────────────────────────────────────────────────────
// Used by: pnpm run sync:camara
if (require.main === module) {
  syncCamara()
    .catch((err) => {
      logger.error('[camara] Fatal error', err)
      process.exit(1)
    })
}
