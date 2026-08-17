import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai'
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

export class GeminiProvider extends BaseLLMProvider {
  protected readonly providerName = 'gemini'
  readonly inputBudget = INPUT_BUDGET

  async complete(prompt: string): Promise<string> {
    const result = await getModel().generateContent(prompt)
    return result.response.text()
  }
}
