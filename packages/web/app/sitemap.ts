import type { MetadataRoute } from 'next'
import { fetchCandidateSeoReport } from '@/lib/api'
import { buildCandidateSitemapEntries, canonicalUrl } from '@/lib/seo'
import { EDITORIAL_PAGES } from '@/lib/editorial-pages'
import { LANDING_THEMES, topicSlug } from '@/lib/landing'
import { EDITORIAL_COMPARISONS, isEditorialComparisonReady } from '@/lib/comparisons'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: canonicalUrl('/') },
    { url: canonicalUrl('/comparar') },
    { url: canonicalUrl('/comparacoes'), lastModified: new Date('2026-08-07T18:00:00.000Z') },
    { url: canonicalUrl('/eleicoes-2026'), lastModified: new Date('2026-08-07T18:00:00.000Z') },
    ...EDITORIAL_PAGES.map((page) => ({
      url: canonicalUrl(`/${page.slug}`),
      lastModified: new Date(page.updatedAt),
    })),
  ]

  const report = await fetchCandidateSeoReport()

  const candidateRoutes: MetadataRoute.Sitemap = buildCandidateSitemapEntries(
    report.data.map((candidate) => ({
      slug: candidate.slug,
      indexable: candidate.indexable,
      updatedAt: candidate.materialUpdatedAt,
    })),
  )

  const qualified = report.data.filter((candidate) => candidate.indexable)
  const landingRoutes: MetadataRoute.Sitemap = []

  const latest = (items: typeof qualified) => {
    const timestamps = items
      .map((candidate) => candidate.materialUpdatedAt)
      .filter((value): value is string => Boolean(value))
      .map((value) => Date.parse(value))
      .filter(Number.isFinite)
    return timestamps.length > 0 ? new Date(Math.max(...timestamps)) : undefined
  }

  const presidents = qualified.filter((candidate) => candidate.position === 'PRESIDENTE')
  if (qualified.length > 0) {
    landingRoutes.push({
      url: canonicalUrl('/graficos/perfis-por-partido'),
      lastModified: latest(report.data),
    })
  }

  if (presidents.length > 0) {
    landingRoutes.push({
      url: canonicalUrl('/candidatos-presidente'),
      lastModified: latest(presidents),
    })
  }

  for (const position of ['GOVERNADOR', 'SENADOR'] as const) {
    const prefix = position === 'GOVERNADOR' ? 'governador' : 'senador'
    const states = new Set(
      qualified
        .filter((candidate) => candidate.position === position)
        .map((candidate) => candidate.state.toLowerCase()),
    )
    for (const state of states) {
      const items = qualified.filter(
        (candidate) =>
          candidate.position === position && candidate.state.toLowerCase() === state,
      )
      landingRoutes.push({
        url: canonicalUrl(`/${prefix}/${state}`),
        lastModified: latest(items),
      })
    }
  }

  for (const theme of Object.keys(LANDING_THEMES)) {
    const items = qualified.filter((candidate) =>
      candidate.topics.some((topic) => topicSlug(topic) === theme),
    )
    if (items.length > 0) {
      landingRoutes.push({
        url: canonicalUrl(`/temas/${theme}`),
        lastModified: latest(items),
      })
    }
  }

  const qualifiedSlugs = new Set(qualified.map((candidate) => candidate.slug))
  for (const comparison of EDITORIAL_COMPARISONS.filter(isEditorialComparisonReady)) {
    if (
      qualifiedSlugs.has(comparison.candidateA) &&
      qualifiedSlugs.has(comparison.candidateB)
    ) {
      landingRoutes.push({
        url: canonicalUrl(`/comparacoes/${comparison.slug}`),
        lastModified: new Date(comparison.updatedAt),
      })
    }
  }

  return [...staticRoutes, ...landingRoutes, ...candidateRoutes]
}

export const revalidate = 3600
