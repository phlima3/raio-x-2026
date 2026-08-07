import assert from 'node:assert/strict'
import test from 'node:test'
import { filterQualifiedCandidates, topicSlug } from './landing'
import type { CandidateSeoReportItem } from './types'

const candidate = {
  id: '1',
  slug: 'ana-sp',
  aliases: [],
  duplicateCandidateIds: [],
  name: 'Ana Silva',
  party: 'ABC',
  state: 'SP',
  position: 'GOVERNADOR',
  electionYear: 2026,
  candidacyStatus: 'registro_solicitado',
  candidacyStatusVerifiedAt: '2026-08-07T12:00:00.000Z',
  materialUpdatedAt: '2026-08-07T12:00:00.000Z',
  reviewedAt: '2026-08-07T13:00:00.000Z',
  updatedAt: '2026-08-07T13:00:00.000Z',
  topics: ['Meio Ambiente', 'Economia'],
  searchIntent: {
    primary: 'Ana Silva eleições 2026',
    secondary: [],
    validation: 'hipotese_aguardando_search_console',
  },
  indexable: true,
  blockers: [],
  warnings: [],
  substantiveModules: ['propostas'],
  blockerMessages: [],
} satisfies CandidateSeoReportItem

test('normalizes proposal categories to stable topic slugs', () => {
  assert.equal(topicSlug('Meio Ambiente'), 'meio-ambiente')
  assert.equal(topicSlug('Saúde pública'), 'saude-publica')
})

test('filters landing candidates by gate, office, state and topic', () => {
  const rejected = { ...candidate, id: '2', slug: 'bia-sp', indexable: false }
  assert.deepEqual(
    filterQualifiedCandidates([candidate, rejected], {
      position: 'GOVERNADOR',
      state: 'SP',
      topic: 'meio-ambiente',
    }).map((item) => item.slug),
    ['ana-sp'],
  )
})
