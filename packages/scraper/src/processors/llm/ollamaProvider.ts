import axios from 'axios'
import { BaseLLMProvider } from './baseProvider'

const DEFAULT_BASE_URL = 'http://localhost:11434'
const DEFAULT_MODEL = 'llama3.1:8b'
const TEMPERATURE = 0.2
const MAX_TOKENS = 2_048
// Local models on consumer hardware can take minutes on long prompts
const TIMEOUT_MS = 300_000

interface OllamaChatResponse {
  message?: { content?: string }
}

/**
 * Provider for local models served by Ollama (https://ollama.com).
 *
 * Env vars:
 *   LLM_PROVIDER=ollama
 *   OLLAMA_BASE_URL=http://localhost:11434   (default)
 *   OLLAMA_MODEL=llama3.1:8b                 (default)
 *
 * Modelos recomendados para extração de propostas em PT-BR:
 *   llama3.1:8b — bom equilíbrio qualidade/velocidade (8GB RAM)
 *   qwen2.5:14b — melhor em JSON estruturado (16GB RAM)
 *   llama3.3:70b — qualidade próxima do Groq (GPU 48GB+ ou muito lento)
 */
export class OllamaProvider extends BaseLLMProvider {
  protected readonly providerName = 'ollama'

  private readonly baseUrl: string
  private readonly model: string

  constructor() {
    super()
    this.baseUrl = (process.env.OLLAMA_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, '')
    this.model = process.env.OLLAMA_MODEL ?? DEFAULT_MODEL
  }

  async complete(prompt: string): Promise<string> {
    const res = await axios.post<OllamaChatResponse>(
      `${this.baseUrl}/api/chat`,
      {
        model: this.model,
        stream: false,
        messages: [{ role: 'user', content: prompt }],
        options: {
          temperature: TEMPERATURE,
          num_predict: MAX_TOKENS,
        },
      },
      { timeout: TIMEOUT_MS },
    )

    return res.data.message?.content ?? ''
  }
}
