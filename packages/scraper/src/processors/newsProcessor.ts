import { GoogleGenerativeAI } from '@google/generative-ai'
import { z } from 'zod'
import { extractJson } from './llm'
import { logger } from '../utils/logger'

// ── Schema ────────────────────────────────────────────────────────────────────

const NewsItemSchema = z.object({
  date: z.string().nullable().optional(),
  headline: z.string().min(1),
  summary: z.string().min(1),
  source: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  topic: z.string(),
})

export type RawNewsItem = z.infer<typeof NewsItemSchema>

const NewsItemsSchema = z.array(NewsItemSchema)

// ── Gemini client (with Search Grounding) ─────────────────────────────────────

function getGroundedModel() {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured')

  const genAI = new GoogleGenerativeAI(apiKey)
  return genAI.getGenerativeModel({
    model: 'gemini-1.5-pro',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: [{ googleSearch: {} } as any],
    generationConfig: {
      maxOutputTokens: 2_048,
      temperature: 0.2,
    },
  })
}

// ── Main export ───────────────────────────────────────────────────────────────

export const TOPICS = ['economia', 'seguranca', 'meioambiente', 'educacao', 'saude'] as const
export type Topic = (typeof TOPICS)[number]

const TOPIC_LABELS: Record<Topic, string> = {
  economia: 'economia e finanças',
  seguranca: 'segurança pública',
  meioambiente: 'meio ambiente',
  educacao: 'educação',
  saude: 'saúde',
}

/**
 * Fetches recent news/statements for a candidate on a given topic using
 * Gemini 1.5 Pro with Search Grounding (last 30 days).
 *
 * Returns an empty array only when the provider confirms an empty result.
 * Provider, transport and validation failures are logged and rethrown so
 * callers never confuse an outage with a destructive empty snapshot.
 */
export async function fetchCandidateNews(
  candidateName: string,
  topic: Topic,
): Promise<RawNewsItem[]> {
  const label = TOPIC_LABELS[topic]
  const prompt = `Busque declarações e posições recentes de ${candidateName} sobre ${label} nos últimos 30 dias.

Retorne APENAS um array JSON válido, sem markdown, sem explicações adicionais. Cada item deve ter:
{
  "date": "YYYY-MM-DD ou null",
  "headline": "título curto da declaração ou notícia (max 150 chars)",
  "summary": "resumo em 2-3 frases em português do que foi dito ou proposto",
  "source": "nome do veículo de imprensa ou fonte, ou null",
  "url": "URL da notícia, ou null",
  "topic": "${topic}"
}

Retorne entre 0 e 5 itens. Se não houver declarações recentes relevantes, retorne [].
Seja factual e neutro. Não invente informações.`

  try {
    const model = getGroundedModel()
    const result = await model.generateContent(prompt)
    const raw = result.response.text()
    const json = extractJson(raw)
    const parsed = JSON.parse(json)
    return NewsItemsSchema.parse(parsed)
  } catch (err) {
    logger.error(
      `[news-processor] Failed to fetch news for ${candidateName}/${topic}`,
      err instanceof Error ? err.message : err,
    )
    throw err
  }
}
