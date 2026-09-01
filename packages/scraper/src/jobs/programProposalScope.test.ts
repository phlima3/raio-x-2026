import assert from 'node:assert/strict'
import test from 'node:test'
import { Position } from '@prisma/client'

import {
  candidateScope,
  parsePositionsArg,
  parseStateArg,
  programCitationUrl,
} from './extractProgramProposals'

test('combina cargo e UF para recortar uma disputa estadual', () => {
  assert.deepEqual(
    candidateScope({ positions: [Position.GOVERNADOR], state: 'SP' }),
    { position: { in: [Position.GOVERNADOR] }, state: 'SP' },
  )
  assert.deepEqual(candidateScope({ state: 'SP' }), { state: 'SP' })
  assert.deepEqual(candidateScope({}), {})
})

test('--slug ignora cargo e UF em vez de somar filtros que escondem a ficha pedida', () => {
  assert.deepEqual(
    candidateScope({ slug: 'x-pt-sp-governador-2026', positions: [Position.PRESIDENTE], state: 'RJ' }),
    { slug: 'x-pt-sp-governador-2026' },
  )
})

test('UF é normalizada para maiúscula e a desconhecida aborta em vez de filtrar por nada', () => {
  assert.equal(parseStateArg(['--state=sp']), 'SP')
  assert.equal(parseStateArg([]), undefined)
  assert.throws(() => parseStateArg(['--state=XX']), /UF desconhecida/)
})

test('cargo desconhecido aborta; a lista aceita mais de um', () => {
  assert.deepEqual(
    parsePositionsArg(['--position=governador,senador']),
    [Position.GOVERNADOR, Position.SENADOR],
  )
  assert.equal(parsePositionsArg([]), undefined)
  assert.throws(() => parsePositionsArg(['--position=VEREADOR_LUNAR']), /Cargo desconhecido/)
})

const PAGINA = 'https://divulgacandcontas.tse.jus.br/divulga/#/candidato/SP/SP/1/2/2026/SP'
const PACOTE = 'https://cdn.tse.jus.br/.../proposta_governo_2026_SP.zip#entry=SP%2F1.pdf'

test('o pacote da UF cede lugar à página da candidatura', () => {
  // O clique baixava o ZIP do estado inteiro em vez de abrir o plano.
  assert.equal(
    programCitationUrl({
      sourceUrl: PACOTE,
      candidate: { candidacyStatusSourceUrl: PAGINA },
    }),
    PAGINA,
  )
})

test('a página da candidatura vence a do documento quando o PDF é compartilhado', () => {
  // Caso real: o PCO registrou o mesmo programa na disputa presidencial e na de
  // governo de SP; o dedupe por SHA-256 deixou um documento só, apontando para
  // a ficha presidencial. Citar aquilo mandava o leitor para outra pessoa.
  const deOutraCandidatura =
    'https://divulgacandcontas.tse.jus.br/divulga/#/candidato/BR/BR/2032/280002552487/2026/BR'
  assert.equal(
    programCitationUrl({
      sourceUrl: PACOTE,
      metadata: { candidatePage: deOutraCandidatura },
      candidate: { candidacyStatusSourceUrl: PAGINA },
    }),
    PAGINA,
  )
})

test('sem página própria, a do documento ainda é melhor que o pacote', () => {
  const doDocumento = 'https://divulgacandcontas.tse.jus.br/divulga/#/candidato/OUTRA'
  assert.equal(
    programCitationUrl({ sourceUrl: PACOTE, metadata: { candidatePage: doDocumento } }),
    doDocumento,
  )
})

test('sem página citável o sourceUrl permanece, em vez de a proposta ficar sem fonte', () => {
  assert.equal(programCitationUrl({ sourceUrl: PACOTE, candidate: null }), PACOTE)
  assert.equal(
    programCitationUrl({ sourceUrl: PACOTE, candidate: { candidacyStatusSourceUrl: 'http://inseguro' } }),
    PACOTE,
  )
})
