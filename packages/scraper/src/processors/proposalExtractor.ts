import { createScraperPrismaClient } from '../utils/prisma'
import { ProposalOrigin, ProposalStatus, type PrismaClient } from '@prisma/client'
import { createProvider, ProposalsByTheme } from './llm'
import { logger } from '../utils/logger'

const prisma = createScraperPrismaClient()

// ── HTML → plain text ─────────────────────────────────────────────────────────

/**
 * Strips HTML tags and normalises whitespace.
 * Preserves newlines at block-level elements for readability.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<(br|p|div|li|h[1-6]|tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ProcessedProposal {
  externalId: string
  source: string
  title: string
  description: string
  category: string
  tags: string[]
  status: ProposalStatus
  sourceUrl: string
  candidateId: string
}

const THEME_LABELS: Record<keyof ProposalsByTheme, string> = {
  economia: 'Economia',
  saude: 'Saúde',
  educacao: 'Educação',
  seguranca: 'Segurança',
  meioambiente: 'Meio Ambiente',
  tecnologia: 'Tecnologia',
  politicaexterna: 'Política Externa',
  outros: 'Outros',
}

// ── Core pipeline ─────────────────────────────────────────────────────────────

/**
 * Extracts and persists proposals from a candidate site's HTML.
 *
 * @param html        - Raw HTML from the candidate page
 * @param sourceUrl   - URL of the page (used as source reference)
 * @param candidateId - Internal Prisma candidate id
 * @param candidateName - Display name used in logging
 * @returns Number of proposals saved to the database
 */
export async function processProposalsFromSite(
  html: string,
  sourceUrl: string,
  candidateId: string,
  candidateName: string,
): Promise<number> {
  logger.info(`[extractor] Processing proposals from ${sourceUrl} for ${candidateName}`)

  const text = htmlToText(html)
  if (text.length < 50) {
    logger.warn(`[extractor] Text too short after stripping HTML (${text.length} chars) — skipping`)
    return 0
  }

  const provider = createProvider()
  const byTheme = await provider.extractProposals(text)

  const proposals = flattenByTheme(byTheme, candidateId, sourceUrl)
  if (proposals.length === 0) {
    logger.info(`[extractor] No proposals extracted from ${sourceUrl}`)
    return 0
  }

  const saved = await persistExtractedProposals(proposals)
  logger.info(`[extractor] ${saved} proposals saved for ${candidateName}`)
  return saved
}

/**
 * Generates a plain-language summary for a bill (PL/Matéria).
 * Returns the original ementa if the LLM call fails.
 */
export async function summarizeProposal(
  ementa: string,
  fullText: string,
): Promise<string> {
  const provider = createProvider()
  return provider.summarizeProposal(ementa, fullText)
}

/**
 * Generates a concise bio summary for a candidate.
 * Returns the original bio if the LLM call fails.
 */
export async function summarizeBio(
  bioText: string,
  candidateName: string,
): Promise<string> {
  const provider = createProvider()
  return provider.summarizeBio(bioText, candidateName)
}

/**
 * Returns a neutral comparison of two candidates' proposals on a theme.
 */
export async function compareProposals(
  theme: string,
  proposalsA: string[],
  proposalsB: string[],
  nameA: string,
  nameB: string,
): Promise<string> {
  const provider = createProvider()
  return provider.compareProposals(theme, proposalsA, proposalsB, nameA, nameB)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function flattenByTheme(
  byTheme: ProposalsByTheme,
  candidateId: string,
  sourceUrl: string,
): ProcessedProposal[] {
  const results: ProcessedProposal[] = []

  for (const [themeKey, proposals] of Object.entries(byTheme) as [keyof ProposalsByTheme, string[]][]) {
    for (const [i, description] of proposals.entries()) {
      if (!description.trim()) continue

      const category = THEME_LABELS[themeKey]
      const title = `${category} — proposta ${i + 1}`
      const externalId = `site_${candidateId}_${themeKey}_${i}`

      results.push({
        externalId,
        source: 'candidate_site',
        title,
        description: description.trim(),
        category,
        tags: [themeKey],
        status: ProposalStatus.DRAFT,
        sourceUrl,
        candidateId,
      })
    }
  }

  return results
}

type ProposalPersistence = Pick<PrismaClient, 'proposal'>

export async function persistExtractedProposals(
  proposals: ProcessedProposal[],
  db: ProposalPersistence = prisma,
): Promise<number> {
  let saved = 0

  for (const p of proposals) {
    try {
      const existing = await db.proposal.findUnique({
        where: { externalId: p.externalId },
        select: { reviewedAt: true },
      })
      if (existing?.reviewedAt) {
        saved++
        continue
      }
      await db.proposal.upsert({
        where: { externalId: p.externalId },
        update: {
          title: p.title,
          description: p.description,
          category: p.category,
          tags: p.tags,
          status: ProposalStatus.DRAFT,
          isPublished: false,
          origin: ProposalOrigin.AI_EXTRACTION,
        },
        create: {
          externalId: p.externalId,
          source: p.source,
          title: p.title,
          description: p.description,
          category: p.category,
          tags: p.tags,
          status: p.status,
          isPublished: false,
          origin: ProposalOrigin.AI_EXTRACTION,
          url: p.sourceUrl,
          candidateId: p.candidateId,
        },
      })
      saved++
    } catch (err) {
      logger.error(
        `[extractor] Failed to save proposal ${p.externalId}`,
        err instanceof Error ? err.message : err,
      )
      throw err
    }
  }

  return saved
}
