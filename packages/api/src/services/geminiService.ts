/**
 * LLM service for the API package.
 * Provider selected via LLM_PROVIDER env var: "groq" (default) or "gemini".
 * Thin wrapper — prompts live in the respective provider implementations.
 */

import Groq from 'groq-sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'

type Provider = 'groq' | 'gemini'

function getProvider(): Provider {
  return (process.env.LLM_PROVIDER ?? 'groq').toLowerCase() === 'gemini' ? 'gemini' : 'groq'
}

// ── Groq client ───────────────────────────────────────────────────────────────

let groqClient: Groq | null = null
function getGroq(): Groq {
  if (!groqClient) {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) throw new Error('GROQ_API_KEY not configured')
    groqClient = new Groq({ apiKey })
  }
  return groqClient
}

async function groqComplete(prompt: string): Promise<string> {
  const res = await getGroq().chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    max_tokens: 1_024,
    temperature: 0.2,
    messages: [{ role: 'user', content: prompt }],
  })
  return res.choices[0]?.message?.content ?? ''
}

// ── Gemini client ─────────────────────────────────────────────────────────────

let geminiClient: GoogleGenerativeAI | null = null
function getGemini(): GoogleGenerativeAI {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error('GEMINI_API_KEY not configured')
    geminiClient = new GoogleGenerativeAI(apiKey)
  }
  return geminiClient
}

async function geminiComplete(prompt: string): Promise<string> {
  const model = getGemini().getGenerativeModel({
    model: 'gemini-1.5-pro',
    generationConfig: { maxOutputTokens: 1_024, temperature: 0.2 },
  })
  const result = await model.generateContent(prompt)
  return result.response.text()
}

// ── Unified complete ──────────────────────────────────────────────────────────

async function complete(prompt: string): Promise<string> {
  return getProvider() === 'gemini' ? geminiComplete(prompt) : groqComplete(prompt)
}

// ── Public functions ──────────────────────────────────────────────────────────

export async function summarizeBio(rawBio: string, candidateName: string): Promise<string> {
  const prompt = `Escreva um resumo biográfico de 2 frases sobre ${candidateName}, com base no texto abaixo. Seja factual, neutro e direto. Responda em português brasileiro.\n\nTEXTO:\n${rawBio.slice(0, 4_000)}`
  try {
    return (await complete(prompt)).trim().slice(0, 500)
  } catch {
    return rawBio.slice(0, 500)
  }
}

export async function summarizeProposal(
  title: string,
  description: string,
): Promise<string> {
  const prompt = `Explique o seguinte projeto de lei em linguagem simples, para alguém sem conhecimento jurídico. Máximo 3 frases. Neutro e factual. Em português brasileiro.\n\nTÍTULO: ${title}\n\nDESCRIÇÃO: ${description.slice(0, 3_000)}`
  try {
    return (await complete(prompt)).trim().slice(0, 800)
  } catch {
    return description.slice(0, 800)
  }
}

export async function compareProposals(
  theme: string,
  proposalsA: string[],
  proposalsB: string[],
  nameA: string,
  nameB: string,
): Promise<string> {
  if (proposalsA.length === 0 && proposalsB.length === 0) {
    return `Nenhum dos candidatos apresentou propostas sobre ${theme}.`
  }
  const prompt = `Compare as propostas dos candidatos sobre o tema "${theme}". Escreva 2 a 3 frases em português brasileiro, de forma neutra, destacando semelhanças e diferenças.\n\n${nameA.toUpperCase()}:\n${proposalsA.length > 0 ? proposalsA.map((p) => `- ${p}`).join('\n') : '(Sem propostas)'}\n\n${nameB.toUpperCase()}:\n${proposalsB.length > 0 ? proposalsB.map((p) => `- ${p}`).join('\n') : '(Sem propostas)'}`
  try {
    return (await complete(prompt)).trim().slice(0, 1_000)
  } catch {
    return `Comparação indisponível para o tema ${theme}.`
  }
}

// ── Consistency analysis ───────────────────────────────────────────────────────

export interface ConsistencyAnalysis {
  score: number // 0–100
  label: 'Alto' | 'Médio' | 'Baixo' | 'Sem dados'
  explanation: string
  contradictions: Array<{ proposal: string; vote: string; description: string }>
}

export async function analyzeConsistency(
  candidateName: string,
  theme: string,
  proposals: string[],
  votes: Array<{ proposalName: string; voteType: string; votedAt: string }>,
): Promise<ConsistencyAnalysis> {
  if (proposals.length === 0) {
    return {
      score: 0,
      label: 'Sem dados',
      explanation: `${candidateName} não possui propostas registradas sobre ${theme}.`,
      contradictions: [],
    }
  }

  const relevantVotes = votes.slice(0, 40)
  const votesText = relevantVotes.length > 0
    ? relevantVotes.map((v) => `- [${v.voteType}] ${v.proposalName} (${v.votedAt})`).join('\n')
    : '(Nenhuma votação relevante encontrada)'

  const proposalsText = proposals.map((p) => `- ${p}`).join('\n')

  const prompt = `Você é um analista político neutro. Analise a consistência entre as propostas declaradas e o histórico de votações de ${candidateName} no tema "${theme}".

PROPOSTAS DECLARADAS:
${proposalsText}

VOTAÇÕES RELEVANTES (como votou em projetos do Congresso):
${votesText}

Responda SOMENTE com JSON válido no formato abaixo (sem markdown, sem explicação fora do JSON):
{
  "score": <número de 0 a 100, onde 100 = totalmente consistente>,
  "label": <"Alto" se score >= 70, "Médio" se >= 40, "Baixo" se < 40>,
  "explanation": "<2-3 frases em português explicando a consistência ou inconsistência>",
  "contradictions": [
    {
      "proposal": "<trecho da proposta>",
      "vote": "<nome do projeto votado>",
      "description": "<por que há contradição>"
    }
  ]
}`

  try {
    const raw = await complete(prompt)
    const json = extractJson(raw)
    const parsed = JSON.parse(json) as ConsistencyAnalysis
    parsed.score = Math.max(0, Math.min(100, Number(parsed.score) || 0))
    parsed.label = parsed.score >= 70 ? 'Alto' : parsed.score >= 40 ? 'Médio' : parsed.score > 0 ? 'Baixo' : 'Sem dados'
    parsed.explanation = String(parsed.explanation ?? '').slice(0, 1_000)
    parsed.contradictions = Array.isArray(parsed.contradictions) ? parsed.contradictions.slice(0, 5) : []
    return parsed
  } catch {
    return {
      score: 50,
      label: 'Médio',
      explanation: `Não foi possível analisar a consistência de ${candidateName} sobre ${theme}.`,
      contradictions: [],
    }
  }
}

function extractJson(text: string): string {
  const stripped = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}')
  if (start !== -1 && end !== -1 && end > start) {
    return stripped.slice(start, end + 1)
  }
  return stripped
}
