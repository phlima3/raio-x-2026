export const SITE_ORIGIN = 'https://raio-x-2026.com.br'

export function canonicalUrl(pathname: string): string {
  return new URL(pathname, SITE_ORIGIN).toString()
}

interface RedirectRequestUrl {
  hostname: string
  protocol: string
  pathname: string
  search: string
}

export function canonicalRedirectTarget(request: RedirectRequestUrl): string | null {
  const hostname = request.hostname.toLowerCase()
  const protocol = request.protocol.replace(/:$/, '').toLowerCase()
  const isCanonicalHost = hostname === 'raio-x-2026.com.br'
  const isAlternateHost = hostname === 'www.raio-x-2026.com.br'

  if (!isCanonicalHost && !isAlternateHost) return null
  if (isCanonicalHost && protocol === 'https') return null

  return canonicalUrl(`${request.pathname}${request.search}`)
}

export function absoluteImageUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined

  let url: URL
  try {
    url = new URL(value, SITE_ORIGIN)
  } catch {
    return undefined
  }
  if (url.protocol === 'http:') {
    const knownHttpsHosts = new Set([
      'www.senado.leg.br',
      'legis.senado.leg.br',
      'www.camara.leg.br',
      'dadosabertos.tse.jus.br',
    ])
    if (!knownHttpsHosts.has(url.hostname.toLowerCase())) return undefined
    url.protocol = 'https:'
  }
  if (url.protocol !== 'https:') return undefined
  return url.toString()
}

export interface SitemapCandidate {
  slug: string
  indexable: boolean
  updatedAt?: string | Date | null
}

export interface CandidateSitemapEntry {
  url: string
  lastModified?: Date
}

export function buildCandidateSitemapEntries(
  candidates: SitemapCandidate[],
): CandidateSitemapEntry[] {
  const bySlug = new Map<string, SitemapCandidate>()

  for (const candidate of candidates) {
    if (!candidate.indexable) continue

    const current = bySlug.get(candidate.slug)
    const currentTime = current?.updatedAt
      ? new Date(current.updatedAt).getTime()
      : Number.NEGATIVE_INFINITY
    const candidateTime = candidate.updatedAt
      ? new Date(candidate.updatedAt).getTime()
      : Number.NEGATIVE_INFINITY

    if (!current || candidateTime > currentTime) {
      bySlug.set(candidate.slug, candidate)
    }
  }

  return Array.from(bySlug.values()).map((candidate) => ({
    url: canonicalUrl(`/candidatos/${candidate.slug}`),
    ...(candidate.updatedAt && { lastModified: new Date(candidate.updatedAt) }),
  }))
}
