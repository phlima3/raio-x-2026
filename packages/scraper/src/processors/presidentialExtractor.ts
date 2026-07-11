import { z } from 'zod'
import { createProvider, extractJson } from './llm'
import { logger } from '../utils/logger'

// ── Schemas ───────────────────────────────────────────────────────────────────

export const CandidacyStatusSchema = z.enum([
  'confirmado', // candidatura registrada/oficializada em convenção
  'pre_candidato', // pré-candidatura anunciada publicamente
  'cotado', // especulado pela imprensa, sem anúncio
  'desistiu', // desistiu ou retirou a pré-candidatura
])

export type CandidacyStatus = z.infer<typeof CandidacyStatusSchema>

const ExtractedCandidateSchema = z.object({
  name: z.string().min(3),
  party: z.string().min(2).nullable().optional(),
  status: CandidacyStatusSchema,
  currentRole: z.string().nullable().optional(),
  homeState: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .nullable()
    .optional(),
  pollFirstRoundPct: z.number().min(0).max(100).nullable().optional(),
})

export type ExtractedCandidate = z.infer<typeof ExtractedCandidateSchema>

const ExtractedCandidatesSchema = z.array(ExtractedCandidateSchema)

export const NEWS_THEMES = [
  'economia',
  'saude',
  'educacao',
  'seguranca',
  'meioambiente',
  'tecnologia',
  'politicaexterna',
  'outros',
] as const

const ExtractedNewsProposalSchema = z.object({
  candidateName: z.string().min(3),
  theme: z.enum(NEWS_THEMES),
  proposal: z.string().min(10),
})

export type ExtractedNewsProposal = z.infer<typeof ExtractedNewsProposalSchema>

const ExtractedNewsProposalsSchema = z.array(ExtractedNewsProposalSchema)

// ── Extraction: presidenciáveis ───────────────────────────────────────────────

/**
 * Extrai a lista de presidenciáveis de 2026 citados em um artigo de notícia.
 * Retorna [] em caso de falha — nunca lança.
 */
export async function extractPresidenciaveis(
  articleText: string,
): Promise<ExtractedCandidate[]> {
  if (articleText.trim().length < 200) return []

  const prompt = `Você é um assistente de análise política apartidário.
O texto abaixo é um artigo de imprensa sobre a eleição presidencial brasileira de 2026.

Extraia TODAS as pessoas citadas como candidatas, pré-candidatas ou cotadas à PRESIDÊNCIA DA REPÚBLICA em 2026.
NÃO inclua candidatos a governador, senador ou outros cargos.
NÃO inclua políticos citados apenas como apoiadores, ministros ou comentaristas.

Retorne APENAS um array JSON válido, sem markdown, sem explicações. Cada item:
{
  "name": "nome mais completo citado no texto",
  "party": "sigla do partido (ex: PT, PL, Novo) ou null se não citado",
  "status": "confirmado" | "pre_candidato" | "cotado" | "desistiu",
  "currentRole": "cargo atual (ex: 'Governador de Goiás') ou null",
  "homeState": "UF de origem/atuação (ex: 'GO') ou null",
  "pollFirstRoundPct": número (intenção de voto no 1º turno, se o texto citar) ou null
}

Regras:
- "desistiu" para quem o texto diz que retirou a candidatura ou optou por outro cargo
- Não invente dados que não estejam no texto
- Se o texto não fala de eleição presidencial, retorne []

TEXTO:
${articleText.slice(0, 24_000)}`

  try {
    const provider = createProvider()
    const raw = await provider.complete(prompt)
    const parsed = JSON.parse(extractJson(raw))
    return ExtractedCandidatesSchema.parse(parsed)
  } catch (err) {
    logger.error(
      '[presidential-extractor] extractPresidenciaveis failed',
      err instanceof Error ? err.message : err,
    )
    return []
  }
}

// ── Extraction: propostas atribuídas ──────────────────────────────────────────

/**
 * Extrai propostas/promessas de campanha atribuídas a presidenciáveis em um
 * artigo que pode citar vários candidatos.
 * Retorna [] em caso de falha — nunca lança.
 */
export async function extractProposalsFromNews(
  articleText: string,
): Promise<ExtractedNewsProposal[]> {
  if (articleText.trim().length < 200) return []

  const prompt = `Você é um assistente de análise política apartidário.
O texto abaixo é um artigo de imprensa sobre a eleição presidencial brasileira de 2026.

Extraia PROPOSTAS ou PROMESSAS DE CAMPANHA concretas atribuídas pelo texto a candidatos à Presidência.
Cada proposta deve ser algo que o candidato declarou que fará ou defende — não opiniões de terceiros sobre ele.

Retorne APENAS um array JSON válido, sem markdown, sem explicações. Cada item:
{
  "candidateName": "nome do candidato como citado no texto",
  "theme": "economia" | "saude" | "educacao" | "seguranca" | "meioambiente" | "tecnologia" | "politicaexterna" | "outros",
  "proposal": "a proposta em 1-2 frases, factual e neutra"
}

Regras:
- Só inclua propostas explicitamente atribuídas a um candidato no texto
- Não invente propostas; se não houver nenhuma, retorne []
- Máximo 2 frases por proposta

TEXTO:
${articleText.slice(0, 24_000)}`

  try {
    const provider = createProvider()
    const raw = await provider.complete(prompt)
    const parsed = JSON.parse(extractJson(raw))
    return ExtractedNewsProposalsSchema.parse(parsed)
  } catch (err) {
    logger.error(
      '[presidential-extractor] extractProposalsFromNews failed',
      err instanceof Error ? err.message : err,
    )
    return []
  }
}
