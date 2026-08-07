import assert from 'node:assert/strict'
import test from 'node:test'
import { validateRevalidationPayload } from './revalidation'

test('accepts a bounded set of safe application paths and cache tags', () => {
  assert.deepEqual(
    validateRevalidationPayload({
      paths: ['/candidatos/ana-sp', '/', '/sitemap.xml'],
      tags: ['candidate:ana-sp'],
    }),
    {
      paths: ['/candidatos/ana-sp', '/', '/sitemap.xml'],
      tags: ['candidate:ana-sp'],
    },
  )
})

test('rejects traversal, absolute URLs and oversized payloads', () => {
  assert.equal(validateRevalidationPayload({ paths: ['/../admin'] }), null)
  assert.equal(validateRevalidationPayload({ paths: ['https://evil.example/'] }), null)
  assert.equal(
    validateRevalidationPayload({ paths: Array.from({ length: 51 }, (_, i) => `/p/${i}`) }),
    null,
  )
})
