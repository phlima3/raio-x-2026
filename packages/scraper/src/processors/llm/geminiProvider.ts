import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai'
import { logger } from '../../utils/logger'
import { BaseLLMProvider } from './baseProvider'

/**
 * Os modelos Pro não têm free tier e o `gemini-1.5-pro` que este arquivo pedia
 * nem existe mais — a API responde `NOT_FOUND`. Isso, e não um bug de ativação
 * de cota, é a origem do `limit: 0` registrado na documentação do projeto.
 * `gemini-2.5-flash` também já foi aposentado para chaves novas.
 */
const DEFAULT_MODEL = 'gemini-3.5-flash'

/**
 * Os Flash atuais raciocinam antes de responder e os tokens de pensamento saem
 * deste orçamento: uma extração real gastou 4.840 pensando para escrever 1.891.
 * Com 4.096 a resposta vem truncada (`finishReason: MAX_TOKENS`) e o JSON não
 * fecha.
 */
const MAX_OUTPUT_TOKENS = 32_768

/**
 * A janela é de 1M tokens: um plano de governo inteiro (320 mil caracteres, o
 * maior do acervo do TSE) cabe numa chamada, sem fatiar.
 */
const INPUT_BUDGET = 900_000

let model: GenerativeModel | null = null

function getModel(): GenerativeModel {
  if (!model) {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error('GEMINI_API_KEY not configured')
    model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
      model: process.env.GEMINI_MODEL ?? DEFAULT_MODEL,
      generationConfig: {
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        temperature: 0.2,
      },
    })
  }
  return model
}

/**
 * O free tier tem dois tetos e eles pedem respostas opostas:
 *
 * - `PerModelPerMinute` (250 mil tokens de entrada por minuto) é uma janela que
 *   passa sozinha, e o próprio erro diz em quantos segundos. Esperar resolve;
 * - `PerDayPerProject` (20 requisições por dia) não passa dentro da execução.
 *   Esperar aqui só atrasa a queda — quem cobre é o provider seguinte da cadeia.
 *
 * Tratar os dois como "429, tente de novo" desperdiça a janela num caso e trava
 * a rodada no outro. Foi este teto que deixou dois presidenciáveis sem propostas
 * numa execução que já tinha o documento em mãos.
 */
export function retryDelayMs(error: unknown): number | null {
  const message = error instanceof Error ? error.message : String(error)
  if (!message.includes('429')) return null
  if (message.includes('PerDay')) return null

  const asked = message.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/)
  if (asked) return Math.ceil(Number(asked[1]) * 1000) + 1_000
  return 60_000
}

const MAX_RETRIES = 3

export class GeminiProvider extends BaseLLMProvider {
  protected readonly providerName = 'gemini'
  readonly inputBudget = INPUT_BUDGET

  constructor(private readonly sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms))) {
    super()
  }

  async complete(prompt: string): Promise<string> {
    for (let attempt = 1; ; attempt++) {
      try {
        const result = await getModel().generateContent(prompt)
        return result.response.text()
      } catch (error) {
        const delay = attempt < MAX_RETRIES ? retryDelayMs(error) : null
        if (delay === null) throw error
        logger.warn(`[gemini] cota por minuto atingida; aguardando ${Math.round(delay / 1000)}s`)
        await this.sleep(delay)
      }
    }
  }
}
