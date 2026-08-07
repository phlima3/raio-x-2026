import { PrismaClient, ProposalStatus } from '@prisma/client'
import { createProvider, ProposalsByTheme } from './llm'
import { logger } from '../utils/logger'
import { invalidateApiCandidateCaches } from '../utils/invalidateApiCache'
import { revalidateCandidatePages } from '../utils/revalidateWeb'

const prisma = new PrismaClient()

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
  }

  const changed = await persistProposals(proposals, { candidateId, sourceUrl })
  if (changed > 0) {
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      select: { slug: true, name: true, party: true, state: true },
    })
    await invalidateApiCandidateCaches()
    if (candidate) {
      const slug = candidate.slug ?? [candidate.name, candidate.party, candidate.state]
        .map((value) => value
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, ''))
        .join('-')
      await revalidateCandidatePages([slug])
    }
  }
  logger.info(`[extractor] ${changed} proposal records reconciled for ${candidateName}`)
  return changed
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
      const title = proposalTitleFromDescription(category, description)
      const externalId = `site_${candidateId}_${themeKey}_${i}`

      results.push({
        externalId,
        source: 'candidate_site',
        title,
        description: description.trim(),
        category,
        tags: [themeKey],
        status: ProposalStatus.SUBMITTED,
        sourceUrl,
        candidateId,
      })
    }
  }

  return results
}

export function proposalTitleFromDescription(
  category: string,
  description: string,
): string {
  const compact = description.replace(/\s+/g, ' ').trim()
  const firstSentence = compact.split(/(?<=[.!?])\s+/)[0].replace(/[.!?]+$/, '').trim()
  const excerpt = firstSentence.slice(0, 140).trim()
  return excerpt.length >= 12
    ? excerpt
    : `${category}: ${compact.slice(0, 120).trim()}`
}

interface ExistingProposalSnapshot {
  id: string
  externalId: string | null
  source: string
  title: string
  description: string | null
  category: string | null
  tags: string[]
  status: ProposalStatus
  url: string | null
  candidateId: string
}

interface ProposalSourceSnapshot {
  candidateId: string
  sourceUrl: string
}

function sameTags(left: string[], right: string[]): boolean {
  return [...left].sort().join('\u0000') === [...right].sort().join('\u0000')
}

export function hasProposalMaterialChange(
  existing: Omit<ExistingProposalSnapshot, 'id'> | undefined,
  incoming: ProcessedProposal,
): boolean {
  return (
    !existing ||
    existing.source !== incoming.source ||
    existing.title !== incoming.title ||
    existing.description !== incoming.description ||
    existing.category !== incoming.category ||
    !sameTags(existing.tags, incoming.tags) ||
    existing.status !== incoming.status ||
    existing.url !== incoming.sourceUrl ||
    existing.candidateId !== incoming.candidateId
  )
}

export function isProposalMissingFromSource(
  existing: Pick<
    ExistingProposalSnapshot,
    'externalId' | 'source' | 'status' | 'url' | 'candidateId'
  >,
  currentExternalIds: ReadonlySet<string>,
  snapshot: ProposalSourceSnapshot,
): boolean {
  return (
    existing.source === 'candidate_site' &&
    existing.candidateId === snapshot.candidateId &&
    existing.url === snapshot.sourceUrl &&
    existing.status !== ProposalStatus.DRAFT &&
    (!existing.externalId || !currentExternalIds.has(existing.externalId))
  )
}

async function persistProposals(
  proposals: ProcessedProposal[],
  snapshot: ProposalSourceSnapshot,
): Promise<number> {
  const candidateIds = new Set(proposals.map((proposal) => proposal.candidateId))
  if (candidateIds.size > 1 || (candidateIds.size === 1 && !candidateIds.has(snapshot.candidateId))) {
    throw new Error('A batch of extracted proposals must belong to exactly one candidate')
  }
  const candidateId = snapshot.candidateId
  const externalIds = proposals.map((proposal) => proposal.externalId)

  const existing = await prisma.proposal.findMany({
    where: {
      OR: [
        ...(externalIds.length > 0 ? [{ externalId: { in: externalIds } }] : []),
        {
          candidateId,
          source: 'candidate_site',
          url: snapshot.sourceUrl,
        },
      ],
    },
    select: {
      id: true,
      externalId: true,
      source: true,
      title: true,
      description: true,
      category: true,
      tags: true,
      status: true,
      url: true,
      candidateId: true,
    },
  })
  const existingByExternalId = new Map(
    existing
      .filter((proposal): proposal is typeof proposal & { externalId: string } =>
        Boolean(proposal.externalId),
      )
      .map((proposal) => [proposal.externalId, proposal]),
  )
  const changed = proposals.filter((proposal) =>
    hasProposalMaterialChange(existingByExternalId.get(proposal.externalId), proposal),
  )
  const currentExternalIds = new Set(externalIds)
  const removed = existing.filter((proposal) =>
    isProposalMissingFromSource(proposal, currentExternalIds, snapshot),
  )
  if (changed.length === 0 && removed.length === 0) return 0

  const materialUpdatedAt = new Date()
  await prisma.$transaction([
    ...changed.map((proposal) =>
      prisma.proposal.upsert({
        where: { externalId: proposal.externalId },
        update: {
          source: proposal.source,
          title: proposal.title,
          description: proposal.description,
          category: proposal.category,
          tags: proposal.tags,
          status: proposal.status,
          url: proposal.sourceUrl,
          candidateId: proposal.candidateId,
        },
        create: {
          externalId: proposal.externalId,
          source: proposal.source,
          title: proposal.title,
          description: proposal.description,
          category: proposal.category,
          tags: proposal.tags,
          status: proposal.status,
          url: proposal.sourceUrl,
          candidateId: proposal.candidateId,
        },
      }),
    ),
    ...(removed.length > 0
      ? [
          prisma.proposal.updateMany({
            where: { id: { in: removed.map((proposal) => proposal.id) } },
            data: { status: ProposalStatus.DRAFT },
          }),
        ]
      : []),
    prisma.candidate.update({
      where: { id: candidateId },
      data: { materialUpdatedAt },
    }),
    prisma.consistencyScore.deleteMany({ where: { candidateId } }),
  ])

  return changed.length + removed.length
}
