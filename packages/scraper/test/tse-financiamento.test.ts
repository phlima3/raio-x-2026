import { describe, expect, it, vi } from 'vitest'

import { financingUpdateData } from '../src/sources/tseFinanciamento'

const ACCOUNTS = {
  totalReceived: 202062,
  totalSpent: 0,
  totalContracted: 0,
  spendingLimit: 88944030.8,
  fefcReceived: 50000,
  partyFundReceived: 0,
  crowdfundingReceived: 0,
  individualsReceived: 2062,
  companiesReceived: 0,
  ownResourcesReceived: 150000,
  otherReceived: 0,
  accountsUpdatedAt: new Date('2026-08-28T00:00:00.000Z'),
  deliveryControlNumber: '000140100000BR8258607',
  donors: [
    { name: 'EMPRESA LTDA', amount: 50000, count: 1, cnpj: '12345678000190', crowdfunding: false },
    { name: 'MARIA ANDRADE', amount: 2062, count: 1, cnpj: null, crowdfunding: false },
  ],
  suppliers: [],
}

describe('financingUpdateData', () => {
  it('maps the parsed accounts onto the columns', () => {
    const data = financingUpdateData(ACCOUNTS, 2026, 'https://exemplo/candidato')
    expect(data.year).toBe(2026)
    expect(data.totalReceived).toBe(202062)
    expect(data.fefcReceived).toBe(50000)
    expect(data.spendingLimit).toBe(88944030.8)
    expect(data.sourceUrl).toBe('https://exemplo/candidato')
    expect(data.accountsUpdatedAt).toEqual(new Date('2026-08-28T00:00:00.000Z'))
  })

  it('cites the candidacy page, never a file to download', () => {
    // Foi o defeito que a ficha já teve nas propostas e no patrimônio.
    const data = financingUpdateData(ACCOUNTS, 2026, 'https://exemplo/candidato')
    expect(String(data.sourceUrl)).not.toMatch(/\.(zip|pdf)$/i)
  })

  it('carries no CPF into the stored donors', () => {
    const data = financingUpdateData(ACCOUNTS, 2026, 'https://exemplo/candidato')
    const serialized = JSON.stringify(data.donors)
    expect(serialized).toContain('12345678000190')
    expect(serialized).toContain('MARIA ANDRADE')
    expect(serialized).not.toContain('cpf')
  })
})
