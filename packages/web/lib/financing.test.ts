import assert from 'node:assert/strict'
import test from 'node:test'
import {
  financingComposition,
  filterValidParties,
  fefcStanding,
  fmtBRLShort,
  fundoEleitoralFigure,
} from './financing'

test('valor curto em reais, como manchete', () => {
  assert.equal(fmtBRLShort(42000000), 'R$ 42 milhões')
  assert.equal(fmtBRLShort(35309910), 'R$ 35,3 milhões')
  assert.equal(fmtBRLShort(2800007), 'R$ 2,8 milhões')
  assert.equal(fmtBRLShort(1000000), 'R$ 1 milhão')
  assert.equal(fmtBRLShort(607500.16), 'R$ 608 mil')
  assert.equal(fmtBRLShort(9621.53), 'R$ 9,6 mil')
  assert.equal(fmtBRLShort(317), 'R$' + String.fromCharCode(160) + '317') // Intl usa espaço inseparável
  assert.equal(fmtBRLShort(42000000, 'figure'), 'R$ 42 mi')
  assert.equal(fmtBRLShort(1500000, 'figure'), 'R$ 1,5 mi')
  assert.equal(fmtBRLShort(50000, 'figure'), 'R$ 50 mil')
})

test('cifra do fundão distingue sem contas, origem não consultada, zero e valor', () => {
  assert.deepEqual(fundoEleitoralFigure(null), {
    value: null,
    label: 'Sem prestação de contas no TSE',
    note: null,
  })
  assert.deepEqual(fundoEleitoralFigure({ totalReceived: '2800007', fefcReceived: null }), {
    value: 'R$ 2,8 mi',
    label: 'arrecadados',
    note: 'origem do dinheiro não consultada',
  })
  assert.deepEqual(fundoEleitoralFigure({ totalReceived: '2800007', fefcReceived: '0' }), {
    value: 'R$ 0',
    label: 'do fundo eleitoral',
    note: 'R$ 2,8 milhões de outras fontes',
  })
  assert.deepEqual(
    fundoEleitoralFigure({ totalReceived: '43677867.29', fefcReceived: '42000000' }),
    { value: 'R$ 42 mi', label: 'do fundo eleitoral', note: '96% da receita' },
  )
  assert.deepEqual(fundoEleitoralFigure({ totalReceived: '0', fefcReceived: '0' }), {
    value: 'R$ 0',
    label: 'sem receita declarada',
    note: null,
  })
})

test('orders the buckets by size and skips the empty ones', () => {
  const parts = financingComposition({
    totalReceived: 1293445.81,
    fefcReceived: 0,
    partyFundReceived: 0,
    crowdfundingReceived: 1220288,
    individualsReceived: 73157.81,
    companiesReceived: 0,
    ownResourcesReceived: 0,
    otherReceived: 0,
  })
  assert.deepEqual(parts.map((part) => part.label), [
    'Financiamento coletivo',
    'Pessoas físicas',
  ])
  assert.ok(Math.abs(parts[0].share - 94.35) < 0.1)
})

test('shows the fundão when the campaign received one', () => {
  const parts = financingComposition({
    totalReceived: 202062,
    fefcReceived: 50000,
    partyFundReceived: 0,
    crowdfundingReceived: 0,
    individualsReceived: 2062,
    companiesReceived: 0,
    ownResourcesReceived: 150000,
    otherReceived: 0,
  })
  assert.deepEqual(parts.map((part) => part.label), [
    'Recursos próprios',
    'Fundo eleitoral (FEFC)',
    'Pessoas físicas',
  ])
})

test('keeps the shares adding up to the whole', () => {
  // `otherReceived` existe justamente para isto: sem ele a proporção exibida
  // mentiria para quem usou comercialização ou rendimento de aplicação.
  const parts = financingComposition({
    totalReceived: 1000,
    fefcReceived: 400,
    partyFundReceived: 0,
    crowdfundingReceived: 0,
    individualsReceived: 100,
    companiesReceived: 0,
    ownResourcesReceived: 0,
    otherReceived: 500,
  })
  const total = parts.reduce((sum, part) => sum + part.share, 0)
  assert.ok(Math.abs(total - 100) < 0.01)
})

test('returns nothing when there is no total, instead of dividing by zero', () => {
  assert.deepEqual(
    financingComposition({
      totalReceived: 0,
      fefcReceived: 0,
      partyFundReceived: 0,
      crowdfundingReceived: 0,
      individualsReceived: 0,
      companiesReceived: 0,
      ownResourcesReceived: 0,
      otherReceived: 0,
    }),
    [],
  )
})

test('reads the decimal strings Prisma returns without turning them into NaN', () => {
  // `Decimal` chega serializado como string na resposta da API.
  const parts = financingComposition({
    totalReceived: '202062',
    fefcReceived: '50000',
    partyFundReceived: '0',
    crowdfundingReceived: '0',
    individualsReceived: '2062',
    companiesReceived: '0',
    ownResourcesReceived: '150000',
    otherReceived: '0',
  })
  assert.equal(parts[0].label, 'Recursos próprios')
  assert.equal(parts[0].value, 150000)
})

test('filterValidParties discards legacy {name, value} rows and keeps the ones with a real amount', () => {
  // `import:financiamento` (2018/2022) gravou doadores como `{ name, value }`,
  // sem `amount`. Renderizar essa linha faria `fmtBRL` mostrar "R$ NaN".
  const parties = filterValidParties([
    { name: 'Legado sem amount', value: 5000 },
    { name: 'Doador Real', amount: 1000, cnpj: '12345678000199' },
    { name: 'Amount não numérico', amount: 'NaN' },
  ])
  assert.deepEqual(parties, [{ name: 'Doador Real', amount: 1000, cnpj: '12345678000199' }])
})

test('filterValidParties returns an empty list for anything that is not an array', () => {
  assert.deepEqual(filterValidParties(null), [])
  assert.deepEqual(filterValidParties(undefined), [])
})

// --- fefcStanding: os três estados do fundo eleitoral -----------------------

test('sem prestação entregue não é o mesmo que não ter recebido fundão', () => {
  // A distinção que o bloco de comparação existe para preservar: quem não
  // entregou contas ao TSE e quem entregou declarando zero não podem render
  // a mesma coisa na tela.
  const naoEntregou = fefcStanding(null)
  const naoRecebeu = fefcStanding({ totalReceived: 2750000, fefcReceived: 0 })

  assert.equal(naoEntregou.kind, 'none')
  assert.equal(naoRecebeu.kind, 'known')
  assert.notEqual(naoEntregou.kind, naoRecebeu.kind)
})

test('composição não informada é um terceiro estado, nem ausência nem zero', () => {
  // `fefcReceived` nulo com prestação entregue: o TSE tem as contas, mas a
  // origem da receita não foi consultada. Exibir 0% aqui inventaria dado.
  const standing = fefcStanding({ totalReceived: 1000000, fefcReceived: null })
  assert.equal(standing.kind, 'unknown')
})

test('calcula a proporção do fundão sobre a arrecadação', () => {
  const standing = fefcStanding({ totalReceived: 42300000, fefcReceived: 42000000 })
  assert.equal(standing.kind, 'known')
  assert.equal(standing.kind === 'known' && standing.value, 42000000)
  assert.ok(standing.kind === 'known' && Math.abs(standing.share! - 99.29) < 0.01)
})

test('quem não recebeu fundão fica com zero por cento, não com ausência', () => {
  const standing = fefcStanding({ totalReceived: 2750000, fefcReceived: 0 })
  assert.equal(standing.kind === 'known' && standing.share, 0)
})

test('lê os decimais em string que a API devolve', () => {
  const standing = fefcStanding({ totalReceived: '35300000', fefcReceived: '35000000' })
  assert.equal(standing.kind === 'known' && standing.value, 35000000)
  assert.ok(standing.kind === 'known' && Math.abs(standing.share! - 99.15) < 0.01)
})

test('não divide por zero quando a arrecadação declarada é zero', () => {
  // Prestação entregue zerada: o valor é dado, a proporção não existe.
  const standing = fefcStanding({ totalReceived: 0, fefcReceived: 0 })
  assert.equal(standing.kind, 'known')
  assert.equal(standing.kind === 'known' && standing.share, null)
})

test('trata valor não numérico como não informado em vez de virar NaN', () => {
  assert.equal(fefcStanding({ totalReceived: 1000, fefcReceived: 'n/d' }).kind, 'unknown')
})
