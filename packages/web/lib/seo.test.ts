import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  absoluteImageUrl,
  buildCandidateSitemapEntries,
  canonicalUrl,
  canonicalRedirectTarget,
} from './seo'

test('canonicalUrl resolves site paths against the production origin', () => {
  assert.equal(
    canonicalUrl('/candidatos/luiz-inacio-lula-da-silva'),
    'https://raio-x-2026.com.br/candidatos/luiz-inacio-lula-da-silva',
  )
})

test('absoluteImageUrl produces crawlable HTTPS image URLs', () => {
  assert.equal(
    absoluteImageUrl('/images/candidates/lula.jpg'),
    'https://raio-x-2026.com.br/images/candidates/lula.jpg',
  )
  assert.equal(
    absoluteImageUrl('http://www.senado.leg.br/senadores/foto.jpg'),
    'https://www.senado.leg.br/senadores/foto.jpg',
  )
  assert.equal(absoluteImageUrl('http://images.example.org/foto.jpg'), undefined)
  assert.equal(absoluteImageUrl('http://'), undefined)
  assert.equal(absoluteImageUrl(null), undefined)
})

test('buildCandidateSitemapEntries emits each qualified canonical URL once', () => {
  const entries = buildCandidateSitemapEntries([
    {
      slug: 'romeu-zema',
      indexable: true,
      updatedAt: '2026-08-01T10:00:00.000Z',
    },
    {
      slug: 'romeu-zema',
      indexable: true,
      updatedAt: '2026-08-05T12:00:00.000Z',
    },
    {
      slug: 'perfil-incompleto',
      indexable: false,
      updatedAt: '2026-08-06T12:00:00.000Z',
    },
  ])

  assert.deepEqual(entries, [
    {
      url: 'https://raio-x-2026.com.br/candidatos/romeu-zema',
      lastModified: new Date('2026-08-05T12:00:00.000Z'),
    },
  ])
})

test('canonicalRedirectTarget consolidates production protocol and hostname in one hop', () => {
  assert.equal(
    canonicalRedirectTarget({
      hostname: 'www.raio-x-2026.com.br',
      protocol: 'https',
      pathname: '/candidatos/ana',
      search: '?tema=saude',
    }),
    'https://raio-x-2026.com.br/candidatos/ana?tema=saude',
  )
  assert.equal(
    canonicalRedirectTarget({
      hostname: 'raio-x-2026.com.br',
      protocol: 'http',
      pathname: '/',
      search: '',
    }),
    'https://raio-x-2026.com.br/',
  )
  assert.equal(
    canonicalRedirectTarget({
      hostname: 'raio-x-2026.com.br',
      protocol: 'https',
      pathname: '/',
      search: '',
    }),
    null,
  )
  assert.equal(
    canonicalRedirectTarget({
      hostname: 'localhost',
      protocol: 'http',
      pathname: '/',
      search: '',
    }),
    null,
  )
})
