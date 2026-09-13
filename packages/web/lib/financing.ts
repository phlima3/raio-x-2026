/**
 * Composição da receita de campanha, para exibição.
 *
 * As parcelas somam o total porque `otherReceived` absorve as categorias que a
 * tela não nomeia — o TSE expõe onze e aqui se nomeiam seis. Sem essa sobra a
 * proporção exibida não fecharia para quem usou comercialização ou rendimento
 * de aplicação, e a soma das fatias passaria de 100%.
 */

const COMPOSITION_LABELS = [
  ['ownResourcesReceived', 'Recursos próprios'],
  ['fefcReceived', 'Fundo eleitoral (FEFC)'],
  ['partyFundReceived', 'Fundo partidário'],
  ['crowdfundingReceived', 'Financiamento coletivo'],
  ['individualsReceived', 'Pessoas físicas'],
  ['companiesReceived', 'Pessoas jurídicas'],
  ['otherReceived', 'Outras origens'],
] as const

type CompositionKey = (typeof COMPOSITION_LABELS)[number][0]

/** `Decimal` do Prisma chega como string depois de serializado pela API. */
type Money = number | string | null | undefined

export type FinancingComposable = { totalReceived: Money } & Partial<
  Record<CompositionKey, Money>
>

export interface FinancingSlice {
  label: string
  value: number
  share: number
}

/**
 * Devolve `null` para ausência e para lixo não numérico, preservando a
 * diferença entre "não informado" e "zero" que o banco guarda em colunas
 * anuláveis. Quem só precisa somar usa `amount`, que colapsa os dois em 0.
 */
function parseMoney(value: Money): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'string' ? Number(value) : value
  return Number.isFinite(parsed) ? parsed : null
}

function amount(value: Money): number {
  return parseMoney(value) ?? 0
}

export function financingComposition(financing: FinancingComposable): FinancingSlice[] {
  const total = amount(financing.totalReceived)
  if (total <= 0) return []
  return COMPOSITION_LABELS
    .map(([key, label]) => {
      const value = amount(financing[key])
      return { label, value, share: (value / total) * 100 }
    })
    .filter((slice) => slice.value > 0)
    .sort((a, b) => b.value - a.value)
}

export interface PartyEntry {
  name: string
  amount: number
  cnpj: string | null
}

/**
 * `donors`/`suppliers` também podem ter sido gravados pelo importador
 * histórico de financiamento (`import:financiamento`, cobrindo 2018/2022),
 * cujo formato é `{ name, value }` — sem `amount`. Exibir uma linha dessas
 * rende "R$ NaN" ao lado de um doador real; descartar em vez de mostrar.
 */
export function filterValidParties(people: unknown): PartyEntry[] {
  if (!Array.isArray(people)) return []
  return people.filter(
    (party): party is PartyEntry =>
      typeof party === 'object' &&
      party !== null &&
      Number.isFinite((party as { amount?: unknown }).amount),
  )
}

/**
 * Situação do candidato quanto ao fundo eleitoral (FEFC) — dinheiro público.
 *
 * São três estados, e nenhum pode ser renderizado como outro:
 *
 * - `none`    sem prestação de contas entregue ao TSE. Não há número nenhum.
 * - `unknown` prestação entregue, mas a origem da receita não foi consultada
 *             (`fefcReceived` nulo). Exibir 0% aqui inventaria dado.
 * - `known`   valor declarado, inclusive quando é zero — que é informação, e
 *             não ausência dela.
 *
 * `share` é nulo quando a arrecadação declarada é zero: o valor existe, a
 * proporção não, e "NaN%" não é resposta.
 */
export type FefcStanding =
  | { kind: 'none' }
  | { kind: 'unknown' }
  | { kind: 'known'; value: number; share: number | null; total: number }

export function fefcStanding(
  financing: FinancingComposable | null | undefined,
): FefcStanding {
  if (!financing) return { kind: 'none' }

  const value = parseMoney(financing.fefcReceived)
  if (value === null) return { kind: 'unknown' }

  const total = amount(financing.totalReceived)
  return { kind: 'known', value, total, share: total > 0 ? (value / total) * 100 : null }
}

/** Formatação monetária única do site — o painel da ficha usa a mesma. */
export function fmtBRL(value: string | number): string {
  return Number(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  })
}

/**
 * "R$ 42 milhões", "R$ 2,8 milhões", "R$ 608 mil": o valor como em manchete.
 * `figure` encurta para "R$ 42 mi", para caber como cifra grande na ficha.
 */
export function fmtBRLShort(value: number, style: 'prose' | 'figure' = 'prose'): string {
  const short = (n: number) =>
    n.toLocaleString('pt-BR', { maximumFractionDigits: n < 100 ? 1 : 0 })
  if (value >= 1e6) {
    const n = short(value / 1e6)
    const unit = style === 'figure' ? 'mi' : n === '1' ? 'milhão' : 'milhões'
    return `R$ ${n} ${unit}`
  }
  if (value >= 1e3) return `R$ ${short(value / 1e3)} mil`
  return fmtBRL(value)
}

/**
 * A cifra do fundo eleitoral para a ficha: valor grande, rótulo e uma linha de
 * contexto. Cada estado de `fefcStanding` rende um trio diferente: "sem contas"
 * não é "zero", e "origem não consultada" não é nenhum dos dois.
 */
export function fundoEleitoralFigure(
  financing: FinancingComposable | null | undefined,
): { value: string | null; label: string; note: string | null } {
  const standing = fefcStanding(financing)
  if (standing.kind === 'none') {
    return { value: null, label: 'Sem prestação de contas no TSE', note: null }
  }
  if (standing.kind === 'unknown') {
    return {
      value: fmtBRLShort(amount(financing!.totalReceived), 'figure'),
      label: 'arrecadados',
      note: 'origem do dinheiro não consultada',
    }
  }
  if (standing.total <= 0) return { value: 'R$ 0', label: 'sem receita declarada', note: null }
  if (standing.value <= 0) {
    return {
      value: 'R$ 0',
      label: 'do fundo eleitoral',
      note: `${fmtBRLShort(standing.total)} de outras fontes`,
    }
  }
  // Arredondar para baixo: 99,5% virando "100%" diria que não houve outra fonte.
  return {
    value: fmtBRLShort(standing.value, 'figure'),
    label: 'do fundo eleitoral',
    note: `${Math.floor(standing.share ?? 0)}% da receita`,
  }
}
