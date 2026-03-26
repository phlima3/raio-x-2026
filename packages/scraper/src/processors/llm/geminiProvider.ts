import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai'
import { logger } from '../../utils/logger'
import {
  LLMProvider,
  ProposalsByTheme,
  ProposalsByThemeSchema,
} from './types'

const MODEL = 'gemini-1.5-pro'
const MAX_TOKENS = 2_048

// ── JSON extraction (same helper as GroqProvider) ─────────────────────────────

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

// ── Singleton model ───────────────────────────────────────────────────────────

let model: GenerativeModel | null = null

function getModel(): GenerativeModel {
  if (!model) {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error('GEMINI_API_KEY not configured')
    model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
      model: MODEL,
      generationConfig: {
        maxOutputTokens: MAX_TOKENS,
        temperature: 0.2,
      },
    })
  }
  return model
}

// ── GeminiProvider ────────────────────────────────────────────────────────────

export class GeminiProvider implements LLMProvider {
  private async complete(prompt: string): Promise<string> {
    const result = await getModel().generateContent(prompt)
    return result.response.text()
  }

  async extractProposals(text: string): Promise<ProposalsByTheme> {
    if (text.trim().length < 50) {
      logger.warn('[gemini] extractProposals: input too short, skipping')
      return ProposalsByThemeSchema.parse({})
    }

    const prompt = `Você é um assistente de análise política apartidário.
Analise o texto abaixo e extraia as propostas do candidato.

Retorne APENAS JSON válido, sem markdown, sem explicações adicionais.

Schema:
{
  "economia": string[],
  "saude": string[],
  "educacao": string[],
  "seguranca": string[],
  "meioambiente": string[],
  "tecnologia": string[],
  "politicaexterna": string[],
  "outros": string[]
}

Regras:
- Máximo 2 frases por proposta
- Seja factual, sem julgamento de valor
- Se não houver propostas para um tema, retorne []
- Não invente propostas que não estejam no texto

TEXTO:
${text.slice(0, 12_000)}`

    try {
      const raw = await this.complete(prompt)
      const json = extractJson(raw)
      return ProposalsByThemeSchema.parse(JSON.parse(json))
    } catch (err) {
      logger.error('[gemini] extractProposals failed to parse response', err instanceof Error ? err.message : err)
      return ProposalsByThemeSchema.parse({})
    }
  }

  async summarizeProposal(ementa: string, text: string): Promise<string> {
    const prompt = `Explique o seguinte projeto de lei em linguagem simples, como se estivesse explicando para alguém que não tem conhecimento jurídico.

Máximo 3 frases. Seja neutro e factual. Responda em português brasileiro.

EMENTA: ${ementa}

TEXTO: ${text.slice(0, 4_000)}`

    try {
      const result = await this.complete(prompt)
      return result.trim().slice(0, 800)
    } catch (err) {
      logger.error('[gemini] summarizeProposal failed', err instanceof Error ? err.message : err)
      return ementa.slice(0, 800)
    }
  }

  async summarizeBio(bioText: string, candidateName: string): Promise<string> {
    const prompt = `Escreva um resumo biográfico de 2 frases sobre ${candidateName}, com base no texto abaixo.

Seja factual, neutro e direto ao ponto. Responda em português brasileiro.

TEXTO:
${bioText.slice(0, 4_000)}`

    try {
      const result = await this.complete(prompt)
      return result.trim().slice(0, 500)
    } catch (err) {
      logger.error('[gemini] summarizeBio failed', err instanceof Error ? err.message : err)
      return bioText.slice(0, 500)
    }
  }

  async compareProposals(
    theme: string,
    proposalsA: string[],
    proposalsB: string[],
    nameA: string,
    nameB: string,
  ): Promise<string> {
    if (proposalsA.length === 0 && proposalsB.length === 0) {
      return `Nenhum dos candidatos apresentou propostas sobre ${theme}.`
    }

    const prompt = `Compare as propostas dos dois candidatos abaixo sobre o tema "${theme}".

Escreva 2 a 3 frases em português brasileiro, de forma neutra e factual, destacando semelhanças e diferenças.
Não faça julgamentos de valor, apenas descreva as posições.

${nameA.toUpperCase()}:
${proposalsA.length > 0 ? proposalsA.map((p) => `- ${p}`).join('\n') : '(Sem propostas declaradas)'}

${nameB.toUpperCase()}:
${proposalsB.length > 0 ? proposalsB.map((p) => `- ${p}`).join('\n') : '(Sem propostas declaradas)'}`

    try {
      const result = await this.complete(prompt)
      return result.trim().slice(0, 1_000)
    } catch (err) {
      logger.error('[gemini] compareProposals failed', err instanceof Error ? err.message : err)
      return `Comparação indisponível para o tema ${theme}.`
    }
  }
}
