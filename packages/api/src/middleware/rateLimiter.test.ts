import assert from 'node:assert/strict'
import test from 'node:test'

import { isInternalRequest } from './rateLimiter'

test('requisicao do proxy publico continua sendo contada', () => {
  assert.equal(isInternalRequest({ 'x-forwarded-for': '203.0.113.7' }), false)
  assert.equal(isInternalRequest({ 'x-forwarded-for': ['203.0.113.7', '10.0.0.1'] }), false)
})

test('chamada interna, sem passar pelo proxy, nao entra na janela', () => {
  // E o caso do build do site: 593 paginas pre-renderizadas contra
  // `API_URL_INTERNAL`, que estouravam o limite de 100/min e derrubavam o build.
  assert.equal(isInternalRequest({}), true)
  assert.equal(isInternalRequest({ 'x-forwarded-for': '' }), true)
  assert.equal(isInternalRequest({ 'x-forwarded-for': [] }), true)
})
