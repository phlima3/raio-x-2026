import assert from 'node:assert/strict'
import test from 'node:test'
import { buildCandidateSearchIntent } from './searchIntent'

test('builds a candidate-specific intent map without repeating keywords in page copy', () => {
  const intent = buildCandidateSearchIntent('Ana Silva')
  assert.equal(intent.primary, 'Ana Silva eleições 2026')
  assert.ok(intent.secondary.includes('Ana Silva propostas 2026'))
  assert.ok(intent.secondary.includes('Ana Silva patrimônio declarado'))
  assert.ok(intent.secondary.includes('Ana Silva posição sobre {tema}'))
})
