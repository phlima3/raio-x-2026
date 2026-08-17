import axios from 'axios'
import { BaseLLMProvider } from './baseProvider'

// `localhost` resolve para ::1 no Node, e o Ollama escuta em IPv4: o endereço
// literal evita um ECONNREFUSED que parece servidor fora do ar.
const DEFAULT_BASE_URL = 'http://127.0.0.1:11434'
const DEFAULT_MODEL = 'llama3.1:8b'
const TEMPERATURE = 0.2
const MAX_TOKENS = 2_048

/**
 * O Ollama não usa o contexto do modelo por padrão — usa o dele, bem menor, e
 * descarta o começo do prompt em silêncio. Sem declarar `num_ctx`, mandar um
 * plano de governo faz o modelo ler só o fim do texto e responder com cara de
 * quem leu tudo. `qwen2.5` aguenta 32k; 16k equilibra leitura e memória.
 */
const DEFAULT_NUM_CTX = 16_384

/** ~3,5 caracteres por token em PT-BR, menos a folga do prompt e da resposta. */
const CHARS_PER_TOKEN = 3.5
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
 *   OLLAMA_BASE_URL=http://127.0.0.1:11434  (default)
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
  private readonly numCtx: number
  readonly inputBudget: number

  constructor() {
    super()
    this.baseUrl = (process.env.OLLAMA_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, '')
    this.model = process.env.OLLAMA_MODEL ?? DEFAULT_MODEL
    const configured = Number(process.env.OLLAMA_NUM_CTX)
    this.numCtx = Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_NUM_CTX
    // O orçamento de entrada nasce da janela declarada: pedir mais texto do que
    // cabe é o mesmo que truncar, só que sem saber onde.
    this.inputBudget = Math.floor((this.numCtx - MAX_TOKENS) * CHARS_PER_TOKEN)
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
          num_ctx: this.numCtx,
        },
      },
      { timeout: TIMEOUT_MS },
    )

    return res.data.message?.content ?? ''
  }
}
