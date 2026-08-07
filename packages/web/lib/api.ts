import type {
  CandidateSummary,
  CandidateDetail,
  Proposal,
  ComparisonResult,
  ApiListResponse,
  ApiDetailResponse,
  NewsItem,
  ConsistencyScore,
  CandidateSeoReportItem,
} from './types'
import { absoluteImageUrl } from './seo'

// Server-side: use internal URL if available (faster, no DNS/TLS overhead in K8s)
// Client-side: always use the public URL
const API_BASE =
  typeof window === 'undefined'
    ? (process.env.API_URL_INTERNAL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001')
    : (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001')

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

export function isApiNotFound(
  error: unknown,
  path?: string,
): error is ApiRequestError {
  return (
    error instanceof ApiRequestError &&
    error.status === 404 &&
    (!path || error.path === path)
  )
}

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
    const body = (await res.json().catch(() => null)) as { error?: unknown } | null
    const message =
      typeof body?.error === 'string'
        ? body.error
        : `API ${res.status} on ${path}`
    throw new ApiRequestError(res.status, path, message)
  }

  return res.json() as Promise<T>
}

// ── Candidates ────────────────────────────────────────────────────────────────

export async function fetchCandidates(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  const result = await apiFetch<ApiListResponse<CandidateSummary>>(`/api/candidates${qs}`)
  return {
    ...result,
    data: result.data.map((candidate) => ({
      ...candidate,
      photoUrl: absoluteImageUrl(candidate.photoUrl) ?? null,
    })),
  }
}

export async function fetchCandidate(slug: string) {
  const result = await apiFetch<ApiDetailResponse<CandidateDetail>>(`/api/candidates/${slug}`)
  return {
    ...result,
    data: {
      ...result.data,
      photoUrl: absoluteImageUrl(result.data.photoUrl) ?? null,
    },
  }
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

export async function fetchCandidateSeoReport() {
  return apiFetch<{
    success: boolean
    data: CandidateSeoReportItem[]
    meta: { total: number; indexable: number }
  }>('/api/candidates/seo-report', 900)
}

export async function fetchCandidateSeoQualification(slug: string) {
  const report = await fetchCandidateSeoReport()
  return report.data.find(
    (candidate) => candidate.slug === slug || candidate.aliases.includes(slug),
  )
}

// ── Proposals ─────────────────────────────────────────────────────────────────

export async function fetchProposalCategories() {
  return apiFetch<ApiDetailResponse<{ category: string; count: number }[]>>(
    '/api/proposals/categories',
    3600 * 6,
  )
}

// ── Consistency ───────────────────────────────────────────────────────────────

export async function fetchCandidateConsistency(
  slug: string,
  options: { compute?: boolean } = {},
) {
  const qs = options.compute === false ? '?compute=false' : ''
  return apiFetch<ApiDetailResponse<ConsistencyScore[]>>(
    `/api/candidates/${slug}/consistency${qs}`,
    options.compute === false ? 3600 : 0,
    options.compute === false ? undefined : { cache: 'no-store' },
  )
}

// ── News ──────────────────────────────────────────────────────────────────────

export async function fetchCandidateNews(slug: string, contradictionsOnly = false) {
  const qs = contradictionsOnly ? '?contradictionsOnly=true' : ''
  const result = await apiFetch<ApiDetailResponse<Array<NewsItem & {
    headline?: string
    url?: string | null
    fetchedAt?: string
  }>>>(
    `/api/candidates/${slug}/news${qs}`,
    3600,
  )
  return {
    ...result,
    data: result.data.map((item) => ({
      ...item,
      title: item.title ?? item.headline ?? 'Declaração sem título',
      sourceUrl: item.sourceUrl ?? item.url ?? null,
      publishedAt: item.publishedAt ?? item.fetchedAt ?? new Date(0).toISOString(),
    })),
  }
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
