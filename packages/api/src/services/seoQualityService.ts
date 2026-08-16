import { PrismaClient, type Position } from '@prisma/client'
import {
  chooseCanonicalCandidate,
  groupCandidateRecords,
  makeCandidateSlug,
} from '../domain/candidateIdentity'
import {
  evaluateCandidateIndexability,
  findCollidingCanonicalSlugs,
  SEO_BLOCKER_MESSAGES,
  type SeoBlockerCode,
  type SeoWarningCode,
  type SubstantiveModule,
} from '../domain/seoQuality'
import { TTL, withCache } from './cacheService'
import { publicCandidateWhere } from './candidateService'
import { buildCandidateSearchIntent } from '../domain/searchIntent'
import type { CandidateSearchIntent } from '../domain/searchIntent'
import {
  PUBLIC_PROPOSAL_LIMIT,
  PUBLIC_PROPOSAL_ORDER_BY,
  PUBLIC_PROPOSAL_WHERE,
  PUBLIC_ASSET_DECLARATION_LIMIT,
  PUBLIC_ASSET_DECLARATION_ORDER_BY,
  PUBLIC_ASSET_DECLARATION_WHERE,
  PUBLIC_CAMPAIGN_FINANCING_LIMIT,
  PUBLIC_CAMPAIGN_FINANCING_ORDER_BY,
  PUBLIC_CAMPAIGN_FINANCING_WHERE,
  PUBLIC_NEWS_LIMIT,
  PUBLIC_NEWS_ORDER_BY,
  PUBLIC_NEWS_WHERE,
  PUBLIC_VOTING_RECORD_LIMIT,
  PUBLIC_VOTING_RECORD_ORDER_BY,
  PUBLIC_VOTING_RECORD_WHERE,
} from '../domain/publicationPolicy'

const prisma = new PrismaClient()

export interface CandidateSeoReportItem {
  id: string
  slug: string
  aliases: string[]
  duplicateCandidateIds: string[]
  name: string
  party: string
  state: string
  position: Position
  electionYear: number
  candidacyStatus: string | null
  candidacyStatusVerifiedAt: string | null
  materialUpdatedAt: string | null
  reviewedAt: string | null
  updatedAt: string
  topics: string[]
  searchIntent: CandidateSearchIntent
  indexable: boolean
  blockers: SeoBlockerCode[]
  warnings: SeoWarningCode[]
  substantiveModules: SubstantiveModule[]
  blockerMessages: string[]
}

export async function getCandidateSeoReport(): Promise<CandidateSeoReportItem[]> {
  return withCache('candidates:seo-report', TTL.CANDIDATE_LIST, async () => {
    const [candidates, globalIdentityRecords] = await Promise.all([
      prisma.candidate.findMany({
        where: { electionYear: 2026, ...publicCandidateWhere() },
        include: {
          proposals: {
            where: PUBLIC_PROPOSAL_WHERE,
            orderBy: PUBLIC_PROPOSAL_ORDER_BY,
            take: PUBLIC_PROPOSAL_LIMIT,
            select: {
              title: true,
              description: true,
              summary: true,
              url: true,
              category: true,
            },
          },
          votingRecords: {
            where: PUBLIC_VOTING_RECORD_WHERE,
            orderBy: PUBLIC_VOTING_RECORD_ORDER_BY,
            take: PUBLIC_VOTING_RECORD_LIMIT,
            select: { proposalName: true, proposalUrl: true },
          },
          assetDeclarations: {
            where: PUBLIC_ASSET_DECLARATION_WHERE,
            orderBy: PUBLIC_ASSET_DECLARATION_ORDER_BY,
            take: PUBLIC_ASSET_DECLARATION_LIMIT,
            select: { sourceUrl: true },
          },
          campaignFinancings: {
            where: PUBLIC_CAMPAIGN_FINANCING_WHERE,
            orderBy: PUBLIC_CAMPAIGN_FINANCING_ORDER_BY,
            take: PUBLIC_CAMPAIGN_FINANCING_LIMIT,
            select: { sourceUrl: true },
          },
          newsItems: {
            where: PUBLIC_NEWS_WHERE,
            orderBy: PUBLIC_NEWS_ORDER_BY,
            take: PUBLIC_NEWS_LIMIT,
            select: { headline: true, summary: true, url: true },
          },
          slugAliases: {
            select: { slug: true },
          },
        },
      }),
      prisma.candidate.findMany({
        where: publicCandidateWhere(),
        select: {
          id: true,
          name: true,
          party: true,
          state: true,
          position: true,
          electionYear: true,
          personKey: true,
          tseId: true,
          slug: true,
          candidacyStatus: true,
          candidacyStatusSourceUrl: true,
          candidacyStatusVerifiedAt: true,
          materialUpdatedAt: true,
          updatedAt: true,
          isOfficial: true,
        },
      }),
    ])

    const report = groupCandidateRecords(candidates).map((records) => {
      const candidate = chooseCanonicalCandidate(records)
      const slug =
        candidate.slug ?? makeCandidateSlug(candidate.name, candidate.party, candidate.state)
      const quality = evaluateCandidateIndexability({
        ...candidate,
        slug,
      })
      const aliases = new Set<string>()

      for (const record of records) {
        const effectiveSlug =
          record.slug ?? makeCandidateSlug(record.name, record.party, record.state)
        if (effectiveSlug !== slug) aliases.add(effectiveSlug)
        for (const alias of record.slugAliases) {
          if (alias.slug !== slug) aliases.add(alias.slug)
        }
      }

      return {
        id: candidate.id,
        slug,
        aliases: [...aliases].sort(),
        duplicateCandidateIds: records
          .filter((record) => record.id !== candidate.id)
          .map((record) => record.id)
          .sort(),
        name: candidate.name,
        party: candidate.party,
        state: candidate.state,
        position: candidate.position,
        electionYear: candidate.electionYear,
        candidacyStatus: candidate.candidacyStatus,
        candidacyStatusVerifiedAt:
          candidate.candidacyStatusVerifiedAt?.toISOString() ?? null,
        materialUpdatedAt: candidate.materialUpdatedAt?.toISOString() ?? null,
        reviewedAt: candidate.reviewedAt?.toISOString() ?? null,
        updatedAt: candidate.updatedAt.toISOString(),
        topics: [...new Set(
          candidate.proposals
            .filter((proposal) => {
              const body = proposal.summary ?? proposal.description
              return (
                proposal.url?.startsWith('https://') &&
                Boolean(body && body.trim().length >= 40)
              )
            })
            .map((proposal) => proposal.category)
            .filter((category): category is string => Boolean(category)),
        )].sort((a, b) => a.localeCompare(b, 'pt-BR')),
        searchIntent: buildCandidateSearchIntent(candidate.name),
        ...quality,
        blockerMessages: quality.blockers.map((code) => SEO_BLOCKER_MESSAGES[code]),
      }
    })

    const globalCanonicalSlugs = groupCandidateRecords(globalIdentityRecords).map((records) => {
      const candidate = chooseCanonicalCandidate(records)
      return {
        slug:
          candidate.slug ??
          makeCandidateSlug(candidate.name, candidate.party, candidate.state),
      }
    })
    const collidingSlugs = findCollidingCanonicalSlugs(globalCanonicalSlugs)
    return report.map((candidate) => {
      if (!collidingSlugs.has(candidate.slug)) return candidate
      const blockers = [...new Set([...candidate.blockers, 'colisao_slug' as const])]
      return {
        ...candidate,
        indexable: false,
        blockers,
        blockerMessages: blockers.map((code) => SEO_BLOCKER_MESSAGES[code]),
      }
    })
  })
}
