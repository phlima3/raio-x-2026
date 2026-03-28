// Types that mirror the API response shapes

export type Position =
  | 'PRESIDENTE'
  | 'VICE_PRESIDENTE'
  | 'SENADOR'
  | 'DEPUTADO_FEDERAL'
  | 'DEPUTADO_ESTADUAL'
  | 'GOVERNADOR'
  | 'VICE_GOVERNADOR'
  | 'PREFEITO'
  | 'VEREADOR'

export type VoteType = 'YES' | 'NO' | 'ABSTENTION' | 'ABSENT' | 'OBSTRUCTION'
export type ProposalStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'IN_COMMITTEE'
  | 'VOTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'ARCHIVED'

export interface CandidateSummary {
  id: string
  name: string
  socialName: string | null
  party: string
  state: string
  position: Position
  photoUrl: string | null
  ballotNumber: number | null
  isIncumbent: boolean
  electionYear: number
  slug: string
  firstProposalTitle?: string | null
}

export interface Proposal {
  id: string
  title: string
  category: string | null
  status: ProposalStatus
  source: string
  tags: string[]
  proposedAt: string | null
  description: string | null
  summary: string | null
  url: string | null
  candidateId: string
}

export interface VotingRecord {
  id: string
  externalId: string | null
  source: string
  proposalName: string
  proposalUrl: string | null
  voteType: VoteType
  votedAt: string
  session: string | null
  candidateId: string
}

export interface AssetDeclaration {
  id: string
  year: number
  totalValue: string
  currency: string
  sourceUrl: string | null
  variation: number | null
}

export interface CampaignFinancing {
  id: string
  year: number
  totalReceived: string
  totalSpent: string
  currency: string
  sourceUrl: string | null
  donors: unknown
}

export interface CandidateDetail extends CandidateSummary {
  bio: string | null
  bioSummary: string | null
  siteUrl: string | null
  email: string | null
  coalitionName: string | null
  approvalRate: number | null
  partyHistory: string[]
  proposals: Proposal[]
  votingRecords: VotingRecord[]
  assetDeclarations: AssetDeclaration[]
  campaignFinancings: CampaignFinancing[]
}

export interface ComparisonResult {
  theme: string
  proposalsA: Proposal[]
  proposalsB: Proposal[]
  aiSummary: string
}

export interface ApiListResponse<T> {
  success: boolean
  data: T[]
  meta: { total: number; page: number; limit: number; totalPages: number }
}

export interface ApiDetailResponse<T> {
  success: boolean
  data: T
}

export interface NewsItem {
  id: string
  title: string
  summary: string
  sourceUrl: string
  publishedAt: string
  topic: string
  hasContradiction: boolean
  contradictionNote: string | null
}
