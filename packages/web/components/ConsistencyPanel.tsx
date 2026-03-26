'use client'

import { useState, useEffect } from 'react'

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

const LABEL_CONFIG: Record<string, { className: string; bar: string }> = {
  Alto:      { className: 'text-green-700 bg-green-50',  bar: 'bg-green-500' },
  Médio:     { className: 'text-yellow-700 bg-yellow-50', bar: 'bg-yellow-400' },
  Baixo:     { className: 'text-red-700 bg-red-50',      bar: 'bg-red-500' },
  'Sem dados': { className: 'text-gray-500 bg-gray-100', bar: 'bg-gray-300' },
}

export function ConsistencyPanel({ candidateSlug }: ConsistencyPanelProps) {
  const [scores, setScores] = useState<ConsistencyScore[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

    try {
      const res = await fetch(`${API_BASE}/api/candidates/${candidateSlug}/consistency`)
      const json = await res.json()
      if (json.success) setScores(json.data)
      else setError(json.error ?? 'Erro ao carregar scores')
    } catch {
      setError('Falha de conexão com a API')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateSlug])

  if (!loading && !error && scores !== null && scores.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-dashed border-gray-200 p-8 text-center text-gray-400 text-sm">
        <p>Nenhum dado de consistência disponível.</p>
        <p className="text-xs mt-1">Disponível quando o candidato tiver propostas e histórico de votações registrados.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Score de consistência</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Cruzamento entre propostas declaradas e histórico de votações. Gerado por IA.
          </p>
        </div>
        {!loading && scores !== null && (
          <button
            onClick={load}
            className="text-xs text-brand-600 hover:text-brand-800 underline"
          >
            Recalcular
          </button>
        )}
      </div>

      {loading && (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 bg-gray-100 rounded-lg" />
          ))}
          <p className="text-xs text-gray-400 text-center pt-2">Analisando com IA… pode levar alguns segundos.</p>
        </div>
      )}

      {error && (
        <div className="text-center py-6">
          <p className="text-red-600 text-sm">{error}</p>
          <button
            onClick={load}
            className="mt-2 text-xs text-red-500 underline hover:no-underline"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {!loading && !error && scores && scores.length > 0 && (
        <div className="space-y-3">
          {scores.map((s) => {
            const cfg = LABEL_CONFIG[s.label] ?? LABEL_CONFIG['Sem dados']
            const isExpanded = expanded === s.theme

            return (
              <div key={s.theme} className="border border-gray-100 rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpanded(isExpanded ? null : s.theme)}
                  className="w-full text-left p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-medium text-gray-900 text-sm flex-1">{s.theme}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.className}`}>
                      {s.label}
                    </span>
                    <span className="text-xs font-bold text-gray-600 w-8 text-right">{s.score}</span>
                    <span className="text-gray-400 text-xs">{isExpanded ? '▲' : '▼'}</span>
                  </div>

                  {/* Score bar */}
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${cfg.bar}`}
                      style={{ width: `${s.score}%` }}
                    />
                  </div>

                  <p className="text-xs text-gray-400 mt-1.5">
                    {s.proposalCount} proposta{s.proposalCount !== 1 ? 's' : ''} ·{' '}
                    {s.voteCount} votação{s.voteCount !== 1 ? 'ões' : ''} analisada{s.voteCount !== 1 ? 's' : ''}
                  </p>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-gray-50 bg-gray-50">
                    <p className="text-sm text-gray-700 leading-relaxed mt-3 mb-3">
                      {s.explanation}
                    </p>

                    {s.contradictions.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-red-600 mb-2 uppercase tracking-wide">
                          Possíveis contradições detectadas
                        </p>
                        <div className="space-y-2">
                          {s.contradictions.map((c, i) => (
                            <div key={i} className="bg-red-50 border border-red-100 rounded-lg p-3">
                              <p className="text-xs text-gray-700">
                                <span className="font-medium text-red-700">Proposta:</span> {c.proposal}
                              </p>
                              <p className="text-xs text-gray-700 mt-1">
                                <span className="font-medium text-red-700">Votação:</span> {c.vote}
                              </p>
                              <p className="text-xs text-gray-500 mt-1 italic">{c.description}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <p className="text-xs text-gray-400 mt-3">
                      Atualizado em {new Date(s.computedAt).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                )}
              </div>
            )
          })}

          <p className="text-xs text-gray-400 text-center pt-2">
            Score 0–100: maior valor indica maior consistência entre propostas e votos.
            Gerado automaticamente por IA — pode conter imprecisões.
          </p>
        </div>
      )}
    </div>
  )
}
