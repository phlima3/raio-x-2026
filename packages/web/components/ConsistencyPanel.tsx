'use client'

import { useCallback, useEffect, useState } from 'react'

interface Contradiction {
  proposal: string
  vote: string
  description: string
}

interface ConsistencyScore {
  theme: string
  score: number
  label: string
  explanation: string
  contradictions: Contradiction[]
  proposalCount: number
  voteCount: number
  computedAt: string
}

interface ConsistencyPanelProps {
  candidateSlug: string
}

function labelTone(label: string): string {
  switch (label) {
    case 'Alto':
      return 'text-emerald-800 border-emerald-800/40'
    case 'Médio':
      return 'text-amber-800 border-amber-800/40'
    case 'Baixo':
      return 'text-ember border-ember/50'
    default:
      return 'text-ink-muted border-ink/30'
  }
}

function barTone(label: string): string {
  switch (label) {
    case 'Alto':
      return 'bg-emerald-700'
    case 'Médio':
      return 'bg-amber-600'
    case 'Baixo':
      return 'bg-ember'
    default:
      return 'bg-ink/30'
  }
}

function pluralProposals(n: number): string {
  return `${n} proposta${n === 1 ? '' : 's'}`
}

function pluralVotes(n: number): string {
  return `${n} votação${n === 1 ? '' : 'es'}`
}

export function ConsistencyPanel({ candidateSlug }: ConsistencyPanelProps) {
  const [scores, setScores] = useState<ConsistencyScore[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

    try {
      const res = await fetch(
        `${API_BASE}/api/candidates/${candidateSlug}/consistency`
      )
      const json = await res.json()
      if (json.success) setScores(json.data)
      else setError(json.error ?? 'Erro ao carregar scores')
    } catch {
      setError('Falha de conexão com a API')
    } finally {
      setLoading(false)
    }
  }, [candidateSlug])

  useEffect(() => {
    load()
  }, [load])

  if (!loading && !error && scores !== null && scores.length === 0) {
    return (
      <div className="border border-dashed border-ink/30 py-14 px-6 text-center">
        <p className="font-serif italic text-xl text-ink-muted text-pretty max-w-md mx-auto">
          Ainda não há dados de consistência para este candidato.
        </p>
        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
          Necessário: propostas catalogadas + histórico de votações
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-4 mb-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-ink-muted max-w-md">
          Score 0–100. Maior valor indica maior consistência entre propostas declaradas e votos no Congresso.
        </p>
        {!loading && scores !== null && (
          <button
            type="button"
            onClick={load}
            className="focus-editorial font-mono text-[11px] uppercase tracking-[0.22em] text-ember hover:underline underline-offset-4 whitespace-nowrap"
          >
            § Recalcular
          </button>
        )}
      </div>

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="border border-ink/15 p-5 animate-pulse"
              aria-hidden
            >
              <div className="h-4 w-40 bg-ink/10 mb-4" />
              <div className="h-[3px] w-full bg-ink/10" />
            </div>
          ))}
          <p className="pt-3 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft text-center">
            Analisando com IA — pode levar alguns segundos
          </p>
        </div>
      )}

      {error && (
        <div className="border border-ember/40 py-6 px-4 text-center">
          <p className="font-serif italic text-ember">{error}</p>
          <button
            type="button"
            onClick={load}
            className="focus-editorial mt-2 font-mono text-[11px] uppercase tracking-[0.22em] text-ember hover:underline underline-offset-4"
          >
            § Tentar novamente
          </button>
        </div>
      )}

      {!loading && !error && scores && scores.length > 0 && (
        <ol className="border-t border-ink/25">
          {scores.map((s, i) => {
            const toneLabel = labelTone(s.label)
            const toneBar = barTone(s.label)
            const isExpanded = expanded === s.theme

            return (
              <li key={s.theme} className="border-b border-ink/20">
                <button
                  type="button"
                  onClick={() => setExpanded(isExpanded ? null : s.theme)}
                  aria-expanded={isExpanded}
                  aria-controls={`cs-${s.theme}`}
                  className="focus-editorial group w-full text-left py-6 md:py-7 transition-colors hover:bg-paper-light/60"
                >
                  <div className="flex items-baseline gap-5">
                    <span className="font-mono text-[11px] tabular-nums text-ink-soft tracking-[0.1em] w-8 shrink-0">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="font-serif text-xl md:text-2xl leading-tight flex-1 min-w-0 tracking-[-0.01em]">
                      {s.theme}
                    </span>
                    <span
                      className={
                        'font-mono text-[10px] uppercase tracking-[0.22em] px-2 py-1 border whitespace-nowrap ' +
                        toneLabel
                      }
                    >
                      {s.label}
                    </span>
                    <span className="font-serif text-3xl md:text-4xl tabular-nums leading-none tracking-[-0.02em] w-14 text-right">
                      {s.score}
                    </span>
                    <span
                      aria-hidden
                      className={
                        'font-mono text-xs transition-transform text-ink-soft ' +
                        (isExpanded ? 'rotate-180' : '')
                      }
                    >
                      ▾
                    </span>
                  </div>

                  <div className="mt-4 ml-[52px] h-[3px] bg-ink/10 overflow-hidden">
                    <div
                      className={'h-full transition-all duration-700 ' + toneBar}
                      style={{ width: `${s.score}%` }}
                    />
                  </div>

                  <p className="mt-2 ml-[52px] font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
                    {pluralProposals(s.proposalCount)} ·{' '}
                    {pluralVotes(s.voteCount)} analisada
                    {s.voteCount === 1 ? '' : 's'}
                  </p>
                </button>

                {isExpanded && (
                  <div
                    id={`cs-${s.theme}`}
                    className="ml-[52px] pb-7 pr-4 pt-1"
                  >
                    <p className="font-serif text-[17px] leading-[1.7] text-ink-muted max-w-3xl text-pretty">
                      {s.explanation}
                    </p>

                    {s.contradictions.length > 0 && (
                      <div className="mt-6 max-w-3xl border-t border-b border-ember/40 py-5 bg-ember/[0.03]">
                        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-ember mb-4">
                          <span className="inline-block w-6 h-px bg-ember align-middle mr-2" />
                          Possíveis contradições
                        </p>
                        <ul className="space-y-5">
                          {s.contradictions.map((c, idx) => (
                            <li key={idx}>
                              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-muted mb-1">
                                Proposta
                              </p>
                              <p className="font-serif text-base text-ink-muted italic">
                                {c.proposal}
                              </p>
                              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-muted mt-3 mb-1">
                                Votação
                              </p>
                              <p className="font-serif text-base text-ink-muted italic">
                                {c.vote}
                              </p>
                              <p className="mt-2 text-[14px] text-ink-muted leading-relaxed">
                                {c.description}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <p className="mt-5 font-mono text-[9px] uppercase tracking-[0.22em] text-ink-soft tabular-nums">
                      Atualizado em{' '}
                      {new Date(s.computedAt).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
