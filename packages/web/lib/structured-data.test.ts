import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildBreadcrumbList,
  buildCandidateWebPageSchema,
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

test('describes a candidate page as a WebPage about a Person using visible facts', () => {
  const schema = buildCandidateWebPageSchema({
    name: 'Ana Silva',
    slug: 'ana-silva-partido-sp',
    description: 'Perfil eleitoral de Ana Silva.',
    image: 'https://raio-x-2026.com.br/images/ana.jpg',
    dateModified: '2026-08-07T14:00:00.000Z',
  })

  assert.equal(schema['@type'], 'WebPage')
  assert.equal(schema.mainEntity['@type'], 'Person')
  assert.equal(schema.mainEntity.name, 'Ana Silva')
  assert.equal(schema.dateModified, '2026-08-07T14:00:00.000Z')
})

test('escapes markup-significant characters when serializing JSON-LD', () => {
  assert.equal(
    serializeJsonLd({ value: '</script>' }),
    '{"value":"\\u003c/script\\u003e"}',
  )
})
