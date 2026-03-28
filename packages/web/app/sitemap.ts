import type { MetadataRoute } from 'next'
import { fetchCandidates } from '@/lib/api'

const BASE = 'https://raio-x-2026.com.br'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: BASE, changeFrequency: 'weekly', priority: 1.0, lastModified: new Date() },
    { url: `${BASE}/busca`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE}/comparar`, changeFrequency: 'weekly', priority: 0.7 },
  ]

  try {
    const [presidentsRes, governorsRes] = await Promise.allSettled([
      fetchCandidates({ position: 'PRESIDENTE', limit: '20' }),
      fetchCandidates({ position: 'GOVERNADOR', limit: '50' }),
    ])

    const presidents =
      presidentsRes.status === 'fulfilled' ? presidentsRes.value.data : []
    const governors =
      governorsRes.status === 'fulfilled' ? governorsRes.value.data : []

    const candidateRoutes: MetadataRoute.Sitemap = [...presidents, ...governors].map((c) => ({
      url: `${BASE}/candidatos/${c.slug}`,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }))

    return [...staticRoutes, ...candidateRoutes]
  } catch {
    return staticRoutes
  }
}
