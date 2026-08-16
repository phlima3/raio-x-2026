import { GoogleGenerativeAI } from '@google/generative-ai'
import { z } from 'zod'
import { logger } from '../utils/logger'

// ── Schema ────────────────────────────────────────────────────────────────────

const ContradictionResultSchema = z.object({
  hasContradiction: z.boolean(),
  explanation: z.string(),
  proposalId: z.string().nullable(),
})

export type ContradictionResult = z.infer<typeof ContradictionResultSchema>

export interface ProposalRef {
  id: string
  title: string
  description: string | null
  summary: string | null
}

// ── JSON extraction ───────────────────────────────────────────────────────────

function extractJson(raw: string): string {
  const stripped = raw.replace(/```(?:json)?\s*([\s\S]*?)```/g, '$1').trim()
  const start = stripped.search(/[{[]/)
  if (start === -1) return stripped
  let depth = 0
  let end = -1
  const open = stripped[start]
  const close = open === '{' ? '}' : ']'
  for (let i = start; i < stripped.length; i++) {
    if (stripped[i] === open) depth++
    else if (stripped[i] === close) {
      depth--
      if (depth === 0) { end = i; break }
    }
  }
  return end !== -1 ? stripped.slice(start, end + 1) : stripped
}

// ── Gemini client (no Search Grounding — analysis only) ───────────────────────

function getModel() {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured')
  const genAI = new GoogleGenerativeAI(apiKey)
  return genAI.getGenerativeModel({
    model: 'gemini-1.5-pro',
    generationConfig: { maxOutputTokens: 1_024, temperature: 0.1 },
  })
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Detects whether a news item contradicts a candidate's declared proposals.
 *
 * Returns `null` only when there are no proposals to compare against.
 * Provider and validation failures are rethrown so callers preserve the last
 * reviewed contradiction state rather than silently replacing it with false.
 * Only flags *clear and direct* contradictions — ambiguous or weak conflicts
 * are not reported to avoid false positives.
 */
export async function detectContradiction(
  headline: string,
  summary: string,
  proposals: ProposalRef[],
): Promise<ContradictionResult | null> {
  if (proposals.length === 0) return null

  const proposalText = proposals
    .map((p) => `[ID: ${p.id}] ${p.title}: ${p.summary ?? p.description ?? ''}`)
    .join('\n')

  const prompt = `Você é um analista político imparcial. Analise se a notícia abaixo contradiz diretamente alguma proposta declarada do candidato.

NOTÍCIA:
Título: ${headline}
Resumo: ${summary}

PROPOSTAS DECLARADAS DO CANDIDATO:
${proposalText}

Responda APENAS com JSON válido, sem markdown:
{
  "hasContradiction": true ou false,
  "explanation": "explicação factual e neutra em 1-2 frases, ou string vazia se não há contradição",
  "proposalId": "o ID da proposta contraditada (exatamente como aparece acima), ou null"
}

Critério: hasContradiction = true APENAS se a contradição for clara, direta e inequívoca.
Divergências menores, nuances ou incertezas = false.`

  try {
    const model = getModel()
    const result = await model.generateContent(prompt)
    const raw = result.response.text()
    const json = extractJson(raw)
    return ContradictionResultSchema.parse(JSON.parse(json))
  } catch (err) {
    logger.error(
      '[contradiction-detector] Analysis failed',
      err instanceof Error ? err.message : err,
    )
    throw err
  }
}

// ── Topic → Proposal category mapping ────────────────────────────────────────

export const TOPIC_TO_CATEGORY: Record<string, string> = {
  economia: 'Economia',
  seguranca: 'Segurança',
  meioambiente: 'Meio Ambiente',
  educacao: 'Educação',
  saude: 'Saúde',
}
