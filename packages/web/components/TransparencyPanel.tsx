'use client'

import { useEffect, useState } from 'react'
import type {
  VotingRecord,
  AssetDeclaration,
  CampaignFinancing,
} from '@/lib/types'
import { financingComposition, filterValidParties, fmtBRL } from '@/lib/financing'
import { formatAccountsDate } from '@/lib/dates'

type ActiveTab = 'voting' | 'assets' | 'financing'

const VOTE_TONE: Record<string, string> = {
  YES: 'text-emerald-800 border-emerald-800/40',
  NO: 'text-ember border-ember/50',
  ABSTENTION: 'text-amber-800 border-amber-800/40',
  ABSENT: 'text-ink-soft border-ink/30',
  OBSTRUCTION: 'text-amber-800 border-amber-800/40',
}

const VOTE_LABEL: Record<string, string> = {
  YES: 'Sim',
  NO: 'Não',
  ABSTENTION: 'Abstenção',
  ABSENT: 'Ausente',
  OBSTRUCTION: 'Obstrução',
}

export interface TransparencyData {
  voting: VotingRecord[]
  assets: AssetDeclaration[]
  financing: CampaignFinancing | null
}

interface TransparencyPanelProps {
  candidateSlug: string
  initialData?: TransparencyData
}

export function TransparencyPanel({ candidateSlug, initialData }: TransparencyPanelProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('voting')
  const [data, setData] = useState<TransparencyData | null>(initialData ?? null)
  const [loading, setLoading] = useState(initialData === undefined)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initialData !== undefined) return
    const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

    fetch(`${API_BASE}/api/candidates/${candidateSlug}/transparency`, {
      next: { revalidate: 3600 },
    } as RequestInit)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setData(json.data)
        else setError(json.error ?? 'Erro ao carregar dados')
      })
      .catch(() => setError('Falha de conexão'))
      .finally(() => setLoading(false))
  }, [candidateSlug, initialData])

  const tabs: { key: ActiveTab; label: string }[] = [
    { key: 'voting', label: 'Votações' },
    { key: 'assets', label: 'Patrimônio' },
    { key: 'financing', label: 'Financiamento' },
  ]

  const compositionSlices = data?.financing ? financingComposition(data.financing) : []

  return (
    <div>
      {/* Tab bar — editorial */}
      <div
        role="tablist"
        aria-label="Seções de transparência"
        className="flex items-center flex-wrap gap-x-6 gap-y-1 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted border-y border-ink/20 py-2 mb-10"
      >
        <span className="text-ink-muted">Dados</span>
        {tabs.map(({ key, label }) => {
          const active = activeTab === key
          return (
            <button
              key={key}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => setActiveTab(key)}
              className={
                'focus-editorial transition-colors border-b py-1.5 ' +
                (active
                  ? 'text-ember border-ember'
                  : 'border-transparent hover:text-ember hover:border-ember')
              }
            >
              {label}
            </button>
          )
        })}
      </div>

      {loading && (
        <div className="py-10 text-center font-mono text-[11px] uppercase tracking-[0.22em] text-ink-soft">
          Carregando…
        </div>
      )}
      {error && (
        <div className="border border-ember/40 py-6 px-4 text-center">
          <p className="font-serif italic text-ember">{error}</p>
        </div>
      )}

      {!loading && !error && data && (
        <div role="tabpanel" aria-label={`Dados: ${activeTab}`}>
          {/* Votações */}
          {activeTab === 'voting' && (
            <>
              {data.voting.length === 0 ? (
                <EmptyState
                  primary="Histórico de votações não disponível para este candidato."
                  secondary="Sincronização diária com a Câmara dos Deputados e o Senado Federal."
                />
              ) : (
                <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
                  <table className="w-full min-w-[520px] border-t border-ink/25">
                    <thead>
                      <tr className="border-b border-ink/25">
                        <th className="py-3 pr-4 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-muted text-left w-24">
                          Voto
                        </th>
                        <th className="py-3 pr-4 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-muted text-left">
                          Proposição
                        </th>
                        <th className="py-3 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-muted text-right w-24">
                          Data
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.voting.slice(0, 100).map((v, i) => {
                        const tone = VOTE_TONE[v.voteType] ?? VOTE_TONE.ABSENT
                        const label =
                          VOTE_LABEL[v.voteType] ?? VOTE_LABEL.ABSENT
                        return (
                          <tr
                            key={v.id}
                            className="border-b border-ink/15 hover:bg-paper-light/60 transition-colors"
                          >
                            <td className="py-3 pr-4 align-top">
                              <span
                                className={
                                  'font-mono text-[10px] uppercase tracking-[0.22em] px-2 py-1 border whitespace-nowrap ' +
                                  tone
                                }
                              >
                                {label}
                              </span>
                            </td>
                            <td className="py-3 pr-4 align-top">
                              {v.proposalUrl ? (
                                <a
                                  href={v.proposalUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="focus-editorial font-serif text-[17px] leading-snug hover:text-ember transition-colors border-b border-transparent hover:border-ember"
                                >
                                  {v.proposalName}
                                </a>
                              ) : (
                                <span className="font-serif text-[17px] leading-snug">
                                  {v.proposalName}
                                </span>
                              )}
                              {i === 99 && data.voting.length > 100 && null}
                            </td>
                            <td className="py-3 font-mono text-[10px] tabular-nums text-ink-soft text-right whitespace-nowrap align-top">
                              {new Date(v.votedAt).toLocaleDateString('pt-BR')}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {data.voting.length > 100 && (
                    <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft tabular-nums">
                      Exibindo 100 de {data.voting.length.toLocaleString('pt-BR')} votações
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {/* Patrimônio */}
          {activeTab === 'assets' && (
            <>
              {data.assets.length === 0 ? (
                <EmptyState
                  primary="Declaração de bens disponível após agosto de 2026."
                  secondary="Dados do TSE ficam públicos após o prazo de registro de candidaturas."
                />
              ) : (
                <ol className="border-t border-ink/25">
                  {data.assets.map((a) => (
                    <li
                      key={a.id}
                      className="border-b border-ink/20 py-6 flex items-baseline justify-between gap-6"
                    >
                      <div>
                        <p className="font-serif text-3xl md:text-4xl tabular-nums leading-none tracking-[-0.02em]">
                          {a.year}
                        </p>
                        {/* `!== null` deixava passar `undefined` e imprimia "R$ NaN". */}
                        {typeof a.variation === 'number' && (
                          <p
                            className={
                              'mt-2 font-mono text-[10px] uppercase tracking-[0.22em] ' +
                              (a.variation >= 0
                                ? 'text-emerald-800'
                                : 'text-ember')
                            }
                          >
                            {a.variation >= 0 ? '▲ ' : '▼ '}
                            {fmtBRL(Math.abs(a.variation))} vs ano anterior
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="font-serif text-2xl md:text-3xl tabular-nums leading-none">
                          {fmtBRL(a.totalValue)}
                        </p>
                        {a.sourceUrl && (
                          <a
                            href={a.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="focus-editorial mt-2 inline-block font-mono text-[10px] uppercase tracking-[0.22em] text-ember hover:underline underline-offset-4"
                          >
                            TSE ↗
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}

          {/* Financiamento */}
          {activeTab === 'financing' && (
            <>
              {!data.financing ? (
                <EmptyState
                  primary="Dados de financiamento disponíveis após agosto de 2026."
                  secondary="Dados do TSE ficam públicos após o prazo de registro de candidaturas."
                />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-ink/20 border-y-2 border-ink">
                  <div className="p-6 md:p-8">
                    <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-muted mb-3">
                      Total arrecadado
                    </p>
                    <p className="font-serif text-4xl md:text-5xl tabular-nums leading-none tracking-[-0.02em]">
                      {fmtBRL(data.financing.totalReceived)}
                    </p>
                  </div>
                  <div className="p-6 md:p-8">
                    <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ember mb-3">
                      Total gasto
                    </p>
                    <p className="font-serif text-4xl md:text-5xl tabular-nums leading-none tracking-[-0.02em] text-ember">
                      {fmtBRL(data.financing.totalSpent)}
                    </p>
                    <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-muted">
                      Pago
                    </p>
                    {/* `totalContracted` (comprometido) pode superar o pago — caso do
                        candidato que já empenhou despesa mas ainda não quitou. Omitir
                        essa linha faria a ficha mentir por omissão. */}
                    {data.financing.totalContracted != null &&
                      Number(data.financing.totalContracted) > Number(data.financing.totalSpent) && (
                        <p className="mt-4 font-mono text-xs tabular-nums text-ink-muted">
                          <span className="uppercase tracking-[0.22em] text-[10px]">
                            Contratado
                          </span>{' '}
                          {fmtBRL(data.financing.totalContracted)}
                        </p>
                      )}
                  </div>

                  {compositionSlices.length > 0 && (
                    <div className="col-span-full p-6 md:p-8 border-t border-ink/20">
                      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-muted mb-4">
                        De onde veio
                      </p>
                      <ul className="space-y-2">
                        {compositionSlices.map((slice) => (
                          <li key={slice.label} className="flex items-baseline justify-between gap-4">
                            <span className="text-sm">{slice.label}</span>
                            <span className="font-mono text-xs tabular-nums text-ink-muted">
                              {fmtBRL(slice.value)} · {slice.share.toFixed(1)}%
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {data.financing.spendingLimit && (
                    <div className="col-span-full p-6 md:p-8 border-t border-ink/20">
                      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-muted mb-3">
                        Limite legal de gastos
                      </p>
                      <p className="font-serif text-2xl tabular-nums">
                        {fmtBRL(data.financing.spendingLimit)}
                      </p>
                    </div>
                  )}

                  <PartyList title="Maiores doadores" people={data.financing.donors} />
                  <PartyList title="Maiores fornecedores" people={data.financing.suppliers} />

                  {data.financing.accountsUpdatedAt && (
                    <p className="col-span-full px-6 md:px-8 py-3 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-muted border-t border-ink/20">
                      Prestação atualizada em{' '}
                      {formatAccountsDate(data.financing.accountsUpdatedAt)}
                    </p>
                  )}

                  {data.financing.sourceUrl && (
                    <a
                      href={data.financing.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="focus-editorial col-span-full px-6 md:px-8 py-3 font-mono text-[10px] uppercase tracking-[0.22em] text-ember hover:underline underline-offset-4 border-t border-ink/20"
                    >
                      Ver no TSE ↗
                    </a>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Doadores e fornecedores compartilham o mesmo formato. O CNPJ aparece quando
 * existe; pessoa física entra só com nome e valor, porque o CPF não é gravado.
 */
function PartyList({ title, people }: { title: string; people: unknown }) {
  const parties = filterValidParties(people)
  if (parties.length === 0) return null
  return (
    <div className="col-span-full p-6 md:p-8 border-t border-ink/20">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-muted mb-4">
        {title}
      </p>
      <ul className="space-y-2">
        {parties.map((party) => (
          <li
            key={`${party.name}-${party.amount}`}
            className="flex items-baseline justify-between gap-4"
          >
            <span className="text-sm">
              {party.name}
              {party.cnpj && (
                <span className="font-mono text-[10px] text-ink-muted ml-2">
                  CNPJ {party.cnpj}
                </span>
              )}
            </span>
            <span className="font-mono text-xs tabular-nums text-ink-muted">
              {fmtBRL(party.amount)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function EmptyState({
  primary,
  secondary,
}: {
  primary: string
  secondary: string
}) {
  return (
    <div className="border border-dashed border-ink/30 py-14 px-6 text-center">
      <p className="font-serif italic text-xl text-ink-muted text-pretty max-w-lg mx-auto">
        {primary}
      </p>
      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
        {secondary}
      </p>
    </div>
  )
}
