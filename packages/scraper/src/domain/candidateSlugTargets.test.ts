import assert from 'node:assert/strict'
import test from 'node:test'
import { candidateSlugTargets } from './candidateSlugTargets'

const live = { id: 'tse-presidente', isPublished: true }
const tombstone = { id: 'editorial-governador', isPublished: false }
const otherTombstone = { id: 'editorial-presidente', isPublished: false }

test('a lápide despublicada não bloqueia a candidatura viva que divide o slug', () => {
  // O caso do Zema: ficha oficial do TSE para presidente + pré-candidatura
  // editorial a governador de MG, ambas com slug `romeu-zema-novo-mg`.
  assert.deepEqual(candidateSlugTargets([live, tombstone]), [live])
})

test('sem nada publicado, devolve todas para o chamador decidir', () => {
  const rows = [tombstone, otherTombstone]
  assert.deepEqual(candidateSlugTargets(rows), rows)
})

test('duas candidaturas publicadas continuam ambíguas', () => {
  const rows = [live, { id: 'outra-viva', isPublished: true }]
  assert.deepEqual(candidateSlugTargets(rows), rows)
})

test('uma candidatura só passa intacta, publicada ou não', () => {
  assert.deepEqual(candidateSlugTargets([live]), [live])
  assert.deepEqual(candidateSlugTargets([tombstone]), [tombstone])
})
