import assert from 'node:assert/strict'
import test from 'node:test'
import { buildComparisonSlug } from './comparisons'

test('builds one deterministic URL for a candidate pair regardless of selection order', () => {
  assert.equal(buildComparisonSlug('zema-novo-mg', 'lula-pt-sp'), 'lula-pt-sp-x-zema-novo-mg')
  assert.equal(buildComparisonSlug('lula-pt-sp', 'zema-novo-mg'), 'lula-pt-sp-x-zema-novo-mg')
  assert.throws(() => buildComparisonSlug('lula-pt-sp', 'lula-pt-sp'))
})
