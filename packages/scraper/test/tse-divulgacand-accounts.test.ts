import { describe, expect, it } from 'vitest'

import {
  parseBrazilianDate,
  parseDivulgaCandAccounts,
} from '../src/sources/tse/divulgaCandAccounts'

// Recorte fiel da consulta de 2026-08-29 para Renan Santos (280002540694).
const RENAN = {
  idEleicao: 20322002026,
  ano: 2026,
  dataUltimaAtualizacaoContas: '28/08/2026',
  numeroDeControleEntrega: '000140100000BR8258607',
  dadosConsolidados: {
    totalRecebido: 1293445.81,
    graphVrReceitaFinFefc: 0,
    graphVrReceitaFinFundo: 0,
    totalDoacaoFcc: 1220288,
    totalReceitaPF: 73157.81,
    totalReceitaPJ: 0,
    totalProprios: 0,
  },
  despesas: {
    valorLimiteDeGastos: 88944030.8,
    totalDespesasContratadas: 451172.03,
    totalDespesasPagas: 451172.03,
  },
  rankingDoadores: [
    { cpfCnpj: '12345678000190', nome: 'PLATAFORMA DE VAQUINHA LTDA', qntd: 3, valor: 1220288, stFinanciamentoColetivo: true },
    { cpfCnpj: '12345678901', nome: 'MARIA DE SOUZA ANDRADE', qntd: 1, valor: 4014.14, stFinanciamentoColetivo: false },
  ],
  rankingFornecedores: [
    { cpfCnpj: '98765432000110', nome: 'GRAFICA EXEMPLO LTDA', qntd: 2, valor: 30000, stFinanciamentoColetivo: false },
  ],
}

// Augusto Cury: recebeu fundão, e a composição usa três categorias.
const CURY = {
  dataUltimaAtualizacaoContas: null,
  numeroDeControleEntrega: null,
  dadosConsolidados: {
    totalRecebido: 202062,
    graphVrReceitaFinFefc: 50000,
    graphVrReceitaFinFundo: 0,
    totalDoacaoFcc: 0,
    totalReceitaPF: 2062,
    totalReceitaPJ: 0,
    totalProprios: 150000,
  },
  despesas: { valorLimiteDeGastos: 88944030.8, totalDespesasContratadas: 0, totalDespesasPagas: 0 },
  rankingDoadores: [],
  rankingFornecedores: [],
}

// Fixture sintético: as seis categorias nomeadas NÃO fecham o total. Sobram
// as cinco que o TSE expõe e o modelo não nomeia (comercialização, rendimento
// de aplicação, bens móveis, doação de outro candidato, internet). Sem este
// fixture, um `otherReceived` fixo em zero passaria despercebido.
const WITH_OTHER = {
  dadosConsolidados: {
    totalRecebido: 1000,
    graphVrReceitaFinFefc: 400,
    graphVrReceitaFinFundo: 0,
    totalDoacaoFcc: 0,
    totalReceitaPF: 100,
    totalReceitaPJ: 0,
    totalProprios: 0,
  },
  despesas: { valorLimiteDeGastos: 0, totalDespesasContratadas: 0, totalDespesasPagas: 0 },
  rankingDoadores: [],
  rankingFornecedores: [],
}

describe('parseBrazilianDate', () => {
  it('reads dd/MM/yyyy, which is what the TSE sends', () => {
    expect(parseBrazilianDate('28/08/2026')?.toISOString()).toBe('2026-08-28T00:00:00.000Z')
  })

  it('does not read 08/12 as August, the way new Date would', () => {
    // `new Date('08/12/2026')` devolve 12 de agosto no runtime en-US.
    expect(parseBrazilianDate('08/12/2026')?.toISOString()).toBe('2026-12-08T00:00:00.000Z')
  })

  it('returns null for anything that is not that format', () => {
    for (const value of [null, undefined, '', '2026-08-28', 'ontem', 42]) {
      expect(parseBrazilianDate(value)).toBeNull()
    }
  })
})

describe('parseDivulgaCandAccounts', () => {
  it('reads the totals and the spending limit', () => {
    const accounts = parseDivulgaCandAccounts(RENAN)!
    expect(accounts.totalReceived).toBe(1293445.81)
    expect(accounts.totalSpent).toBe(451172.03)
    expect(accounts.totalContracted).toBe(451172.03)
    expect(accounts.spendingLimit).toBe(88944030.8)
    expect(accounts.accountsUpdatedAt?.toISOString()).toBe('2026-08-28T00:00:00.000Z')
    expect(accounts.deliveryControlNumber).toBe('000140100000BR8258607')
  })

  it('splits the receipt into the six named buckets', () => {
    const accounts = parseDivulgaCandAccounts(RENAN)!
    expect(accounts.crowdfundingReceived).toBe(1220288)
    expect(accounts.individualsReceived).toBe(73157.81)
    expect(accounts.fefcReceived).toBe(0)
    expect(accounts.ownResourcesReceived).toBe(0)
  })

  it('keeps the composition closed through otherReceived', () => {
    // As onze categorias do TSE somam o total; as seis nomeadas nem sempre.
    for (const payload of [RENAN, CURY]) {
      const a = parseDivulgaCandAccounts(payload)!
      const named = a.fefcReceived! + a.partyFundReceived! + a.crowdfundingReceived! +
        a.individualsReceived! + a.companiesReceived! + a.ownResourcesReceived!
      expect(named + a.otherReceived!).toBeCloseTo(a.totalReceived!, 2)
    }
  })

  it('computes otherReceived as the actual remainder, not a fixed zero', () => {
    // RENAN e CURY têm as seis categorias nomeadas somando o total, então
    // `otherReceived` é 0 nos dois — não distingue a fórmula certa de um stub.
    // Este fixture tem sobra real: 1000 - 400 - 100 = 500.
    expect(parseDivulgaCandAccounts(WITH_OTHER)!.otherReceived).toBe(500)
  })

  it('reports the fundão, which is what separates one campaign from another', () => {
    expect(parseDivulgaCandAccounts(CURY)!.fefcReceived).toBe(50000)
    expect(parseDivulgaCandAccounts(RENAN)!.fefcReceived).toBe(0)
  })

  it('keeps the CNPJ of a company donor', () => {
    const donor = parseDivulgaCandAccounts(RENAN)!.donors[0]
    expect(donor.name).toBe('PLATAFORMA DE VAQUINHA LTDA')
    expect(donor.cnpj).toBe('12345678000190')
    expect(donor.amount).toBe(1220288)
    expect(donor.crowdfunding).toBe(true)
  })

  it('never lets an individual CPF through — anywhere in the result', () => {
    // Serializa tudo em vez de olhar o campo certo: é o que sobrevive a uma
    // refatoração que mova o dado de lugar.
    const accounts = parseDivulgaCandAccounts(RENAN)!
    expect(JSON.stringify(accounts)).not.toContain('12345678901')
    const individual = accounts.donors.find((d) => d.name === 'MARIA DE SOUZA ANDRADE')!
    expect(individual.cnpj).toBeNull()
    expect(individual.amount).toBe(4014.14)
  })

  it('treats a candidacy with no accounts as absent, not as zero', () => {
    // É o caso do vice: responde 200, mas com `totalRecebido` nulo.
    expect(parseDivulgaCandAccounts({ dadosConsolidados: { totalRecebido: null } })).toBeNull()
    expect(parseDivulgaCandAccounts({})).toBeNull()
    expect(parseDivulgaCandAccounts(null)).toBeNull()
  })
})
