import assert from 'node:assert/strict'
import test from 'node:test'

import { agregarContas, baldeDaReceita, dataBr, valorBr } from './importTseAccounting'

test('valor no formato brasileiro, e vazio não vira NaN', () => {
  assert.equal(valorBr('8.093.962,77'), 8093962.77)
  assert.equal(valorBr('600,00'), 600)
  assert.equal(valorBr(''), 0)
  assert.equal(valorBr(null), 0)
})

test('data só no formato do TSE', () => {
  assert.equal(dataBr('27/08/2026')?.toISOString().slice(0, 10), '2026-08-27')
  assert.equal(dataBr('2026-08-27'), null)
  assert.equal(dataBr(null), null)
})

test('fonte e origem são eixos distintos: cada receita cai em um balde só', () => {
  // A linha do fundão tem origem "Recursos de partido político"; classificar
  // pelos dois eixos contaria o mesmo dinheiro duas vezes.
  assert.equal(baldeDaReceita('FUNDO ESPECIAL', 'Recursos de partido político'), 'fefc')
  assert.equal(baldeDaReceita('FUNDO PARTIDARIO', 'Recursos de partido político'), 'fundoPartidario')
  assert.equal(baldeDaReceita('OUTROS RECURSOS', 'Recursos de pessoas físicas'), 'pessoasFisicas')
  assert.equal(
    baldeDaReceita('OUTROS RECURSOS', 'Recursos de Financiamento Coletivo'),
    'financiamentoColetivo',
  )
  assert.equal(baldeDaReceita('OUTROS RECURSOS', 'Categoria nova do TSE'), 'outros')
})

test('os baldes fecham com o total arrecadado', () => {
  const { contas } = agregarContas(
    [
      { SQ_PRESTADOR_CONTAS: 'p1', VR_RECEITA: '1.000,00', DS_FONTE_RECEITA: 'FUNDO ESPECIAL', DS_ORIGEM_RECEITA: 'Recursos de partido político', DT_PRESTACAO_CONTAS: '26/08/2026' },
      { SQ_PRESTADOR_CONTAS: 'p1', VR_RECEITA: '250,50', DS_FONTE_RECEITA: 'OUTROS RECURSOS', DS_ORIGEM_RECEITA: 'Recursos de pessoas físicas', DT_PRESTACAO_CONTAS: '31/08/2026' },
      { SQ_PRESTADOR_CONTAS: 'p1', VR_RECEITA: '10,00', DS_FONTE_RECEITA: 'OUTROS RECURSOS', DS_ORIGEM_RECEITA: 'Categoria que ainda não existe' },
    ],
    [],
  )
  assert.equal(contas.totalReceived, 1260.5)
  const soma = Object.values(contas.porBalde).reduce((a, b) => a + b, 0)
  assert.equal(soma, contas.totalReceived)
  assert.equal(contas.porBalde.fefc, 1000)
  assert.equal(contas.porBalde.outros, 10)
  // A data da prestação é a mais recente entregue.
  assert.equal(contas.accountsUpdatedAt?.toISOString().slice(0, 10), '2026-08-31')
})

test('despesa entra pelo prestador da candidatura, não pela UF inteira', () => {
  const receitas = [{ SQ_PRESTADOR_CONTAS: 'p1', VR_RECEITA: '100,00', DS_FONTE_RECEITA: 'OUTROS RECURSOS', DS_ORIGEM_RECEITA: 'Recursos de pessoas físicas' }]
  const { totalSpent } = agregarContas(receitas, [
    { SQ_PRESTADOR_CONTAS: 'p1', VR_PAGTO_DESPESA: '30,00' },
    { SQ_PRESTADOR_CONTAS: 'p2', VR_PAGTO_DESPESA: '9.999,00' },
  ])
  assert.equal(totalSpent, 30)
})

test('doador sem identificação real não vira linha na ficha', () => {
  const { contas } = agregarContas(
    [
      { SQ_PRESTADOR_CONTAS: 'p1', VR_RECEITA: '500,00', NM_DOADOR: '-4', NR_CPF_CNPJ_DOADOR: '-4' },
      { SQ_PRESTADOR_CONTAS: 'p1', VR_RECEITA: '300,00', NM_DOADOR_RFB: 'Direção Nacional - PT', NR_CPF_CNPJ_DOADOR: '00676262000170' },
      { SQ_PRESTADOR_CONTAS: 'p1', VR_RECEITA: '200,00', NM_DOADOR_RFB: 'Direção Nacional - PT', NR_CPF_CNPJ_DOADOR: '00676262000170' },
    ],
    [],
  )
  assert.equal(contas.doadores.length, 1)
  assert.deepEqual(contas.doadores[0], {
    name: 'Direção Nacional - PT',
    amount: 500,
    cnpj: '00676262000170',
  })
  // O total continua contando o que veio sem doador identificado.
  assert.equal(contas.totalReceived, 1000)
})
