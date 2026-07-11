import Groq from 'groq-sdk'
import { BaseLLMProvider } from './baseProvider'

const MODEL = 'llama-3.3-70b-versatile'
const MAX_TOKENS = 2_048
const TEMPERATURE = 0.2 // Low temp for factual JSON output

// ── Singleton client ──────────────────────────────────────────────────────────

let groqClient: Groq | null = null

function getClient(): Groq {
  if (!groqClient) {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) throw new Error('GROQ_API_KEY not configured')
    groqClient = new Groq({ apiKey })
  }
  return groqClient
}

// ── GroqProvider ──────────────────────────────────────────────────────────────

export class GroqProvider extends BaseLLMProvider {
  protected readonly providerName = 'groq'

  async complete(prompt: string): Promise<string> {
    const client = getClient()

    const res = await client.chat.completions.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      messages: [{ role: 'user', content: prompt }],
    })

    return res.choices[0]?.message?.content ?? ''
  }
}
