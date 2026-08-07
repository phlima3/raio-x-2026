import assert from 'node:assert/strict'
import test from 'node:test'
import { candidacyStatusPresentation } from './candidacy'

test('presents each tracked election state without overstating official registration', () => {
  assert.equal(candidacyStatusPresentation('pre_candidato').label, 'Pré-candidatura anunciada')
  assert.equal(
    candidacyStatusPresentation('registro_solicitado').label,
    'Registro solicitado à Justiça Eleitoral',
  )
  assert.equal(candidacyStatusPresentation('deferido').label, 'Registro deferido')
  assert.equal(candidacyStatusPresentation('cotado').label, 'Nome cotado')
  assert.equal(candidacyStatusPresentation('cancelado').label, 'Registro cancelado')
  assert.equal(candidacyStatusPresentation('status_nao_mapeado').requiresReview, true)
  assert.equal(candidacyStatusPresentation(null).label, 'Situação não verificada')
  assert.equal(candidacyStatusPresentation('confirmado').requiresReview, true)
})
