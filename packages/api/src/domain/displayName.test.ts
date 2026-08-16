import assert from 'node:assert/strict'
import test from 'node:test'

import { toDisplayName, toDisplayNameOrNull } from './displayName'

test('converts the uppercase civil name the TSE publishes', () => {
  assert.equal(toDisplayName('ROMEU ZEMA NETO'), 'Romeu Zema Neto')
  assert.equal(toDisplayName('RONALDO RAMOS CAIADO'), 'Ronaldo Ramos Caiado')
  assert.equal(
    toDisplayName('SAMARA MARTINS DA SILVA FEITOSA'),
    'Samara Martins da Silva Feitosa',
  )
})

test('keeps particles lowercase only inside the name', () => {
  assert.equal(toDisplayName('LUIZ INÁCIO LULA DA SILVA'), 'Luiz Inácio Lula da Silva')
  assert.equal(toDisplayName('HERTZ DA CONCEICAO DIAS'), 'Hertz da Conceicao Dias')
  assert.equal(toDisplayName('DOS SANTOS PEREIRA'), 'Dos Santos Pereira')
})

test('preserves accents when changing case', () => {
  assert.equal(
    toDisplayName('ALFREDO GASPAR DE MENDONÇA NETO'),
    'Alfredo Gaspar de Mendonça Neto',
  )
  assert.equal(toDisplayName('SUÊD HAIDAR NOGUEIRA'), 'Suêd Haidar Nogueira')
})

test('capitalizes each part of a hyphenated or apostrophed name', () => {
  assert.equal(toDisplayName("MARIA D'ÁVILA SOUZA-LIMA"), "Maria D'Ávila Souza-Lima")
})

// A regra que protege o catálogo editorial: um nome já digitado por uma pessoa
// não é reescrito, senão "Simone Tebet" ganharia ainda outro estilo.
test('leaves a name that is not fully uppercase untouched', () => {
  assert.equal(toDisplayName('Simone Tebet'), 'Simone Tebet')
  assert.equal(toDisplayName('Luiz Inácio Lula da Silva'), 'Luiz Inácio Lula da Silva')
  assert.equal(toDisplayName('Flávio Bolsonaro'), 'Flávio Bolsonaro')
})

test('leaves values without letters alone and preserves null', () => {
  assert.equal(toDisplayName('---'), '---')
  assert.equal(toDisplayNameOrNull(null), null)
  assert.equal(toDisplayNameOrNull('ZEMA'), 'Zema')
})
