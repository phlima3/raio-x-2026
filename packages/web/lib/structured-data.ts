import { canonicalUrl } from './seo'

export interface BreadcrumbItem {
  name: string
  path: string
}

export function buildBreadcrumbList(items: BreadcrumbItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: canonicalUrl(item.path),
    })),
  }
}

export function buildOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': canonicalUrl('/#organization'),
    name: 'Raio-X 2026',
    url: canonicalUrl('/'),
    logo: canonicalUrl('/opengraph-image'),
    description:
      'Projeto independente de transparência eleitoral com dados públicos sobre as Eleições 2026.',
    sameAs: ['https://github.com/phlima3/raio-x-2026'],
    publishingPrinciples: canonicalUrl('/politica-editorial'),
  }
}

export function buildWebSiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': canonicalUrl('/#website'),
    name: 'Raio-X 2026',
    url: canonicalUrl('/'),
    inLanguage: 'pt-BR',
    publisher: { '@id': canonicalUrl('/#organization') },
  }
}

interface CandidateWebPageInput {
  name: string
  slug: string
  description: string
  image?: string
  dateModified?: string | null
}

export function buildCandidateWebPageSchema(input: CandidateWebPageInput) {
  const url = canonicalUrl(`/candidatos/${input.slug}`)
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${url}#webpage`,
    url,
    name: `${input.name}: propostas, partido e histórico`,
    description: input.description,
    isPartOf: { '@id': canonicalUrl('/#website') },
    publisher: { '@id': canonicalUrl('/#organization') },
    ...(input.dateModified ? { dateModified: input.dateModified } : {}),
    mainEntity: {
      '@type': 'Person',
      '@id': `${url}#person`,
      name: input.name,
      ...(input.image ? { image: input.image } : {}),
      url,
    },
    about: { '@id': `${url}#person` },
  }
}

export function buildEditorialWebPageSchema(input: {
  path: string
  name: string
  description: string
  dateModified?: string
}) {
  const url = canonicalUrl(input.path)
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${url}#webpage`,
    url,
    name: input.name,
    description: input.description,
    isPartOf: { '@id': canonicalUrl('/#website') },
    publisher: { '@id': canonicalUrl('/#organization') },
    ...(input.dateModified ? { dateModified: input.dateModified } : {}),
  }
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}
