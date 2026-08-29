/**
 * Leitura da consulta de prestador do DivulgaCandContas — a prestação de
 * contas de uma candidatura.
 *
 * Duas regras moram aqui, e as duas são de correção, não de estilo:
 *
 * 1. O CPF de pessoa física é descartado. O TSE publica o número inteiro e a
 *    doação é pública por lei, mas republicar documento de identificação em
 *    página indexada é exposição a mais sem informação a mais. Só CNPJ passa.
 * 2. A composição fecha. O TSE expõe onze categorias de receita e a tela nomeia
 *    seis; a diferença vai para `otherReceived`, senão a proporção exibida
 *    mentiria para quem usou comercialização ou rendimento de aplicação.
 */

/** Doador ou fornecedor do ranking. `cnpj` é nulo para pessoa física. */
export interface DivulgaCandParty {
  name: string
  amount: number
  count: number
  cnpj: string | null
  crowdfunding: boolean
}

export interface DivulgaCandAccounts {
  totalReceived: number | null
  totalSpent: number | null
  totalContracted: number | null
  spendingLimit: number | null
  fefcReceived: number | null
  partyFundReceived: number | null
  crowdfundingReceived: number | null
  individualsReceived: number | null
  companiesReceived: number | null
  ownResourcesReceived: number | null
  otherReceived: number | null
  accountsUpdatedAt: Date | null
  deliveryControlNumber: string | null
  donors: DivulgaCandParty[]
  suppliers: DivulgaCandParty[]
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function numberField(source: Record<string, unknown> | null, key: string): number | null {
  const value = source?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function textField(source: Record<string, unknown> | null, key: string): string | null {
  const value = source?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** Centavo é o que interessa; sem isto a subtração deixa lixo de ponto flutuante. */
function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * O TSE envia `dd/MM/yyyy`. `new Date('08/12/2026')` devolveria 12 de agosto
 * num runtime en-US, e `new Date('28/08/2026')` devolveria data inválida.
 */
export function parseBrazilianDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim())
  if (!match) return null
  const [, day, month, year] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  return Number.isNaN(date.getTime()) ? null : date
}

function parseParties(value: unknown): DivulgaCandParty[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    const record = asRecord(entry)
    const name = textField(record, 'nome')
    const amount = numberField(record, 'valor')
    if (!name || amount === null) return []
    const document = textField(record, 'cpfCnpj')
    return [{
      name,
      amount,
      count: numberField(record, 'qntd') ?? 0,
      // 14 dígitos é CNPJ e fica; 11 é CPF e é descartado aqui, antes de
      // qualquer gravação.
      cnpj: document && /^\d{14}$/.test(document) ? document : null,
      crowdfunding: record?.stFinanciamentoColetivo === true,
    }]
  })
}

export function parseDivulgaCandAccounts(raw: unknown): DivulgaCandAccounts | null {
  const payload = asRecord(raw)
  const consolidated = asRecord(payload?.dadosConsolidados)
  const totalReceived = numberField(consolidated, 'totalRecebido')
  // Sem total não há prestação: é o que a consulta do vice devolve, e gravar
  // zero ali faria a tela dizer que a chapa não arrecadou.
  if (totalReceived === null) return null

  const expenses = asRecord(payload?.despesas)
  const fefcReceived = numberField(consolidated, 'graphVrReceitaFinFefc') ?? 0
  const partyFundReceived = numberField(consolidated, 'graphVrReceitaFinFundo') ?? 0
  const crowdfundingReceived = numberField(consolidated, 'totalDoacaoFcc') ?? 0
  const individualsReceived = numberField(consolidated, 'totalReceitaPF') ?? 0
  const companiesReceived = numberField(consolidated, 'totalReceitaPJ') ?? 0
  const ownResourcesReceived = numberField(consolidated, 'totalProprios') ?? 0
  const named = fefcReceived + partyFundReceived + crowdfundingReceived +
    individualsReceived + companiesReceived + ownResourcesReceived

  return {
    totalReceived,
    totalSpent: numberField(expenses, 'totalDespesasPagas'),
    totalContracted: numberField(expenses, 'totalDespesasContratadas'),
    spendingLimit: numberField(expenses, 'valorLimiteDeGastos'),
    fefcReceived,
    partyFundReceived,
    crowdfundingReceived,
    individualsReceived,
    companiesReceived,
    ownResourcesReceived,
    otherReceived: round2(totalReceived - named),
    accountsUpdatedAt: parseBrazilianDate(payload?.dataUltimaAtualizacaoContas),
    deliveryControlNumber: textField(payload, 'numeroDeControleEntrega'),
    donors: parseParties(payload?.rankingDoadores),
    suppliers: parseParties(payload?.rankingFornecedores),
  }
}
