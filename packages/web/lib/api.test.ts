import assert from 'node:assert/strict'
import test from 'node:test'
import { ApiRequestError, isApiNotFound } from './api'

test('distinguishes a missing candidate from transient or unrelated API failures', () => {
  const missingCandidate = new ApiRequestError(
    404,
    '/api/candidates/ana-sp',
    'Candidato não encontrado',
  )

  assert.equal(
    isApiNotFound(missingCandidate, '/api/candidates/ana-sp'),
    true,
  )
  assert.equal(
    isApiNotFound(missingCandidate, '/api/candidates/seo-report'),
    false,
  )
  assert.equal(
    isApiNotFound(
      new ApiRequestError(503, '/api/candidates/ana-sp', 'Indisponível'),
      '/api/candidates/ana-sp',
    ),
    false,
  )
})
