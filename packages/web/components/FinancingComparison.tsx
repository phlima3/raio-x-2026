import {
  fefcStanding,
  financingComposition,
  fmtBRL,
  type FefcStanding,
  type FinancingSlice,
} from '@/lib/financing'
import { formatAccountsDate } from '@/lib/dates'
import type { ComparisonFinancing } from '@/lib/types'

interface FinancingComparisonProps {
  financingA: ComparisonFinancing | null
  financingB: ComparisonFinancing | null
  nameA: string
  nameB: string
}

function fmtShare(share: number): string {
  // Abaixo de 10% uma casa decimal separa 0,7% de 0%; acima disso ela só
  // acrescenta ruído a um número que já é grande.
  return `${share.toLocaleString('pt-BR', { maximumFractionDigits: share < 10 ? 1 : 0 })}%`
}

/**
 * Compara o uso de fundo eleitoral (FEFC) entre dois candidatos do mesmo cargo.
 *
 * O bloco existe para não achatar três situações diferentes num número só: quem
 * não entregou prestação, quem entregou sem detalhar a origem da receita, e quem
 * declarou não ter recebido nada de dinheiro público. Ver `fefcStanding`.
 */
export function FinancingComparison({
  financingA,
  financingB,
  nameA,
  nameB,
}: FinancingComparisonProps) {
  const standingA = fefcStanding(financingA)
  const standingB = fefcStanding(financingB)

  // ponytail: nenhum dos dois entregou contas — não há lado que tenha o dado, e
  // repetir "não entregue" em duas colunas não informa nada. Se a ausência dos
  // dois virar pauta, este é o ponto de mudança.
  if (standingA.kind === 'none' && standingB.kind === 'none') return null

  const compositionA = financingA ? financingComposition(financingA) : []
  const compositionB = financingB ? financingComposition(financingB) : []
  const yearsDiffer =
    financingA != null && financingB != null && financingA.year !== financingB.year

  return (
    <section
      aria-label="Comparação de financiamento de campanha"
      className="border-y-2 border-ink mb-8"
    >
      <header className="px-4 sm:px-6 py-3 border-b border-ink/20">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.22em] text-ember">
          Fundo eleitoral · dinheiro público
        </h2>
        <p className="mt-1 font-serif italic text-[15px] text-ink-muted leading-relaxed text-pretty">
          Quanto da campanha de cada um veio do Fundo Especial de Financiamento de
          Campanha, bancado pelo orçamento da União.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-ink/20">
        <FefcColumn name={nameA} standing={standingA} />
        <FefcColumn name={nameB} standing={standingB} />
      </div>

      {(compositionA.length > 0 || compositionB.length > 0) && (
        <div className="border-t border-ink/20">
          <p className="px-4 sm:px-6 pt-4 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-muted">
            De onde veio o resto
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-ink/20">
            <CompositionColumn slices={compositionA} delivered={financingA != null} />
            <CompositionColumn slices={compositionB} delivered={financingB != null} />
          </div>
        </div>
      )}

      <div className="border-t border-ink/20">
        <p className="px-4 sm:px-6 pt-4 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-muted">
          Totais
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-ink/20">
          <TotalsColumn financing={financingA} />
          <TotalsColumn financing={financingB} />
        </div>
      </div>

      {yearsDiffer && (
        <p className="px-4 sm:px-6 py-3 border-t border-ink/20 font-serif italic text-sm text-ink-muted text-pretty">
          As prestações são de eleições diferentes — {financingA!.year} de um lado,{' '}
          {financingB!.year} do outro. Os valores não são diretamente comparáveis.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-ink/20 border-t border-ink/20">
        <SourceCell financing={financingA} />
        <SourceCell financing={financingB} />
      </div>
    </section>
  )
}

function FefcColumn({ name, standing }: { name: string; standing: FefcStanding }) {
  return (
    <div className="p-4 sm:p-6">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft mb-3 truncate">
        {name}
      </p>

      {standing.kind === 'known' ? (
        <>
          {standing.share != null ? (
            <>
              <p
                className={
                  'font-serif text-5xl sm:text-6xl tabular-nums leading-none tracking-[-0.03em] ' +
                  (standing.value > 0 ? 'text-ember' : 'text-ink')
                }
              >
                {fmtShare(standing.share)}
              </p>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-muted">
                da arrecadação
              </p>
              <p className="mt-4 font-mono text-sm tabular-nums text-ink">
                {fmtBRL(standing.value)}
              </p>
              <p className="font-mono text-xs tabular-nums text-ink-soft">
                de {fmtBRL(standing.total)} arrecadados
              </p>
            </>
          ) : (
            <>
              {/* Prestação entregue zerada: o valor do fundão é dado, a
                  proporção não existe. */}
              <p className="font-serif text-4xl tabular-nums leading-none text-ink">
                {fmtBRL(standing.value)}
              </p>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-muted">
                de fundo eleitoral
              </p>
              <p className="mt-4 font-serif italic text-sm text-ink-muted">
                Nenhuma arrecadação declarada.
              </p>
            </>
          )}
        </>
      ) : (
        <>
          <p className="font-serif text-5xl sm:text-6xl leading-none text-ink-soft">—</p>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-muted">
            {standing.kind === 'none'
              ? 'Prestação não entregue'
              : 'Composição não informada'}
          </p>
          <p className="mt-4 font-serif italic text-sm text-ink-muted leading-relaxed text-pretty">
            {standing.kind === 'none'
              ? 'O TSE não recebeu as contas deste candidato. Não é o mesmo que declarar zero.'
              : 'A prestação foi entregue, mas sem detalhar a origem da receita. Não é o mesmo que declarar zero.'}
          </p>
        </>
      )}
    </div>
  )
}

function CompositionColumn({
  slices,
  delivered,
}: {
  slices: FinancingSlice[]
  delivered: boolean
}) {
  return (
    <div className="p-4 sm:p-6">
      {slices.length === 0 ? (
        <p className="font-serif italic text-sm text-ink-soft">
          {delivered ? 'Origem da receita não informada.' : 'Sem prestação entregue.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {slices.map((slice) => (
            <li key={slice.label} className="flex items-baseline justify-between gap-3">
              <span className="text-sm">{slice.label}</span>
              <span className="font-mono text-xs tabular-nums text-ink-muted whitespace-nowrap">
                {fmtBRL(slice.value)} · {slice.share.toFixed(1)}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function TotalsColumn({ financing }: { financing: ComparisonFinancing | null }) {
  if (!financing) {
    return (
      <div className="p-4 sm:p-6">
        <p className="font-serif italic text-sm text-ink-soft">Sem prestação entregue.</p>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-muted">
          Arrecadado
        </span>
        <span className="font-mono text-sm tabular-nums">
          {fmtBRL(financing.totalReceived)}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-muted">
          Gasto
        </span>
        <span className="font-mono text-sm tabular-nums text-ember">
          {fmtBRL(financing.totalSpent)}
        </span>
      </div>
    </div>
  )
}

function SourceCell({ financing }: { financing: ComparisonFinancing | null }) {
  if (!financing) return <div className="p-4 sm:p-6" />

  return (
    <div className="p-4 sm:p-6">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
        Prestação de {financing.year}
        {financing.accountsUpdatedAt
          ? ` · atualizada em ${formatAccountsDate(financing.accountsUpdatedAt)}`
          : ''}
      </p>
      {financing.sourceUrl && (
        <a
          href={financing.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="focus-editorial mt-2 inline-block font-mono text-[10px] uppercase tracking-[0.22em] text-ember hover:underline underline-offset-4"
        >
          Ver no TSE ↗
        </a>
      )}
    </div>
  )
}
