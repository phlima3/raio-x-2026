import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildBreadcrumbList,
  buildCandidateProfilePageSchema,
  serializeJsonLd,
} from './structured-data'

test('builds absolute BreadcrumbList items in visible navigation order', () => {
  const schema = buildBreadcrumbList([
    { name: 'Início', path: '/' },
    { name: 'Candidatos à Presidência', path: '/candidatos-presidente' },
  ])

  assert.equal(schema['@type'], 'BreadcrumbList')
  assert.deepEqual(schema.itemListElement[1], {
    '@type': 'ListItem',
    position: 2,
    name: 'Candidatos à Presidência',
    item: 'https://raio-x-2026.com.br/candidatos-presidente',
  })
})

const ANA = {
  name: 'Ana Silva',
  slug: 'ana-silva-partido-sp',
  title: 'Ana Silva (PARTIDO-SP): quem é, propostas',
  description: 'Perfil eleitoral de Ana Silva.',
  image: 'https://raio-x-2026.com.br/images/ana.jpg',
  dateModified: '2026-08-07T14:00:00.000Z',
  party: 'PARTIDO',
  state: 'SP',
  stateName: 'São Paulo',
  officeLabel: 'Senador(a) Federal',
}

test('describes a candidate page as a ProfilePage about a Person using visible facts', () => {
  const schema = buildCandidateProfilePageSchema(ANA)

  assert.equal(schema['@type'], 'ProfilePage')
  assert.equal(schema.mainEntity['@type'], 'Person')
  assert.equal(schema.mainEntity.name, 'Ana Silva')
  assert.equal(schema.dateModified, '2026-08-07T14:00:00.000Z')
})

test('carries the traits that separate two candidates with the same name', () => {
  const schema = buildCandidateProfilePageSchema({
    ...ANA,
    socialName: 'Aninha da Saúde',
    ballotNumber: 4321,
    siteUrl: 'https://anasilva.com.br',
    bioSummary: 'Enfermeira e vereadora por dois mandatos.',
  })

  assert.equal(schema.mainEntity.alternateName, 'Aninha da Saúde')
  assert.deepEqual(schema.mainEntity.memberOf, {
    '@type': 'PoliticalParty',
    name: 'PARTIDO',
  })
  assert.equal(schema.mainEntity.workLocation.name, 'São Paulo')
  assert.equal(schema.mainEntity.workLocation.address.addressRegion, 'SP')
  assert.deepEqual(schema.mainEntity.identifier, {
    '@type': 'PropertyValue',
    name: 'Número na urna',
    value: '4321',
  })
  assert.deepEqual(schema.mainEntity.sameAs, ['https://anasilva.com.br'])
  assert.equal(schema.mainEntity.description, 'Enfermeira e vereadora por dois mandatos.')
})

test('omits identity traits the candidacy never registered', () => {
  const schema = buildCandidateProfilePageSchema({ ...ANA, socialName: 'Ana Silva' })

  // O nome social repetido não vira `alternateName`: anunciar o mesmo nome
  // duas vezes não desambigua ninguém.
  assert.ok(!('alternateName' in schema.mainEntity))
  assert.ok(!('identifier' in schema.mainEntity))
  assert.ok(!('sameAs' in schema.mainEntity))
  assert.ok(!('description' in schema.mainEntity))
})

test('escapes markup-significant characters when serializing JSON-LD', () => {
  assert.equal(
    serializeJsonLd({ value: '</script>' }),
    '{"value":"\\u003c/script\\u003e"}',
  )
})
