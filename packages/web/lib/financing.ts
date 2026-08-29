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

function amount(value: Money): number {
  const parsed = typeof value === 'string' ? Number(value) : value ?? 0
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : 0
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
