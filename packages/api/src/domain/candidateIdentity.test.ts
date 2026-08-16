import assert from 'node:assert/strict'
import test from 'node:test'
import {
  chooseCanonicalCandidate,
  deduplicateCandidateRecords,
  groupCandidateRecords,
  personIdentityKey,
} from './candidateIdentity'

test('groups duplicate office records for the same person without grouping homonyms from another state', () => {
  assert.equal(personIdentityKey('José Ávila', 'SP'), 'jose-avila:SP')

  const groups = groupCandidateRecords([
    { id: 'president', name: 'José Ávila', state: 'SP', personKey: 'jose-avila' },
    { id: 'governor', name: 'Jose Avila', state: 'SP', personKey: 'jose-avila' },
    { id: 'homonym', name: 'José Ávila', state: 'BA' },
  ])

  assert.equal(groups.length, 2)
  assert.deepEqual(groups[0].map((candidate) => candidate.id), ['president', 'governor'])
})

test('does not treat a normalized Person relation as editorial identity proof', () => {
  const groups = groupCandidateRecords([
    {
      id: 'legacy-row',
      name: 'Nome legado',
      state: 'SP',
      electionYear: 2026,
      personId: 'person-1',
      tseId: 'old-tse-id',
    },
    {
      id: 'official-row',
      name: 'Nome oficial',
      state: 'BR',
      electionYear: 2026,
      personId: 'person-1',
      tseId: 'new-tse-id',
    },
  ])

  assert.equal(groups.length, 2)
})

test('does not merge same-state homonyms with conflicting electoral identifiers', () => {
  const groups = groupCandidateRecords([
    {
      id: 'person-a',
      name: 'Maria Souza',
      state: 'SP',
      electionYear: 2026,
      tseId: 'tse-100',
    },
    {
      id: 'person-b',
      name: 'Maria Souza',
      state: 'SP',
      electionYear: 2026,
      tseId: 'tse-200',
    },
  ])

  assert.equal(groups.length, 2)
})

test('keeps same-state homonyms without a positive identifier fail-closed', () => {
  const groups = groupCandidateRecords([
    { id: 'person-a', name: 'Maria Souza', state: 'SP', electionYear: 2026 },
    { id: 'person-b', name: 'Maria Souza', state: 'SP', electionYear: 2026 },
  ])

  assert.equal(groups.length, 2)
})

test('keeps candidacies from different election years in separate groups', () => {
  const groups = groupCandidateRecords([
    { id: '2022', name: 'Ana Silva', state: 'SP', electionYear: 2022 },
    { id: '2026', name: 'Ana Silva', state: 'SP', electionYear: 2026 },
  ])

  assert.equal(groups.length, 2)
})

test('prefers the freshest material record when source authority is equal', () => {
  const canonical = chooseCanonicalCandidate([
    {
      id: 'governor',
      position: 'GOVERNADOR',
      candidacyStatus: 'deferido',
      materialUpdatedAt: new Date('2026-08-06T10:00:00.000Z'),
      updatedAt: new Date('2026-08-06T10:00:00.000Z'),
    },
    {
      id: 'president',
      position: 'PRESIDENTE',
      candidacyStatus: 'cotado',
      materialUpdatedAt: new Date('2026-08-07T10:00:00.000Z'),
      updatedAt: new Date('2026-08-07T10:00:00.000Z'),
    },
  ])

  assert.equal(canonical.id, 'president')
})

test('prefers the official TSE record over a newer legacy pre-candidate row', () => {
  const canonical = chooseCanonicalCandidate([
    {
      id: 'legacy',
      position: 'PRESIDENTE',
      candidacyStatus: 'pre_candidato',
      candidacyStatusSourceUrl: 'https://example.com/noticia',
      candidacyStatusVerifiedAt: new Date('2026-08-07T12:00:00.000Z'),
      materialUpdatedAt: new Date('2026-08-07T12:00:00.000Z'),
      updatedAt: new Date('2026-08-07T12:00:00.000Z'),
    },
    {
      id: 'official',
      tseId: '280001',
      position: 'PRESIDENTE',
      candidacyStatus: 'indeferido',
      candidacyStatusSourceUrl: 'https://dadosabertos.tse.jus.br/dataset/candidatos-2026',
      candidacyStatusVerifiedAt: new Date('2026-08-06T12:00:00.000Z'),
      materialUpdatedAt: new Date('2026-08-06T12:00:00.000Z'),
      updatedAt: new Date('2026-08-06T12:00:00.000Z'),
    },
  ])

  assert.equal(canonical.id, 'official')
})

test('uses a deterministic office preference when status strength is equal', () => {
  const canonical = chooseCanonicalCandidate([
    {
      id: 'governor',
      position: 'GOVERNADOR',
      candidacyStatus: 'pre_candidato',
      materialUpdatedAt: null,
      updatedAt: new Date('2026-08-07T10:00:00.000Z'),
    },
    {
      id: 'president',
      position: 'PRESIDENTE',
      candidacyStatus: 'pre_candidato',
      materialUpdatedAt: null,
      updatedAt: new Date('2026-08-06T10:00:00.000Z'),
    },
  ])

  assert.equal(canonical.id, 'president')
})

test('deduplicates list records with the same identity using the canonical rule', () => {
  const shared = {
    name: 'Ana Silva',
    state: 'SP',
    electionYear: 2026,
    personKey: 'ana-silva',
    candidacyStatus: 'pre_candidato',
    materialUpdatedAt: null,
    updatedAt: new Date('2026-08-07T10:00:00.000Z'),
  }
  const candidates = deduplicateCandidateRecords([
    { ...shared, id: 'governor', position: 'GOVERNADOR' },
    { ...shared, id: 'president', position: 'PRESIDENTE' },
  ])

  assert.deepEqual(candidates.map((candidate) => candidate.id), ['president'])
})
