import 'dotenv/config'
import { PrismaClient, ProposalStatus, VoteType } from '@prisma/client'
import {
  getSenadores,
  getSenadoreById,
  getVotacoesBySenador,
  getMateriasBySenador,
  SenadoVotacao,
  SenadoMateria,
} from '../sources/senado'
import { syncCandidateSites, loadCandidateSiteConfigs } from '../sources/candidateSites'
import { logger } from '../utils/logger'

// ── Singletons ────────────────────────────────────────────────────────────────

const prisma = new PrismaClient()
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

// ── Name matching ─────────────────────────────────────────────────────────────

/**
 * Normalises a name for fuzzy comparison:
 * removes diacritics, lowercases, collapses whitespace.
 */
function normalize(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Returns true if every significant word (3+ chars) of seedName
 * appears in apiName after normalisation.
 *
 * Example: "Flávio Bolsonaro" matches "FLÁVIO BOLSONARO"
 */
function nameMatches(apiName: string, seedName: string): boolean {
  const normApi = normalize(apiName)
  const normSeed = normalize(seedName)
  const words = normSeed.split(' ').filter((w) => w.length >= 3)
  return words.length >= 2 && words.every((w) => normApi.includes(w))
}

// ── Vote type mapping ─────────────────────────────────────────────────────────

const SENADO_VOTE_MAP: Record<string, VoteType> = {
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

function mapSenadoVote(voto: string): VoteType {
  return SENADO_VOTE_MAP[voto.trim().toLowerCase()] ?? VoteType.ABSENT
}

// ── DB persistence helpers ────────────────────────────────────────────────────

async function saveSenadoVotes(
  candidateId: string,
  votacoes: SenadoVotacao[],
): Promise<number> {
  if (votacoes.length === 0) return 0

  // Manual dedup — VotingRecord.externalId has no unique constraint
  const existing = await prisma.votingRecord.findMany({
    where: { candidateId, source: 'senado' },
    select: { externalId: true },
  })
  const existingIds = new Set(existing.map((r) => r.externalId))

  const records = votacoes.flatMap((v) => {
    if (existingIds.has(v.sessaoId)) return []
    const votedAt = new Date(v.dataSessao)
    if (isNaN(votedAt.getTime())) return []

    return [{
      externalId: v.sessaoId,
      source: 'senado',
      proposalName: v.descricao.slice(0, 500),
      proposalUrl: null as string | null,
      voteType: mapSenadoVote(v.voto),
      votedAt,
      session: 'SF',
      candidateId,
    }]
  })

  if (records.length === 0) return 0
  await prisma.votingRecord.createMany({ data: records })
  return records.length
}

async function saveSenadoMaterias(
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
        status: m.situacao
          ? mapProposalStatus(m.situacao)
          : ProposalStatus.SUBMITTED,
      },
      create: {
        externalId,
        source: 'senado',
        title: m.titulo,
        description: m.ementa || null,
        status: m.situacao
          ? mapProposalStatus(m.situacao)
          : ProposalStatus.SUBMITTED,
        proposedAt: m.ano ? new Date(Number(m.ano), 0, 1) : new Date(),
        url: m.url,
        tags: [m.sigla],
        candidateId,
      },
    })

    count++
    await sleep(100)
  }

  return count
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
  return ProposalStatus.SUBMITTED
}

// ── Phase 1: Link senators ────────────────────────────────────────────────────

/**
 * Queries the Senado API for all current senators and links them to existing
 * seed candidates by name matching. Then syncs their voting records and bills.
 *
 * Seed candidates have no senadoId set — this is the "link" step that
 * connects them to the real legislative API.
 */
async function linkAndSyncSenadores(): Promise<void> {
  logger.info('[populate] Phase 1: Linking senators to seed candidates…')

  const senadores = await getSenadores()
  logger.info(`[populate] Senado API returned ${senadores.length} current senators`)

  // Load candidates that haven't been linked yet
  const candidates = await prisma.candidate.findMany({
    where: { senadoId: null },
  })

  let linked = 0

  for (const senador of senadores) {
    const match = candidates.find((c) => nameMatches(senador.nome, c.name))
    if (!match) continue

    logger.info(
      `[populate] Matched: ${senador.nome} (${senador.codigo}) → ${match.name} (${match.id})`,
    )

    // Update the seed candidate with the senadoId and any missing profile data
    await prisma.candidate.update({
      where: { id: match.id },
      data: {
        senadoId: senador.codigo,
        photoUrl: match.photoUrl || senador.fotoUrl || null,
        email: match.email || senador.email || null,
      },
    })

    // Fetch full detail to get siteUrl (often present on senator profiles)
    try {
      const detail = await getSenadoreById(senador.codigo)
      if (detail.siteUrl && !match.siteUrl) {
        await prisma.candidate.update({
          where: { id: match.id },
          data: { siteUrl: detail.siteUrl },
        })
        logger.info(`[populate] Updated siteUrl for ${match.name}: ${detail.siteUrl}`)
      }
    } catch (err) {
      logger.warn(`[populate] Could not fetch detail for ${senador.nome}`, err)
    }

    // Sync voting records (from 2023-01-01 onwards) and bills in parallel
    const [votacoes, materias] = await Promise.all([
      getVotacoesBySenador(senador.codigo, { dataInicio: '20230101' }).catch(() => [] as SenadoVotacao[]),
      getMateriasBySenador(senador.codigo).catch(() => [] as SenadoMateria[]),
    ])

    const [vSaved, mSaved] = await Promise.all([
      saveSenadoVotes(match.id, votacoes),
      saveSenadoMaterias(match.id, materias),
    ])

    logger.info(
      `[populate] ✓ ${match.name}: ${vSaved} votes, ${mSaved} bills saved`,
    )

    linked++
    await sleep(800) // polite pace between senators
  }

  logger.info(`[populate] Phase 1 complete — ${linked} senator(s) linked and synced`)
}

// ── Phase 2: Scrape candidate websites ────────────────────────────────────────

/**
 * Runs Playwright scraper + LLM proposal extraction for all candidates
 * that have a siteUrl configured in the database.
 *
 * Results are saved as Proposal records categorised by theme (economia,
 * saúde, educação, segurança, meio ambiente, tecnologia, política externa, outros).
 */
async function scrapeAllSites(): Promise<void> {
  logger.info('[populate] Phase 2: Scraping candidate websites for program proposals…')

  const configs = await loadCandidateSiteConfigs()

  if (configs.length === 0) {
    logger.warn('[populate] No candidates with siteUrl found in DB — skipping site scrape')
    logger.warn('[populate] Run seed first, or add siteUrl values to candidates in the DB')
    return
  }

  logger.info(`[populate] Scraping ${configs.length} candidate sites`)
  await syncCandidateSites(configs)
  logger.info('[populate] Phase 2 complete')
}

// ── Main orchestrator ─────────────────────────────────────────────────────────

async function main(): Promise<void> {
  logger.info('[populate] ╔══════════════════════════════════════════╗')
  logger.info('[populate] ║  Raio-X 2026 — Real Data Population     ║')
  logger.info('[populate] ╚══════════════════════════════════════════╝')

  const mode = process.argv[2] ?? 'all'

  if (mode === 'senado' || mode === 'all') {
    await linkAndSyncSenadores()
  }

  if (mode === 'sites' || mode === 'all') {
    await scrapeAllSites()
  }

  logger.info('[populate] Population complete')
}

main()
  .catch((err) => {
    logger.error('[populate] Fatal error', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
