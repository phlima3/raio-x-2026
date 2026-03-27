import type {
  CandidateSummary,
  CandidateDetail,
  Proposal,
  ComparisonResult,
  ApiListResponse,
  ApiDetailResponse,
  NewsItem,
} from './types'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

async function apiFetch<T>(
  path: string,
  revalidate = 3600,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    next: { revalidate },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `API ${res.status} on ${path}`)
  }

  return res.json() as Promise<T>
}

// ── Candidates ────────────────────────────────────────────────────────────────

export async function fetchCandidates(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  return apiFetch<ApiListResponse<CandidateSummary>>(`/api/candidates${qs}`)
}

export async function fetchCandidate(slug: string) {
  return apiFetch<ApiDetailResponse<CandidateDetail>>(`/api/candidates/${slug}`)
}

export async function fetchCandidateProposals(slug: string) {
  return apiFetch<ApiDetailResponse<Record<string, Proposal[]>>>(
    `/api/candidates/${slug}/proposals`,
  )
}

export async function fetchCandidateTransparency(slug: string) {
  return apiFetch<ApiDetailResponse<{
    voting: import('./types').VotingRecord[]
    assets: import('./types').AssetDeclaration[]
    financing: import('./types').CampaignFinancing | null
  }>>(`/api/candidates/${slug}/transparency`)
}

export async function fetchCandidateStats() {
  return apiFetch<ApiDetailResponse<{
    total: number
    byPosition: Record<string, number>
    byParty: Record<string, number>
    byState: Record<string, number>
  }>>('/api/candidates/stats')
}

// ── Proposals ─────────────────────────────────────────────────────────────────

export async function fetchProposalCategories() {
  return apiFetch<ApiDetailResponse<{ category: string; count: number }[]>>(
    '/api/proposals/categories',
    3600 * 6,
  )
}

// ── Consistency ───────────────────────────────────────────────────────────────

export async function fetchCandidateConsistency(slug: string) {
  return apiFetch<ApiDetailResponse<Array<{
    theme: string
    score: number
    label: string
    explanation: string
    contradictions: Array<{ proposal: string; vote: string; description: string }>
    proposalCount: number
    voteCount: number
    computedAt: string
  }>>>(`/api/candidates/${slug}/consistency`, 0, { cache: 'no-store' })
}

// ── News ──────────────────────────────────────────────────────────────────────

export async function fetchCandidateNews(slug: string, contradictionsOnly = false) {
  const qs = contradictionsOnly ? '?contradictionsOnly=true' : ''
  return apiFetch<ApiDetailResponse<NewsItem[]>>(
    `/api/candidates/${slug}/news${qs}`,
    3600,
  )
}

// ── Comparison ────────────────────────────────────────────────────────────────

export async function fetchComparison(
  candidateA: string,
  candidateB: string,
  topic?: string,
) {
  const params: Record<string, string> = { candidateA, candidateB }
  if (topic) params.topic = topic
  const qs = '?' + new URLSearchParams(params).toString()
  return apiFetch<ApiDetailResponse<{
    candidateA: CandidateSummary
    candidateB: CandidateSummary
    comparisons: ComparisonResult[]
  }>>(`/api/comparison${qs}`, 3600, { cache: 'no-store' })
}
