/**
 * @deprecated Use createProvider() from './llm' instead.
 * This module re-exports GeminiProvider methods for backwards compatibility.
 */
import { GeminiProvider } from './llm'

const gemini = new GeminiProvider()

export interface ExtractedProposal {
  title: string
  description: string
  category: string
}

export async function extractProposalsFromHTML(
  html: string,
  _candidateName: string,
  _sourceUrl: string,
): Promise<ExtractedProposal[]> {
  const { htmlToText } = await import('./proposalExtractor')
  const text = htmlToText(html)
  const byTheme = await gemini.extractProposals(text)

  const results: ExtractedProposal[] = []
  for (const [theme, proposals] of Object.entries(byTheme)) {
    for (const p of proposals as string[]) {
      if (p.trim()) {
        results.push({ title: theme, description: p.trim(), category: theme })
      }
    }
  }
  return results
}

export async function summarizeText(text: string, _instruction: string): Promise<string> {
  return gemini.summarizeBio(text, '')
}

export async function classifyProposalCategory(
  title: string,
  description: string,
): Promise<string> {
  // Classification is now built into extractProposals — returns theme key directly
  const combined = `${title}: ${description}`
  const byTheme = await gemini.extractProposals(combined)
  const hit = Object.entries(byTheme).find(([, v]) => (v as string[]).length > 0)
  return hit ? hit[0] : 'outros'
}
