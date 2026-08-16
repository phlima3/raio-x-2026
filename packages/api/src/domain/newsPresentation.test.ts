import assert from 'node:assert/strict'
import test from 'node:test'
import { presentNewsItem } from './newsPresentation'

test('maps the database news record to the public, source-attributed contract', () => {
  const result = presentNewsItem({
    id: 'news-1',
    headline: 'Entrevista apresenta proposta de educação',
    summary: 'A pessoa entrevistada detalhou metas e informou a origem dos recursos.',
    url: 'https://example.org/noticia',
    topic: 'education',
    publishedAt: null,
    fetchedAt: new Date('2026-08-07T12:00:00.000Z'),
    hasContradiction: false,
    contradictionNote: null,
  })

  assert.deepEqual(result, {
    id: 'news-1',
    title: 'Entrevista apresenta proposta de educação',
    summary: 'A pessoa entrevistada detalhou metas e informou a origem dos recursos.',
    sourceUrl: 'https://example.org/noticia',
    publishedAt: new Date('2026-08-07T12:00:00.000Z'),
    topic: 'education',
    hasContradiction: false,
    contradictionNote: null,
  })
})
