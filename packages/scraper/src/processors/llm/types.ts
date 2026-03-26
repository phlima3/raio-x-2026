import { z } from 'zod'

// ── Zod schemas ───────────────────────────────────────────────────────────────

export const ProposalsByThemeSchema = z.object({
  economia: z.array(z.string()).default([]),
  saude: z.array(z.string()).default([]),
  educacao: z.array(z.string()).default([]),
  seguranca: z.array(z.string()).default([]),
  meioambiente: z.array(z.string()).default([]),
  tecnologia: z.array(z.string()).default([]),
  politicaexterna: z.array(z.string()).default([]),
  outros: z.array(z.string()).default([]),
})

export const ConsistencySchema = z.object({
  consistencyScore: z.number().int().min(0).max(100),
  contradictions: z.array(
    z.object({
      theme: z.string(),
      proposal: z.string(),
      vote: z.string(),
      severity: z.enum(['high', 'medium', 'low']),
    }),
  ),
})

export type ProposalsByTheme = z.infer<typeof ProposalsByThemeSchema>
export type ConsistencyResult = z.infer<typeof ConsistencySchema>

// ── Provider interface ────────────────────────────────────────────────────────

/**
 * All methods receive plain text (not raw HTML).
 * HTML stripping is the caller's responsibility (see proposalExtractor.ts).
 */
export interface LLMProvider {
  /**
   * Extracts proposals from clean text and classifies them by theme.
   * Returns empty arrays for themes with no proposals; never throws on
   * empty/short input — returns an empty ProposalsByTheme object instead.
   */
  extractProposals(text: string): Promise<ProposalsByTheme>

  /**
   * Summarises a bill (PL) in plain PT-BR (max 3 sentences).
   */
  summarizeProposal(ementa: string, text: string): Promise<string>

  /**
   * Generates a concise bio summary for a candidate (max 2 sentences).
   */
  summarizeBio(bioText: string, candidateName: string): Promise<string>

  /**
   * Compares proposals from two candidates on a given theme.
   * Returns a neutral 2–3 sentence comparison in PT-BR.
   */
  compareProposals(
    theme: string,
    proposalsA: string[],
    proposalsB: string[],
    nameA: string,
    nameB: string,
  ): Promise<string>
}
