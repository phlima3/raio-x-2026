import { LLMProvider } from './types'
import { GroqProvider } from './groqProvider'
import { GeminiProvider } from './geminiProvider'
import { OllamaProvider } from './ollamaProvider'

export type { LLMProvider, ProposalsByTheme, ConsistencyResult } from './types'
export { ProposalsByThemeSchema, ConsistencySchema } from './types'
export { GroqProvider } from './groqProvider'
export { GeminiProvider } from './geminiProvider'
export { OllamaProvider } from './ollamaProvider'
export { extractJson } from './json'

let _provider: LLMProvider | null = null

/**
 * Returns a singleton LLM provider selected by the LLM_PROVIDER env var.
 * Defaults to Groq — free tier, no billing setup required.
 * Use `ollama` para rodar um modelo local (OLLAMA_BASE_URL / OLLAMA_MODEL).
 */
export function createProvider(): LLMProvider {
  if (_provider) return _provider

  const name = (process.env.LLM_PROVIDER ?? 'groq').toLowerCase()

  if (name === 'gemini') {
    _provider = new GeminiProvider()
  } else if (name === 'ollama') {
    _provider = new OllamaProvider()
  } else {
    _provider = new GroqProvider()
  }

  return _provider
}
