import 'dotenv/config'
import { createHash } from 'node:crypto'
import {
  Candidate,
  Position,
  PrismaClient,
  ProposalOrigin,
  ProposalStatus,
} from '@prisma/client'
import {
  PRESIDENTIAL_SOURCES,
  CANDIDATE_ALIASES,
} from '../data/presidentialSources'
import { fetchAllSources, FetchedArticle } from '../sources/presidentialNews'
import {
  extractPresidenciaveis,
  extractProposalsFromNews,
  ExtractedCandidate,
  CandidacyStatus,
} from '../processors/presidentialExtractor'
import { closeBrowser } from '../utils/playwright'
import { logger } from '../utils/logger'

const prisma = new PrismaClient()

// ── Name normalization / matching ─────────────────────────────────────────────

export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Resolve apelidos de imprensa ("Lula") para o nome canônico do banco. */
function canonicalName(name: string): string {
  return CANDIDATE_ALIASES[normalizeName(name)] ?? name
}

export function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(canonicalName(a))
  const nb = normalizeName(canonicalName(b))
  if (na === nb) return true
  if (na.length >= 8 && nb.includes(na)) return true
  if (nb.length >= 8 && na.includes(nb)) return true
  // Subconjunto de tokens: "flavio bolsonaro" casa com "flavio nantes bolsonaro"
  const ta = na.split(' ').filter((t) => t.length > 1)
  const tb = nb.split(' ').filter((t) => t.length > 1)
  const [shorter, longer] = ta.length <= tb.length ? [ta, tb] : [tb, ta]
  if (shorter.length >= 2 && shorter.every((t) => longer.includes(t))) return true
  return false
}

function findCandidate(name: string, candidates: Candidate[]): Candidate | undefined {
  const matches = candidates.filter((candidate) => namesMatch(candidate.name, name))
  return matches.length === 1 ? matches[0] : undefined
}

// ── Merge candidates across sources ───────────────────────────────────────────

// Em caso de conflito entre fontes, o status mais "forte" vence
const STATUS_PRIORITY: Record<CandidacyStatus, number> = {
  desistiu: 4,
  confirmado: 3,
  pre_candidato: 2,
  cotado: 1,
}

interface MergedCandidate extends ExtractedCandidate {
  sources: string[]
}

export function mergeExtractedCandidates(
  perSource: { sourceId: string; candidates: ExtractedCandidate[] }[],
): MergedCandidate[] {
  const merged: MergedCandidate[] = []

  for (const { sourceId, candidates } of perSource) {
    for (const extracted of candidates) {
      const existing = merged.find((m) => namesMatch(m.name, extracted.name))

      if (!existing) {
        merged.push({
          ...extracted,
          name: canonicalName(extracted.name),
          sources: [sourceId],
        })
        continue
      }

      existing.sources.push(sourceId)
      if (STATUS_PRIORITY[extracted.status] > STATUS_PRIORITY[existing.status]) {
        existing.status = extracted.status
      }
      existing.party ??= extracted.party
      existing.currentRole ??= extracted.currentRole
      existing.homeState ??= extracted.homeState
      existing.pollFirstRoundPct ??= extracted.pollFirstRoundPct
      // Prefere o nome mais completo entre as fontes
      if (canonicalName(extracted.name).length > existing.name.length) {
        existing.name = canonicalName(extracted.name)
      }
    }
  }

  return merged
}

// ── Enrich existing candidacies ──────────────────────────────────────────────

async function enrichExistingPresidenciaveis(merged: MergedCandidate[]): Promise<void> {
  const dbCandidates = await prisma.candidate.findMany({
    where: { position: Position.PRESIDENTE, electionYear: 2026, isPublished: true },
  })

  let updated = 0

  for (const m of merged) {
    const existing = findCandidate(m.name, dbCandidates)

    if (existing) {
      await prisma.candidate.update({
        where: { id: existing.id },
        data: { candidacyStatus: m.status },
      })
      updated++
      continue
    }
    logger.info(
      `[presidenciaveis] Contexto ignorado para ${m.name}: candidatura não existe no TSE/editorial`,
    )
  }

  logger.info(`[presidenciaveis] Contexto atualizado em ${updated} candidaturas existentes; 0 criadas`)
}

// ── Persist proposals ─────────────────────────────────────────────────────────

const THEME_LABELS: Record<string, string> = {
  economia: 'Economia',
  saude: 'Saúde',
  educacao: 'Educação',
  seguranca: 'Segurança',
  meioambiente: 'Meio Ambiente',
  tecnologia: 'Tecnologia',
  politicaexterna: 'Política Externa',
  outros: 'Outros',
}

async function saveProposalsFromArticles(articles: FetchedArticle[]): Promise<void> {
  const dbCandidates = await prisma.candidate.findMany({
    where: { position: Position.PRESIDENTE, electionYear: 2026, isPublished: true },
  })

  let saved = 0
  let unmatched = 0
  let failed = 0

  for (const article of articles) {
    const proposals = await extractProposalsFromNews(article.text)
    logger.info(
      `[presidenciaveis] ${article.source.id}: ${proposals.length} propostas extraídas`,
    )

    for (const p of proposals) {
      const candidate = findCandidate(p.candidateName, dbCandidates)
      if (!candidate) {
        unmatched++
        logger.warn(
          `[presidenciaveis] Proposta sem candidato correspondente: "${p.candidateName}"`,
        )
        continue
      }

      // Hash do conteúdo evita duplicar a mesma proposta em re-execuções,
      // mas permite propostas novas do mesmo candidato/tema
      const hash = createHash('sha1').update(p.proposal).digest('hex').slice(0, 10)
      const externalId = `news_${candidate.id}_${p.theme}_${hash}`

      try {
        const existing = await prisma.proposal.findUnique({
          where: { externalId },
          select: { reviewedAt: true },
        })
        if (existing?.reviewedAt) {
          saved++
          continue
        }
        await prisma.proposal.upsert({
          where: { externalId },
          update: {
            status: ProposalStatus.DRAFT,
            isPublished: false,
            origin: ProposalOrigin.AI_EXTRACTION,
          },
          create: {
            externalId,
            source: 'news',
            title: `${THEME_LABELS[p.theme]} — declaração na imprensa`,
            description: p.proposal,
            category: THEME_LABELS[p.theme],
            tags: [p.theme, 'news', article.source.id],
            status: ProposalStatus.DRAFT,
            isPublished: false,
            origin: ProposalOrigin.AI_EXTRACTION,
            url: article.source.url,
            candidateId: candidate.id,
          },
        })
        saved++
      } catch (err) {
        failed++
        logger.error(
          `[presidenciaveis] Falha ao salvar proposta ${externalId}`,
          err instanceof Error ? err.message : err,
        )
      }
    }
  }

  logger.info(
    `[presidenciaveis] Propostas: ${saved} salvas, ${unmatched} sem candidato correspondente`,
  )
  if (failed > 0) throw new Error(`[presidenciaveis] ${failed} proposal write(s) failed`)
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function runSyncPresidenciaveis(
  mode: 'all' | 'candidates' | 'proposals' = 'all',
): Promise<void> {
  logger.info(`[presidenciaveis] Iniciando sync (mode=${mode}) — ${PRESIDENTIAL_SOURCES.length} fontes`)

  const articles = await fetchAllSources(PRESIDENTIAL_SOURCES)
  if (articles.length === 0) {
    throw new Error('[presidenciaveis] Nenhuma fonte pôde ser baixada')
  }

  if (mode !== 'proposals') {
    const perSource: { sourceId: string; candidates: ExtractedCandidate[] }[] = []

    // Só listas de candidatos e pesquisas definem QUEM está na disputa —
    // hubs de notícia servem apenas para propostas
    for (const article of articles.filter((a) => a.source.kind !== 'news_hub')) {
      const candidates = await extractPresidenciaveis(article.text)
      logger.info(
        `[presidenciaveis] ${article.source.id}: ${candidates.length} presidenciáveis extraídos`,
      )
      perSource.push({ sourceId: article.source.id, candidates })
    }

    const merged = mergeExtractedCandidates(perSource)
    logger.info(`[presidenciaveis] ${merged.length} presidenciáveis únicos após merge`)
    await enrichExistingPresidenciaveis(merged)
  }

  if (mode !== 'candidates') {
    await saveProposalsFromArticles(articles)
  }

  logger.info('[presidenciaveis] Sync concluído')
}

// ── Direct execution ──────────────────────────────────────────────────────────
// Uso: pnpm run sync:presidenciaveis [candidates|proposals]
if (require.main === module) {
  const arg = process.argv[2]
  const mode = arg === 'candidates' || arg === 'proposals' ? arg : 'all'

  runSyncPresidenciaveis(mode)
    .catch((err) => {
      logger.error('[presidenciaveis] Fatal error', err)
      process.exitCode = 1
    })
    .finally(async () => {
      await closeBrowser()
      await prisma.$disconnect()
    })
}
