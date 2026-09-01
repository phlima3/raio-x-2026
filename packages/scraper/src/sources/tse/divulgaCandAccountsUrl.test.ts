import assert from 'node:assert/strict'
import test from 'node:test'

import { divulgaCandAccountsUrl, divulgaCandPartyNumber } from './divulgaCand'

const SP = {
  electionId: '20322002026',
  year: 2026,
  electoralUnit: 'SP',
  uf: 'SP',
  candidateId: '250002549705',
} as const

test('separa o número da legenda do número do candidato', () => {
  // Governador e presidente: a urna usa as duas casas da legenda nos dois.
  assert.equal(divulgaCandPartyNumber(13), 13)
  assert.equal(divulgaCandPartyNumber(10), 10)
  // Senado: três casas, as duas primeiras são a legenda.
  assert.equal(divulgaCandPartyNumber(180), 18) // Marina, REDE
  assert.equal(divulgaCandPartyNumber(111), 11) // Derrite, PP
  assert.equal(divulgaCandPartyNumber(808), 80) // Maíra, UP
})

test('a URL da prestação repete o número só quando legenda e candidato coincidem', () => {
  assert.ok(divulgaCandAccountsUrl(SP, 13).endsWith('/SP/1/13/13/250002549705'))
  // O caso que devolvia corpo vazio: 180/180 em vez de 18/180.
  assert.ok(divulgaCandAccountsUrl(SP, 180).endsWith('/SP/1/18/180/250002549705'))
})
