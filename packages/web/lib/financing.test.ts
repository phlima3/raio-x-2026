import assert from 'node:assert/strict'
import test from 'node:test'
import { financingComposition, filterValidParties } from './financing'

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
