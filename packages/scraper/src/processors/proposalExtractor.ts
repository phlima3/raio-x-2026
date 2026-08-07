import { PrismaClient, ProposalOrigin, ProposalStatus } from '@prisma/client'

import { createProvider, type ProposalsByTheme } from './llm'
import { invalidateApiCandidateCaches } from '../utils/invalidateApiCache'
import { logger } from '../utils/logger'
import { revalidateCandidatePages } from '../utils/revalidateWeb'

const prisma = new PrismaClient()

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
  const proposals = flattenByTheme(
    await provider.extractProposals(text),
    candidateId,
    sourceUrl,
  )
  const result = await reconcileExtractedProposals(
    proposals,
    { candidateId, sourceUrl },
  )
  logger.info(
    `[extractor] ${result.saved} hidden drafts saved and ${result.removed} stale proposals unpublished for ${candidateName}`,
  )
  return result.saved
}

export async function summarizeProposal(ementa: string, fullText: string): Promise<string> {
  return createProvider().summarizeProposal(ementa, fullText)
}

export async function summarizeBio(
  bioText: string,
  candidateName: string,
): Promise<string> {
  return createProvider().summarizeBio(bioText, candidateName)
}

export async function compareProposals(
  theme: string,
  proposalsA: string[],
  proposalsB: string[],
  nameA: string,
  nameB: string,
): Promise<string> {
  return createProvider().compareProposals(theme, proposalsA, proposalsB, nameA, nameB)
}

function flattenByTheme(
  byTheme: ProposalsByTheme,
  candidateId: string,
  sourceUrl: string,
): ProcessedProposal[] {
  const results: ProcessedProposal[] = []

  for (const [themeKey, proposals] of Object.entries(byTheme) as Array<[
    keyof ProposalsByTheme,
    string[],
  ]>) {
    for (const [index, description] of proposals.entries()) {
      if (!description.trim()) continue
      const category = THEME_LABELS[themeKey]
      results.push({
        externalId: `site_${candidateId}_${themeKey}_${index}`,
        source: 'candidate_site',
        title: proposalTitleFromDescription(category, description),
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

export function proposalTitleFromDescription(category: string, description: string): string {
  const compact = description.replace(/\s+/g, ' ').trim()
  const firstSentence = compact.split(/(?<=[.!?])\s+/)[0].replace(/[.!?]+$/, '').trim()
  const excerpt = firstSentence.slice(0, 140).trim()
  return excerpt.length >= 12 ? excerpt : `${category}: ${compact.slice(0, 120).trim()}`
}

interface ExistingProposalSnapshot {
  id?: string
  externalId: string | null
  source: string
  title?: string
  description?: string | null
  category?: string | null
  tags?: string[]
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
    !sameTags(existing.tags ?? [], incoming.tags) ||
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

type ProposalPersistence = Pick<PrismaClient, 'proposal'>

export interface ProposalReconciliationResult {
  saved: number
  removed: number
}

/**
 * Persists a complete, successfully extracted source snapshot atomically.
 * Reviewed rows that are still present are immutable; reviewed/public rows
 * missing from the snapshot are unpublished and derived scores are revoked.
 */
export async function reconcileExtractedProposals(
  proposals: ProcessedProposal[],
  snapshot: ProposalSourceSnapshot,
  db: PrismaClient = prisma,
): Promise<ProposalReconciliationResult> {
  if (proposals.some((proposal) =>
    proposal.candidateId !== snapshot.candidateId || proposal.sourceUrl !== snapshot.sourceUrl
  )) {
    throw new Error('Proposal snapshot mixes candidates or source URLs')
  }

  const result = await db.$transaction(async (tx) => {
    const candidate = await tx.candidate.findUnique({
      where: { id: snapshot.candidateId },
      select: { slug: true },
    })
    if (!candidate) throw new Error(`Candidate ${snapshot.candidateId} not found`)

    let saved = 0
    for (const proposal of proposals) {
      const existing = await tx.proposal.findUnique({
        where: { externalId: proposal.externalId },
        select: { reviewedAt: true, status: true, candidateId: true },
      })
      if (existing && existing.candidateId !== proposal.candidateId) {
        throw new Error(`External id ${proposal.externalId} belongs to another candidate`)
      }
      if (existing?.reviewedAt || (existing && existing.status !== ProposalStatus.DRAFT)) {
        saved += 1
        continue
      }

      await tx.proposal.upsert({
        where: { externalId: proposal.externalId },
        update: {
          source: proposal.source,
          title: proposal.title,
          description: proposal.description,
          category: proposal.category,
          tags: proposal.tags,
          status: ProposalStatus.DRAFT,
          isPublished: false,
          origin: ProposalOrigin.AI_EXTRACTION,
          url: proposal.sourceUrl,
        },
        create: {
          externalId: proposal.externalId,
          source: proposal.source,
          title: proposal.title,
          description: proposal.description,
          category: proposal.category,
          tags: proposal.tags,
          status: ProposalStatus.DRAFT,
          isPublished: false,
          origin: ProposalOrigin.AI_EXTRACTION,
          url: proposal.sourceUrl,
          candidateId: proposal.candidateId,
        },
      })
      saved += 1
    }

    const currentExternalIds = new Set(proposals.map((proposal) => proposal.externalId))
    const sourceProposals = await tx.proposal.findMany({
      where: {
        candidateId: snapshot.candidateId,
        source: 'candidate_site',
        url: snapshot.sourceUrl,
      },
      select: {
        id: true,
        externalId: true,
        source: true,
        status: true,
        url: true,
        candidateId: true,
      },
    })
    const removedIds = sourceProposals
      .filter((existing) => isProposalMissingFromSource(
        existing,
        currentExternalIds,
        snapshot,
      ))
      .map((existing) => existing.id)

    if (removedIds.length > 0) {
      const materialUpdatedAt = new Date()
      await tx.proposal.updateMany({
        where: { id: { in: removedIds } },
        data: { status: ProposalStatus.DRAFT, isPublished: false },
      })
      await tx.consistencyScore.deleteMany({
        where: { candidateId: snapshot.candidateId },
      })
      await tx.candidate.update({
        where: { id: snapshot.candidateId },
        data: { materialUpdatedAt },
      })
    }

    return { saved, removed: removedIds.length, slug: candidate.slug }
  })

  if (result.removed > 0) {
    await invalidateApiCandidateCaches()
    if (result.slug) await revalidateCandidatePages([result.slug])
  }

  return { saved: result.saved, removed: result.removed }
}

export async function persistExtractedProposals(
  proposals: ProcessedProposal[],
  db: ProposalPersistence = prisma,
): Promise<number> {
  let saved = 0

  for (const proposal of proposals) {
    try {
      const existing = await db.proposal.findUnique({
        where: { externalId: proposal.externalId },
        select: { reviewedAt: true, candidateId: true },
      })
      if (existing?.reviewedAt) {
        saved += 1
        continue
      }
      if (existing && existing.candidateId !== proposal.candidateId) {
        throw new Error(`External id ${proposal.externalId} belongs to another candidate`)
      }

      await db.proposal.upsert({
        where: { externalId: proposal.externalId },
        update: {
          source: proposal.source,
          title: proposal.title,
          description: proposal.description,
          category: proposal.category,
          tags: proposal.tags,
          status: ProposalStatus.DRAFT,
          isPublished: false,
          origin: ProposalOrigin.AI_EXTRACTION,
          url: proposal.sourceUrl,
        },
        create: {
          externalId: proposal.externalId,
          source: proposal.source,
          title: proposal.title,
          description: proposal.description,
          category: proposal.category,
          tags: proposal.tags,
          status: ProposalStatus.DRAFT,
          isPublished: false,
          origin: ProposalOrigin.AI_EXTRACTION,
          url: proposal.sourceUrl,
          candidateId: proposal.candidateId,
        },
      })
      saved += 1
    } catch (error) {
      logger.error(
        `[extractor] Failed to save proposal ${proposal.externalId}`,
        error instanceof Error ? error.message : error,
      )
      throw error
    }
  }

  return saved
}
