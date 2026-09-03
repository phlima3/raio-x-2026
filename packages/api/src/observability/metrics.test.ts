import assert from 'node:assert/strict'
import test from 'node:test'

import { routeLabelFor } from './metrics'

test('rotula pelo padrao do Express, nao pelo caminho cru', () => {
  // Sao 519 fichas: rotular pelo caminho criaria uma serie por candidato, e
  // cada status multiplicaria isso.
  assert.equal(
    routeLabelFor({ baseUrl: '/api/candidates', route: { path: '/:slug' } }),
    '/api/candidates/:slug',
  )
  assert.equal(
    routeLabelFor({ baseUrl: '/api/candidates', route: { path: '/' } }),
    '/api/candidates',
  )
})

test('requisicao sem rota casada nao vira serie nova', () => {
  assert.equal(routeLabelFor({ baseUrl: '', route: undefined }), 'desconhecida')
  assert.equal(routeLabelFor({ baseUrl: undefined, route: undefined }), 'desconhecida')
})
