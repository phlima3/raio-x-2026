import { logger } from '../../utils/logger'
import { extractJson } from './json'
import {
  LLMProvider,
  ProposalsByTheme,
  ProposalsByThemeSchema,
} from './types'

/**
 * Shared prompt logic for all LLM providers.
 * Concrete providers (Groq, Gemini, Ollama) only implement `complete()`.
 */
export abstract class BaseLLMProvider implements LLMProvider {
  /** Short provider name used in log prefixes (e.g. "groq"). */
  protected abstract readonly providerName: string

  /** Sends a raw prompt and returns the model's text response. */
  abstract complete(prompt: string): Promise<string>

  async extractProposals(text: string): Promise<ProposalsByTheme> {
    if (text.trim().length < 50) {
      logger.warn(`[${this.providerName}] extractProposals: input too short, skipping`)
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
      logger.error(
        `[${this.providerName}] extractProposals failed to parse response`,
        err instanceof Error ? err.message : err,
      )
      // A provider/parsing failure is not an authoritative empty snapshot.
      // Propagate it so callers preserve the last successfully published data.
      if (err instanceof Error) throw err
      throw new Error(String(err))
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
      logger.error(
        `[${this.providerName}] summarizeProposal failed`,
        err instanceof Error ? err.message : err,
      )
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
      logger.error(
        `[${this.providerName}] summarizeBio failed`,
        err instanceof Error ? err.message : err,
      )
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
      logger.error(
        `[${this.providerName}] compareProposals failed`,
        err instanceof Error ? err.message : err,
      )
      return `Comparação indisponível para o tema ${theme}.`
    }
  }
}
