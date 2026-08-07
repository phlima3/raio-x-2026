import assert from 'node:assert/strict'
import test from 'node:test'
import {
  curatedPersonKeyForName,
  findCuratedCandidate,
  mergeExtractedCandidates,
  shouldAcceptIncomingStatus,
} from './syncPresidenciaveis'

test('resolves persistence only through an explicitly curated personKey', () => {
  const personKey = curatedPersonKeyForName('Lula')
  assert.ok(personKey)

  const resolved = findCuratedCandidate('Lula', [
    { id: 'legacy-name-only', name: 'Luiz Inácio Lula da Silva', personKey: null },
    { id: 'curated', personKey },
  ])
  assert.equal(resolved?.id, 'curated')
  assert.equal(findCuratedCandidate('Pessoa desconhecida', [{ id: 'x', personKey }]), undefined)
  assert.equal(
    findCuratedCandidate('Lula', [
      { id: 'duplicate-a', personKey },
      { id: 'duplicate-b', personKey },
    ]),
    undefined,
  )
})

test('keeps the source that actually supports the winning candidacy status', () => {
  const [candidate] = mergeExtractedCandidates([
    {
      sourceId: 'fonte-fraca',
      sourceUrl: 'https://example.com/pre-candidatura',
      candidates: [{ name: 'Ana Silva', party: 'ABC', status: 'pre_candidato' }],
    },
    {
      sourceId: 'fonte-forte',
      sourceUrl: 'https://example.com/registro',
      candidates: [{ name: 'Ana Silva', party: 'ABC', status: 'registro_solicitado' }],
    },
  ])

  assert.equal(candidate.status, 'registro_solicitado')
  assert.equal(candidate.statusSourceUrl, 'https://example.com/registro')
})

test('does not replace an official source with news for the same status', () => {
  assert.equal(
    shouldAcceptIncomingStatus({
      currentStatus: 'deferido',
      currentSourceUrl: 'https://divulgacandcontas.tse.jus.br/candidatura/1',
      incomingStatus: 'deferido',
      incomingSourceUrl: 'https://example.com/noticia',
    }),
    false,
  )
})

test('accepts an official deferimento after an official indeferimento on appeal', () => {
  assert.equal(
    shouldAcceptIncomingStatus({
      currentStatus: 'indeferido',
      currentSourceUrl: 'https://divulgacandcontas.tse.jus.br/candidatura/1',
      incomingStatus: 'deferido',
      incomingSourceUrl: 'https://divulgacandcontas.tse.jus.br/candidatura/1',
    }),
    true,
  )
})
