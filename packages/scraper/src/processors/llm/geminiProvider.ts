import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai'
import { BaseLLMProvider } from './baseProvider'

const MODEL = 'gemini-1.5-pro'
const MAX_TOKENS = 2_048

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

export class GeminiProvider extends BaseLLMProvider {
  protected readonly providerName = 'gemini'

  async complete(prompt: string): Promise<string> {
    const result = await getModel().generateContent(prompt)
    return result.response.text()
  }
}
