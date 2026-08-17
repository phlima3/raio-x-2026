import { Prisma, ProposalStatus } from '@prisma/client'

export const PUBLIC_PROPOSAL_LIMIT = 50
export const PUBLIC_VOTING_RECORD_LIMIT = 100
export const PUBLIC_ASSET_DECLARATION_LIMIT = 20
export const PUBLIC_CAMPAIGN_FINANCING_LIMIT = 10
export const PUBLIC_NEWS_LIMIT = 50

export const PUBLIC_PROPOSAL_WHERE = {
  isPublished: true,
  url: { startsWith: 'https://' },
  status: { not: ProposalStatus.DRAFT },
} satisfies Prisma.ProposalWhereInput

export const PUBLIC_VOTING_RECORD_WHERE = {
  proposalUrl: { startsWith: 'https://' },
} satisfies Prisma.VotingRecordWhereInput

export const PUBLIC_ASSET_DECLARATION_WHERE = {
  sourceUrl: { startsWith: 'https://' },
} satisfies Prisma.AssetDeclarationWhereInput

export const PUBLIC_CAMPAIGN_FINANCING_WHERE = {
  sourceUrl: { startsWith: 'https://' },
} satisfies Prisma.CampaignFinancingWhereInput

export const PUBLIC_NEWS_WHERE = {
  url: { startsWith: 'https://' },
} satisfies Prisma.NewsItemWhereInput

export const PUBLIC_PROPOSAL_ORDER_BY = [
  { proposedAt: 'desc' as const },
  { updatedAt: 'desc' as const },
] satisfies Prisma.ProposalOrderByWithRelationInput[]

export const PUBLIC_VOTING_RECORD_ORDER_BY = [
  { votedAt: 'desc' as const },
  { updatedAt: 'desc' as const },
] satisfies Prisma.VotingRecordOrderByWithRelationInput[]

export const PUBLIC_ASSET_DECLARATION_ORDER_BY = [
  { year: 'desc' as const },
  { updatedAt: 'desc' as const },
] satisfies Prisma.AssetDeclarationOrderByWithRelationInput[]

/**
 * Anexa a variação anual do patrimônio. Depende de
 * `PUBLIC_ASSET_DECLARATION_ORDER_BY` (ano decrescente), por isso mora ao lado
 * dele: o item seguinte da lista é o ano anterior. O ano mais antigo não tem
 * com o que comparar e recebe `null` — o front não deve renderizar a linha.
 */
export function withAssetVariation<T extends { totalValue: unknown }>(
  declarations: T[],
): Array<T & { variation: number | null }> {
  return declarations.map((declaration, index) => {
    const previous = declarations[index + 1]
    return {
      ...declaration,
      variation: previous
        ? Number(declaration.totalValue) - Number(previous.totalValue)
        : null,
    }
  })
}

export const PUBLIC_CAMPAIGN_FINANCING_ORDER_BY = [
  { year: 'desc' as const },
  { updatedAt: 'desc' as const },
] satisfies Prisma.CampaignFinancingOrderByWithRelationInput[]

export const PUBLIC_NEWS_ORDER_BY = [
  { publishedAt: 'desc' as const },
  { fetchedAt: 'desc' as const },
] satisfies Prisma.NewsItemOrderByWithRelationInput[]

export function isPublicProposal(input: {
  isPublished: boolean
  url: string | null
  status: ProposalStatus
}): boolean {
  if (!input.isPublished || input.status === ProposalStatus.DRAFT || !input.url) return false
  try {
    return new URL(input.url).protocol === 'https:'
  } catch {
    return false
  }
}
