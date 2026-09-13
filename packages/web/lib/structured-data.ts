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
  title: string
  description: string
  image?: string
  dateModified?: string | null
  /** Nome social/de urna, quando difere do nome de registro. */
  socialName?: string | null
  party: string
  /** Sigla da UF. O nome por extenso entra via `stateName`. */
  state: string
  stateName?: string
  /** Rótulo do cargo já pronto para leitura ("Senador(a) Federal"). */
  officeLabel: string
  ballotNumber?: number | null
  /** Página oficial da candidatura, quando registrada. */
  siteUrl?: string | null
  /** Introdução da ficha, usada como `description` da pessoa. */
  bioSummary?: string | null
}

/**
 * A ficha é um `ProfilePage` sobre uma `Person`, não uma `WebPage` genérica.
 *
 * A busca por nome de candidato é uma busca por entidade: o Google precisa
 * decidir que esta página é *sobre aquela pessoa* antes de considerar exibi-la.
 * Um `Person` com apenas nome, foto e URL não desambigua homônimo nenhum — e
 * homônimo é a regra numa base de 500+ candidaturas.
 *
 * Então tudo que a página já mostra ao leitor e serve de traço de identidade
 * entra no grafo: partido, UF, cargo disputado, número na urna, nome de urna e
 * site oficial. Nada aqui é inventado para o robô — cada campo é o mesmo dado
 * que o `<dl>` do cabeçalho exibe, e some do JSON-LD quando não existe.
 */
export function buildCandidateProfilePageSchema(input: CandidateWebPageInput) {
  const url = canonicalUrl(`/candidatos/${input.slug}`)
  const personId = `${url}#person`
  const alternateName =
    input.socialName && input.socialName.trim() !== input.name.trim()
      ? input.socialName.trim()
      : undefined

  const person = {
    '@type': 'Person',
    '@id': personId,
    name: input.name,
    ...(alternateName ? { alternateName } : {}),
    ...(input.bioSummary ? { description: input.bioSummary } : {}),
    ...(input.image ? { image: input.image } : {}),
    url,
    jobTitle: `Candidatura a ${input.officeLabel} nas Eleições 2026`,
    nationality: { '@type': 'Country', name: 'Brasil' },
    memberOf: { '@type': 'PoliticalParty', name: input.party },
    workLocation: {
      '@type': 'AdministrativeArea',
      name: input.stateName ?? input.state,
      address: {
        '@type': 'PostalAddress',
        addressRegion: input.state,
        addressCountry: 'BR',
      },
    },
    ...(input.ballotNumber != null
      ? {
          identifier: {
            '@type': 'PropertyValue',
            name: 'Número na urna',
            value: String(input.ballotNumber),
          },
        }
      : {}),
    // `sameAs` só aceita endereço que *é* a pessoa em outro lugar da web. A
    // fonte da situação eleitoral e a da biografia documentam a candidatura,
    // não são perfis dela — por isso ficam fora daqui.
    ...(input.siteUrl ? { sameAs: [input.siteUrl] } : {}),
    subjectOf: { '@id': `${url}#webpage` },
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    '@id': `${url}#webpage`,
    url,
    name: input.title,
    description: input.description,
    inLanguage: 'pt-BR',
    isPartOf: { '@id': canonicalUrl('/#website') },
    publisher: { '@id': canonicalUrl('/#organization') },
    ...(input.dateModified ? { dateModified: input.dateModified } : {}),
    mainEntity: person,
    about: { '@id': personId },
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
