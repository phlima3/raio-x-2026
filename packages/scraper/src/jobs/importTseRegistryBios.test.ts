import assert from 'node:assert/strict'
import test from 'node:test'
import { Position } from '@prisma/client'

import {
  dataPorExtenso,
  fichaDeRegistro,
  podeSobrescrever,
  rotuloEmMinuscula,
} from './importTseRegistryBios'

test('monta a ficha do governador com o que o registro traz', () => {
  assert.equal(
    fichaDeRegistro({
      position: Position.GOVERNADOR,
      state: 'SP',
      party: 'PT',
      ballotNumber: 13,
      birthDate: '25/01/1963',
      birthState: 'SP',
      occupation: 'PROFESSOR DE ENSINO SUPERIOR',
      education: 'SUPERIOR COMPLETO',
    }),
    'Nasceu em 25 de janeiro de 1963 e é natural de São Paulo. ' +
      'Disputa o governo de São Paulo pelo PT, com o número 13. ' +
      'No registro da candidatura, declarou à Justiça Eleitoral a ocupação de ' +
      'professor de ensino superior e grau de instrução superior completo.',
  )
})

test('senador nasce fora do estado que disputa', () => {
  const ficha = fichaDeRegistro({
    position: Position.SENADOR,
    state: 'SP',
    party: 'REDE',
    ballotNumber: 180,
    birthDate: '08/02/1958',
    birthState: 'AC',
    occupation: 'DEPUTADO',
    education: 'SUPERIOR COMPLETO',
  })
  assert.match(ficha ?? '', /é natural do Acre\./)
  assert.match(ficha ?? '', /Disputa uma vaga ao Senado por São Paulo pelo REDE, com o número 180\./)
})

test('campo ausente some da frase em vez de virar "não informado"', () => {
  const ficha = fichaDeRegistro({
    position: Position.GOVERNADOR,
    state: 'SP',
    party: 'AGIR',
    ballotNumber: 36,
    birthDate: '28/04/1977',
    birthState: null,
    occupation: 'POLICIAL MILITAR',
    education: null,
  })
  assert.match(ficha ?? '', /^Nasceu em 28 de abril de 1977\./)
  assert.doesNotMatch(ficha ?? '', /natural|grau de instrução|não informado/)
  assert.match(ficha ?? '', /a ocupação de policial militar\.$/)
})

test('sem nascimento nem declaração não há ficha — cargo e partido já têm campo próprio', () => {
  assert.equal(
    fichaDeRegistro({
      position: Position.GOVERNADOR,
      state: 'SP',
      party: 'PT',
      ballotNumber: 13,
      birthDate: null,
      birthState: null,
      occupation: null,
      education: null,
    }),
    null,
  )
})

test('data só vira frase no formato do TSE', () => {
  assert.equal(dataPorExtenso('02/03/1985'), '2 de março de 1985')
  assert.equal(dataPorExtenso('1985-03-02'), null)
  assert.equal(dataPorExtenso('99/99/1985'), null)
  assert.equal(dataPorExtenso(null), null)
})

test('rótulo do TSE desce para minúscula no meio da frase', () => {
  assert.equal(rotuloEmMinuscula('SERVIDOR PÚBLICO MUNICIPAL'), 'servidor público municipal')
  assert.equal(rotuloEmMinuscula('ENSINO MÉDIO COMPLETO'), 'ensino médio completo')
  assert.equal(
    rotuloEmMinuscula('ESTUDANTE,  BOLSISTA, ESTAGIÁRIO'),
    'estudante, bolsista, estagiário',
  )
})

test('bio curada nunca é sobrescrita pela ficha', () => {
  const fonte = 'https://divulgacandcontas.tse.jus.br/divulga/#/candidato/SP/SP/1/2/2026/SP'
  assert.equal(podeSobrescrever({ bio: null, bioSourceUrl: null }, fonte), true)
  assert.equal(podeSobrescrever({ bio: '   ', bioSourceUrl: null }, fonte), true)
  // Ficha anterior, escrita por este mesmo job: pode atualizar.
  assert.equal(podeSobrescrever({ bio: 'Nasceu em...', bioSourceUrl: fonte }, fonte), true)
  // Texto curado, com outra fonte: preservado.
  assert.equal(
    podeSobrescrever({ bio: 'Economista e professor.', bioSourceUrl: 'https://pt.wikipedia.org/x' }, fonte),
    false,
  )
  assert.equal(podeSobrescrever({ bio: 'Sem fonte declarada.', bioSourceUrl: null }, fonte), false)
})
