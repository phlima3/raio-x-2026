import 'dotenv/config'
import axios, { AxiosError, AxiosInstance } from 'axios'
import { Prisma, PrismaClient, VoteType, ProposalStatus, Position } from '@prisma/client'
import { logger } from '../utils/logger'

// ── API response envelopes ─────────────────────────────────────────────────────

interface SenadoListaAtualResponse {
  ListaParlamentarEmExercicio: {
    Parlamentares: {
      Parlamentar: SenadoParlamentarSummaryRaw[]
    }
  }
}

interface SenadoDetalheResponse {
  DetalheParlamentar: {
    Parlamentar: SenadoParlamentarDetailRaw
  }
}

interface SenadoVotacoesResponse {
  VotacaoParlamentar: {
    Parlamentar: {
      IdentificacaoParlamentar: SenadoIdentificacao
      Votacoes?: {
        Votacao: SenadoVotacaoRaw | SenadoVotacaoRaw[]
      }
    }
  }
}

interface SenadoMateriasResponse {
  PesquisaBasicaMateria: {
    Materias?: {
      Materia: SenadoMateriaRaw | SenadoMateriaRaw[]
    }
  }
}

// ── API types — /senador/lista/atual ──────────────────────────────────────────

interface SenadoIdentificacao {
  CodigoParlamentar: string
  NomeCompletoParlamentar?: string
  NomeParlamentar: string
  SiglaPartidoParlamentar: string
  UfParlamentar: string
  UrlFotoParlamentar?: string
  EmailParlamentar?: string
  SiteParlamentar?: string
}

interface SenadoParlamentarSummaryRaw {
  IdentificacaoParlamentar: SenadoIdentificacao
}

interface SenadoParlamentarDetailRaw {
  IdentificacaoParlamentar: SenadoIdentificacao
  DadosBasicosParlamentar?: {
    SexoParlamentar?: string
    FormaTratamento?: string
    EnderecoParlamentar?: string
  }
}

// ── API types — /senador/{codigo}/votacoes ────────────────────────────────────

interface SenadoSessaoPlenaria {
  CodigoSessao?: string
  CodigoSessaoVotacao?: string
  DataSessao?: string
  HoraInicio?: string
  SiglaCasaLegislativa?: string
}

interface SenadoVotacaoRaw {
  SessaoPlenaria?: SenadoSessaoPlenaria
  CodigoSessaoVotacao?: string
  DataSessao?: string
  DescricaoVotacao?: string
  VotoDoSenador?: string
}

// ── API types — /materia/pesquisa/lista ───────────────────────────────────────

interface SenadoMateriaRaw {
  Codigo?: string
  DescricaoIdentificacaoMateria?: string
  Sigla?: string
  Numero?: string
  Ano?: string
  Ementa?: string
  DescricaoSubtipoMateria?: string
  DescricaoObjetivoMateria?: string
  SituacaoAtual?: string
}

// ── Normalised types — used internally and as return types ────────────────────

export interface SenadoParlamentarSummary {
  codigo: string
  nome: string
  partido: string
  uf: string
  fotoUrl: string | null
  email: string | null
}

export interface SenadoParlamentarDetail extends SenadoParlamentarSummary {
  siteUrl: string | null
}

export interface SenadoVotacao {
  sessaoId: string
  dataSessao: string
  descricao: string
  voto: string
}

export interface SenadoMateria {
  codigo: string
  titulo: string
  ementa: string
  ano: string
  sigla: string
  situacao: string | null
  url: string
}

// ── Filter options ────────────────────────────────────────────────────────────

export interface VotacoesSenadoFilters {
  /** Date in YYYYMMDD format (Senado API convention) */
  dataInicio?: string
  /** Date in YYYYMMDD format (Senado API convention) */
  dataFim?: string
}

// ── Utilities ─────────────────────────────────────────────────────────────────

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Normalises arrays returned by the Senado API.
 * The API returns a single object when there is only one item
 * instead of an array — this helper always returns an array.
 */
function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return []
  return Array.isArray(value) ? value : [value]
}

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
          `[senado] attempt ${attempt + 1}/${maxAttempts} failed, retrying in ${delay}ms`,
          err instanceof Error ? err.message : String(err),
        )
        await sleep(delay)
      }
    }
  }

  throw lastError
}

// ── HTTP client ────────────────────────────────────────────────────────────────

function createClient(): AxiosInstance {
  const client = axios.create({
    baseURL: process.env.SENADO_API_URL ?? 'https://legis.senado.leg.br/dadosabertos',
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
      logger.error(`[senado] HTTP ${status ?? 'network'} on ${url}`, err.message)
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
  'p-nrv': VoteType.OBSTRUCTION,   // Partido não registrou voto
  'p nrv': VoteType.OBSTRUCTION,
  'art. 17': VoteType.OBSTRUCTION,
  obstrução: VoteType.OBSTRUCTION,
  obstrucao: VoteType.OBSTRUCTION,
}

function mapVoteType(voto: string): VoteType {
  return VOTE_MAP[voto.trim().toLowerCase()] ?? VoteType.ABSENT
}

function mapProposalStatus(situacao: string): ProposalStatus {
  const s = situacao.toLowerCase()
  if (s.includes('aprovad') || s.includes('transform') || s.includes('sancionad')) {
    return ProposalStatus.APPROVED
  }
  if (s.includes('rejeitad') || s.includes('prejudicad')) return ProposalStatus.REJECTED
  if (s.includes('arquivad')) return ProposalStatus.ARCHIVED
  if (s.includes('plenário') || s.includes('votação') || s.includes('votacao')) {
    return ProposalStatus.VOTED
  }
  if (s.includes('comissão') || s.includes('relator') || s.includes('tramitação')) {
    return ProposalStatus.IN_COMMITTEE
  }
  if (s.includes('apresentad') || s.includes('aguardando') || s.includes('publicado')) {
    return ProposalStatus.SUBMITTED
  }
  return ProposalStatus.DRAFT
}

// ── Module-level singletons ───────────────────────────────────────────────────

const http = createClient()
const prisma = new PrismaClient()

// ── Public API functions ──────────────────────────────────────────────────────

/**
 * Lists all senators currently in office.
 */
export async function getSenadores(): Promise<SenadoParlamentarSummary[]> {
  logger.info('[senado] getSenadores')

  const res = await withRetry(() =>
    http.get<SenadoListaAtualResponse>('/senador/lista/atual'),
  )

  const raw = toArray(res.data.ListaParlamentarEmExercicio?.Parlamentares?.Parlamentar)

  return raw.map((p) => {
    const id = p.IdentificacaoParlamentar
    return {
      codigo: id.CodigoParlamentar,
      nome: id.NomeParlamentar,
      partido: id.SiglaPartidoParlamentar,
      uf: id.UfParlamentar,
      fotoUrl: id.UrlFotoParlamentar ?? null,
      email: id.EmailParlamentar ?? null,
    }
  })
}

/**
 * Returns full details for a single senator.
 */
export async function getSenadoreById(codigo: string): Promise<SenadoParlamentarDetail> {
  logger.info(`[senado] getSenadoreById ${codigo}`)

  const res = await withRetry(() =>
    http.get<SenadoDetalheResponse>(`/senador/${codigo}`),
  )

  const p = res.data.DetalheParlamentar?.Parlamentar
  const id = p?.IdentificacaoParlamentar

  return {
    codigo: id?.CodigoParlamentar ?? codigo,
    nome: id?.NomeParlamentar ?? '',
    partido: id?.SiglaPartidoParlamentar ?? '',
    uf: id?.UfParlamentar ?? '',
    fotoUrl: id?.UrlFotoParlamentar ?? null,
    email: id?.EmailParlamentar ?? null,
    siteUrl: id?.SiteParlamentar ?? null,
  }
}

/**
 * Returns voting history for a senator within an optional date window.
 * Date params must be in YYYYMMDD format (Senado API convention).
 */
export async function getVotacoesBySenador(
  codigo: string,
  filters: VotacoesSenadoFilters = {},
): Promise<SenadoVotacao[]> {
  logger.info(`[senado] getVotacoesBySenador ${codigo}`, filters)

  const res = await withRetry(() =>
    http.get<SenadoVotacoesResponse>(`/senador/${codigo}/votacoes`, {
      params: {
        ...(filters.dataInicio && { dataInicio: filters.dataInicio }),
        ...(filters.dataFim && { dataFim: filters.dataFim }),
      },
    }),
  )

  const raw = toArray(
    res.data.VotacaoParlamentar?.Parlamentar?.Votacoes?.Votacao,
  )

  return raw.flatMap((v) => {
    const sessaoId =
      v.SessaoPlenaria?.CodigoSessao ??
      v.SessaoPlenaria?.CodigoSessaoVotacao ??
      v.CodigoSessaoVotacao ??
      null

    const dataSessao =
      v.SessaoPlenaria?.DataSessao ??
      v.DataSessao ??
      null

    if (!sessaoId || !dataSessao) return []

    return [{
      sessaoId,
      dataSessao,
      descricao: v.DescricaoVotacao ?? '',
      voto: v.VotoDoSenador ?? '',
    }]
  })
}

/**
 * Returns up to 100 bills authored by a senator (most recent first via Codigo desc sort).
 */
export async function getMateriasBySenador(
  codigo: string,
): Promise<SenadoMateria[]> {
  logger.info(`[senado] getMateriasBySenador ${codigo}`)

  const res = await withRetry(() =>
    http.get<SenadoMateriasResponse>('/materia/pesquisa/lista', {
      params: { codigoAutor: codigo, v: 7 },
    }),
  )

  const raw = toArray(res.data.PesquisaBasicaMateria?.Materias?.Materia)

  return raw.flatMap((m) => {
    if (!m.Codigo) return []

    const sigla = m.Sigla ?? 'MAT'
    const numero = m.Numero ?? ''
    const ano = m.Ano ?? ''
    const titulo = m.DescricaoIdentificacaoMateria ?? `${sigla} ${numero}/${ano}`

    return [{
      codigo: m.Codigo,
      titulo,
      ementa: m.Ementa ?? m.DescricaoObjetivoMateria ?? '',
      ano,
      sigla,
      situacao: m.SituacaoAtual ?? null,
      url: `https://www25.senado.leg.br/web/atividade/materias/-/materia/${m.Codigo}`,
    }]
  })
}

// ── DB persistence ────────────────────────────────────────────────────────────

/**
 * Upserts a senator into the Candidate table using senadoId as the stable key.
 * Returns the internal candidate cuid.
 */
async function saveSenador(detail: SenadoParlamentarDetail): Promise<string> {
  const candidate = await prisma.candidate.upsert({
    where: { senadoId: detail.codigo },
    update: {
      name: detail.nome,
      party: detail.partido,
      state: detail.uf,
      photoUrl: detail.fotoUrl,
      email: detail.email,
      siteUrl: detail.siteUrl,
    },
    create: {
      senadoId: detail.codigo,
      name: detail.nome,
      party: detail.partido,
      state: detail.uf,
      position: Position.SENADOR,
      photoUrl: detail.fotoUrl,
      email: detail.email,
      siteUrl: detail.siteUrl,
      electionYear: 2026,
      isIncumbent: true,
    },
    select: { id: true },
  })

  return candidate.id
}

/**
 * Bulk-inserts voting records, skipping rows that already exist.
 * Returns the number of new records inserted.
 */
async function saveVotacoes(
  candidateId: string,
  votacoes: SenadoVotacao[],
): Promise<number> {
  if (votacoes.length === 0) return 0

  const existing = await prisma.votingRecord.findMany({
    where: { candidateId, source: 'senado' },
    select: { externalId: true },
  })
  const existingIds = new Set(existing.map((r) => r.externalId))

  const records: Prisma.VotingRecordCreateManyInput[] = votacoes.flatMap((v) => {
    if (existingIds.has(v.sessaoId)) return []

    const votedAt = new Date(v.dataSessao)
    if (isNaN(votedAt.getTime())) return []

    return [{
      externalId: v.sessaoId,
      source: 'senado',
      proposalName: v.descricao.slice(0, 500),
      proposalUrl: null,
      voteType: mapVoteType(v.voto),
      votedAt,
      session: 'SF',
      candidateId,
    }]
  })

  if (records.length === 0) return 0
  await prisma.votingRecord.createMany({ data: records })
  return records.length
}

/**
 * Upserts proposals (matérias) authored by a senator.
 * Returns number of proposals processed.
 */
async function saveMatérias(
  candidateId: string,
  materias: SenadoMateria[],
): Promise<number> {
  let count = 0

  for (const m of materias) {
    const externalId = `senado_${m.codigo}`

    await prisma.proposal.upsert({
      where: { externalId },
      update: {
        title: m.titulo,
        description: m.ementa || null,
        status: m.situacao ? mapProposalStatus(m.situacao) : ProposalStatus.SUBMITTED,
      },
      create: {
        externalId,
        source: 'senado',
        title: m.titulo,
        description: m.ementa || null,
        status: m.situacao ? mapProposalStatus(m.situacao) : ProposalStatus.SUBMITTED,
        proposedAt: m.ano ? new Date(Number(m.ano), 0, 1) : new Date(),
        url: m.url,
        tags: [m.sigla],
        candidateId,
      },
    })

    count++
    await sleep(200)
  }

  return count
}

// ── Sync orchestrator ─────────────────────────────────────────────────────────

/**
 * Full sync: lists senators, upserts candidates, and persists their
 * voting records and authored bills.
 *
 * @param dateFrom - YYYYMMDD (default: 20230101)
 * @param dateTo   - YYYYMMDD (default: today)
 */
export async function syncSenado(
  dateFrom = '20230101',
  dateTo = new Date().toISOString().slice(0, 10).replace(/-/g, ''),
): Promise<void> {
  logger.info('[senado] Starting sync…')

  const senadores = await getSenadores()
  logger.info(`[senado] ${senadores.length} senadores to process`)

  const concurrency = Math.max(1, Number(process.env.SCRAPER_CONCURRENCY) || 3)
  let synced = 0
  let failed = 0

  for (let i = 0; i < senadores.length; i += concurrency) {
    const batch = senadores.slice(i, i + concurrency)

    await Promise.all(
      batch.map(async (s) => {
        try {
          const detail = await getSenadoreById(s.codigo)
          const candidateId = await saveSenador(detail)

          const [votacoes, materias] = await Promise.all([
            getVotacoesBySenador(s.codigo, { dataInicio: dateFrom, dataFim: dateTo }),
            getMateriasBySenador(s.codigo),
          ])

          const [vSaved, mSaved] = await Promise.all([
            saveVotacoes(candidateId, votacoes),
            saveMatérias(candidateId, materias),
          ])

          logger.info(
            `[senado] ✓ ${s.nome} (${s.partido}-${s.uf}) ` +
            `— ${vSaved} votes, ${mSaved} proposals`,
          )
          synced++
        } catch (err) {
          logger.error(
            `[senado] ✗ ${s.codigo} (${s.nome})`,
            err instanceof Error ? err.message : err,
          )
          failed++
        }
      }),
    )

    if (i + concurrency < senadores.length) await sleep(500)
  }

  logger.info(`[senado] Sync complete — ${synced} ok, ${failed} failed`)
  await prisma.$disconnect()
}

// ── Direct execution ──────────────────────────────────────────────────────────
// Used by: pnpm run sync:senado
if (require.main === module) {
  syncSenado()
    .catch((err) => {
      logger.error('[senado] Fatal error', err)
      process.exit(1)
    })
}
