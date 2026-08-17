import { LLMProvider } from './types'
import { GroqProvider } from './groqProvider'
import { GeminiProvider } from './geminiProvider'
import { OllamaProvider } from './ollamaProvider'
import { FallbackLLMProvider } from './fallbackProvider'

export type { LLMProvider, ProposalsByTheme, ConsistencyResult } from './types'
export { ProposalsByThemeSchema, ConsistencySchema } from './types'
export { GroqProvider } from './groqProvider'
export { GeminiProvider } from './geminiProvider'
export { OllamaProvider } from './ollamaProvider'
export { FallbackLLMProvider } from './fallbackProvider'
export { extractJson } from './json'

let _provider: LLMProvider | null = null

function buildProvider(name: string): LLMProvider {
  if (name === 'gemini') return new GeminiProvider()
  if (name === 'ollama') return new OllamaProvider()
  return new GroqProvider()
}

/**
 * Returns a singleton LLM provider selected by the LLM_PROVIDER env var.
 * Defaults to Groq — free tier, no billing setup required.
 * Use `ollama` para rodar um modelo local (OLLAMA_BASE_URL / OLLAMA_MODEL).
 *
 * `LLM_PROVIDER` aceita uma lista separada por vírgula: o primeiro atende e os
 * seguintes cobrem a queda dele. `gemini,ollama` é o arranjo pensado para os
 * planos de governo — o Gemini engole o documento inteiro numa chamada, e
 * quando a cota diária do free tier acaba o modelo local termina a rodada.
 */
export function createProvider(): LLMProvider {
  if (_provider) return _provider

  const names = (process.env.LLM_PROVIDER ?? 'groq')
    .toLowerCase()
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)

  const providers = (names.length > 0 ? names : ['groq']).map(buildProvider)
  _provider = providers.length === 1 ? providers[0] : new FallbackLLMProvider(providers)

  return _provider
}
