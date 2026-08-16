import assert from 'node:assert/strict'
import test from 'node:test'
import { buildRevalidationBatches } from './revalidateWeb'

test('keeps every revalidation request within the endpoint limit', () => {
  const slugs = Array.from({ length: 61 }, (_, index) => `candidato-${index + 1}`)
  const batches = buildRevalidationBatches(slugs)
  const paths = batches.flat()

  assert.equal(batches.length, 2)
  assert.ok(batches.every((batch) => batch.length <= 50))
  assert.equal(new Set(paths).size, paths.length)
  assert.ok(paths.includes('/'))
  assert.ok(paths.includes('/sitemap.xml'))
  assert.ok(paths.includes('/candidatos-presidente'))
  assert.ok(paths.includes('/candidatos/candidato-61'))
})

test('deduplicates slugs and omits values that cannot form safe application paths', () => {
  const batches = buildRevalidationBatches([
    'ana-partido-sp',
    'ana-partido-sp',
    '../admin',
    'Nome Com Espaço',
  ])

  assert.deepEqual(batches, [[
    '/',
    '/sitemap.xml',
    '/candidatos-presidente',
    '/candidatos/ana-partido-sp',
  ]])
})
