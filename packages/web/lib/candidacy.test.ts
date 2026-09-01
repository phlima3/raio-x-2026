import assert from 'node:assert/strict'
import test from 'node:test'
import { bioProvenance, candidacyStatusPresentation, opensAsDownload } from './candidacy'

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

// --- opensAsDownload: o rótulo tem de dizer a verdade sobre o clique -------

test('reconhece a página da candidatura como endereço que abre para leitura', () => {
  assert.equal(
    opensAsDownload(
      'https://divulgacandcontas.tse.jus.br/divulga/#/candidato/BR/BR/20322002026/280002540694/2026/BR',
    ),
    false,
  )
})

test('reconhece o pacote do catálogo como arquivo que cai nos downloads', () => {
  // É o endereço que a ficha estampava como "Fonte", baixando um ZIP.
  assert.equal(
    opensAsDownload(
      'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand_complementar/consulta_cand_complementar_2026.zip',
    ),
    true,
  )
  assert.equal(opensAsDownload('https://cdn.tse.jus.br/proposta_governo_2026_BR.zip#entry=x.pdf'), true)
  assert.equal(opensAsDownload('https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/doc/1.pdf'), true)
})

test('não confunde ponto no caminho com extensão de arquivo', () => {
  assert.equal(opensAsDownload('https://tse.jus.br/eleicoes/eleicoes-2026'), false)
  assert.equal(opensAsDownload('https://tse.jus.br/zip/candidatos'), false)
})

test('a procedência da introdução sai da fonte citada', () => {
  const tse = 'https://divulgacandcontas.tse.jus.br/divulga/#/candidato/SP/SP/1/2/2026/SP'
  assert.equal(bioProvenance(tse), 'registro_oficial')
  assert.equal(bioProvenance('https://www.tre-sp.jus.br/candidato/1'), 'registro_oficial')
  // Texto redigido continua anunciado como síntese.
  assert.equal(bioProvenance('https://pt.wikipedia.org/wiki/Fernando_Haddad'), 'sintese_editorial')
  assert.equal(bioProvenance(null), 'sintese_editorial')
  // Nada de http nem host forjado passa por oficial.
  assert.equal(bioProvenance('http://divulgacandcontas.tse.jus.br/x'), 'sintese_editorial')
  assert.equal(bioProvenance('https://tse.jus.br.evil.example/x'), 'sintese_editorial')
  assert.equal(bioProvenance('nao-e-url'), 'sintese_editorial')
})
