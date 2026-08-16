import { prisma } from '../lib/prisma'
/**
 * Consistency score service.
 * Cross-references a candidate's declared proposals against their actual
 * voting record to compute a 0–100 score per theme.
 */


import { analyzeConsistency } from './geminiService'
import { withCache, invalidate, TTL } from './cacheService'
import {
  PUBLIC_PROPOSAL_LIMIT,
  PUBLIC_PROPOSAL_ORDER_BY,
  PUBLIC_PROPOSAL_WHERE,
  PUBLIC_VOTING_RECORD_LIMIT,
  PUBLIC_VOTING_RECORD_ORDER_BY,
  PUBLIC_VOTING_RECORD_WHERE,
} from '../domain/publicationPolicy'
import { getCandidateReadModel, publicCandidateWhere } from './candidateService'


// ── Types ─────────────────────────────────────────────────────────────────────

export interface ConsistencyScoreResult {
  theme: string
  score: number
  label: string
  explanation: string
  contradictions: Array<{ proposal: string; vote: string; description: string }>
  proposalCount: number
  voteCount: number
  computedAt: string
}

// Keywords per theme to filter relevant voting records
const THEME_KEYWORDS: Record<string, string[]> = {
  Saúde: ['saúde', 'sus', 'hospital', 'médico', 'medicamento', 'farmácia', 'covid', 'doença', 'sanitári'],
  Educação: ['educação', 'escola', 'ensino', 'university', 'universidade', 'professor', 'bolsa', 'enem', 'creche', 'mec'],
  Economia: ['econom', 'fiscal', 'imposto', 'tributário', 'pib', 'emprego', 'trabalho', 'renda', 'salário', 'previdência', 'reforma'],
  'Meio Ambiente': ['meio ambiente', 'ambiental', 'floresta', 'desmatamento', 'clima', 'carbono', 'sustentável', 'ibama', 'rios', 'poluição'],
  Segurança: ['segurança', 'policial', 'crime', 'violência', 'presídio', 'armamento', 'porte de arma', 'penal', 'código penal'],
  Tecnologia: ['tecnologia', 'digital', 'internet', 'inteligência artificial', 'startup', 'inovação', 'telecomunicação'],
  'Política Externa': ['política externa', 'diplomacia', 'tratado', 'exportação', 'importação', 'mercosul', 'acordo comercial'],
}

// ── Main functions ─────────────────────────────────────────────────────────────

export async function getConsistencyScores(candidateId: string): Promise<ConsistencyScoreResult[]> {
  const cKey = `consistency:scores:${candidateId}`
  return withCache<ConsistencyScoreResult[]>(cKey, TTL.CANDIDATE_DETAIL, async () => {
    const scores = await prisma.consistencyScore.findMany({
      where: { candidateId },
      orderBy: { score: 'desc' },
    })
    return scores.map((s) => ({
      theme: s.theme,
      score: s.score,
      label: s.label,
      explanation: s.explanation,
      contradictions: (s.contradictions as ConsistencyScoreResult['contradictions']) ?? [],
      proposalCount: s.proposalCount,
      voteCount: s.voteCount,
      computedAt: s.computedAt.toISOString(),
    }))
  })
}

export async function computeConsistencyScores(candidateId: string): Promise<ConsistencyScoreResult[]> {
  const candidate = await prisma.candidate.findFirst({
    where: { id: candidateId, ...publicCandidateWhere() },
    include: {
      proposals: {
        where: PUBLIC_PROPOSAL_WHERE,
        select: { title: true, description: true, category: true },
        orderBy: PUBLIC_PROPOSAL_ORDER_BY,
        take: PUBLIC_PROPOSAL_LIMIT,
      },
      votingRecords: {
        where: PUBLIC_VOTING_RECORD_WHERE,
        select: { proposalName: true, voteType: true, votedAt: true },
        orderBy: PUBLIC_VOTING_RECORD_ORDER_BY,
        take: PUBLIC_VOTING_RECORD_LIMIT,
      },
    },
  })

  if (!candidate) throw new Error(`Candidato não encontrado: ${candidateId}`)

  const votingRecords = getCandidateReadModel() === 'normalized' && candidate.personId
    ? await prisma.votingRecord.findMany({
      where: {
          ...PUBLIC_VOTING_RECORD_WHERE,
          OR: [
            { candidateId },
            { personId: candidate.personId },
            { mandate: { personId: candidate.personId } },
          ],
        },
        select: { proposalName: true, voteType: true, votedAt: true },
        orderBy: PUBLIC_VOTING_RECORD_ORDER_BY,
        take: PUBLIC_VOTING_RECORD_LIMIT,
      })
    : candidate.votingRecords

  // Group proposals by theme (using category field)
  const byTheme: Record<string, string[]> = {}
  for (const p of candidate.proposals) {
    const theme = normalizeTheme(p.category)
    if (!byTheme[theme]) byTheme[theme] = []
    byTheme[theme].push(p.title + (p.description ? `: ${p.description.slice(0, 200)}` : ''))
  }

  const themes = Object.keys(byTheme)
  if (themes.length === 0) {
    return []
  }

  const results: ConsistencyScoreResult[] = []

  // Process each theme in parallel (max 3 concurrent LLM calls)
  const chunks = chunkArray(themes, 3)
  for (const chunk of chunks) {
    const chunkResults = await Promise.all(
      chunk.map(async (theme) => {
        const themeProposals = byTheme[theme] ?? []
        const relevantVotes = filterVotesByTheme(votingRecords, theme)
        const votesForLLM = relevantVotes.map((v) => ({
          proposalName: v.proposalName,
          voteType: v.voteType,
          votedAt: v.votedAt.toISOString().split('T')[0],
        }))

        const analysis = await analyzeConsistency(
          candidate.name,
          theme,
          themeProposals,
          votesForLLM,
        )

        // Upsert into DB
        await prisma.consistencyScore.upsert({
          where: { candidateId_theme: { candidateId, theme } },
          create: {
            candidateId,
            theme,
            score: analysis.score,
            label: analysis.label,
            explanation: analysis.explanation,
            contradictions: analysis.contradictions,
            proposalCount: themeProposals.length,
            voteCount: relevantVotes.length,
            computedAt: new Date(),
          },
          update: {
            score: analysis.score,
            label: analysis.label,
            explanation: analysis.explanation,
            contradictions: analysis.contradictions,
            proposalCount: themeProposals.length,
            voteCount: relevantVotes.length,
            computedAt: new Date(),
          },
        })

        return {
          theme,
          score: analysis.score,
          label: analysis.label,
          explanation: analysis.explanation,
          contradictions: analysis.contradictions,
          proposalCount: themeProposals.length,
          voteCount: relevantVotes.length,
          computedAt: new Date().toISOString(),
        } satisfies ConsistencyScoreResult
      }),
    )
    results.push(...chunkResults)
  }

  // Invalidate cache so next read picks up fresh data
  await invalidate(`consistency:scores:${candidateId}`)

  return results.sort((a, b) => b.score - a.score)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeTheme(category: string | null): string {
  if (!category) return 'Outros'
  const normalized = category.trim()

  // Map common variations to canonical theme names
  const mappings: Record<string, string> = {
    saude: 'Saúde',
    saúde: 'Saúde',
    educacao: 'Educação',
    educação: 'Educação',
    economia: 'Economia',
    economic: 'Economia',
    'meio ambiente': 'Meio Ambiente',
    meioambiente: 'Meio Ambiente',
    seguranca: 'Segurança',
    segurança: 'Segurança',
    tecnologia: 'Tecnologia',
    'politica externa': 'Política Externa',
    'política externa': 'Política Externa',
    politicaexterna: 'Política Externa',
  }

  const lower = normalized.toLowerCase().replace(/\s+/g, ' ')
  return mappings[lower] ?? normalized
}

function filterVotesByTheme(
  votes: Array<{ proposalName: string; voteType: string; votedAt: Date }>,
  theme: string,
): Array<{ proposalName: string; voteType: string; votedAt: Date }> {
  const keywords = THEME_KEYWORDS[theme]
  if (!keywords || keywords.length === 0) {
    // No keywords = return sample votes for generic themes
    return votes.slice(0, 20)
  }

  const relevant = votes.filter((v) => {
    const lower = v.proposalName.toLowerCase()
    return keywords.some((kw) => lower.includes(kw.toLowerCase()))
  })

  // If we found relevant votes, use them; otherwise return top 10 recent votes
  return relevant.length > 0 ? relevant.slice(0, 30) : votes.slice(0, 10)
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}
