'use client'

import { useState, useEffect } from 'react'
import type { VotingRecord, AssetDeclaration, CampaignFinancing } from '@/lib/types'

type ActiveTab = 'voting' | 'assets' | 'financing'

const VOTE_CONFIG: Record<string, { label: string; className: string }> = {
  YES:         { label: 'Sim',       className: 'text-green-700 bg-green-50' },
  NO:          { label: 'Não',       className: 'text-red-700 bg-red-50' },
  ABSTENTION:  { label: 'Abstenção', className: 'text-yellow-700 bg-yellow-50' },
  ABSENT:      { label: 'Ausente',   className: 'text-gray-500 bg-gray-100' },
  OBSTRUCTION: { label: 'Obstrução', className: 'text-orange-700 bg-orange-50' },
}

function fmt(value: string | number): string {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

interface TransparencyData {
  voting: VotingRecord[]
  assets: AssetDeclaration[]
  financing: CampaignFinancing | null
}

interface TransparencyPanelProps {
  candidateId: string
}

export function TransparencyPanel({ candidateId }: TransparencyPanelProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('voting')
  const [data, setData] = useState<TransparencyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

    fetch(`${API_BASE}/api/candidates/${candidateId}/transparency`, {
      next: { revalidate: 3600 },
    } as RequestInit)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setData(json.data)
        else setError(json.error ?? 'Erro ao carregar dados')
      })
      .catch(() => setError('Falha de conexão'))
      .finally(() => setLoading(false))
  }, [candidateId])

  const tabs: { key: ActiveTab; label: string }[] = [
    { key: 'voting',    label: 'Votações' },
    { key: 'assets',    label: 'Patrimônio' },
    { key: 'financing', label: 'Financiamento' },
  ]

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      {/* Tab bar */}
      <div className="flex border-b border-gray-200">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-5 py-3 text-sm font-medium transition-colors ${
              activeTab === key
                ? 'text-brand-700 border-b-2 border-brand-600 -mb-px'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="p-6">
        {loading && (
          <div className="flex items-center justify-center py-8 text-gray-400 text-sm">
            Carregando…
          </div>
        )}
        {error && <p className="text-red-600 text-sm">{error}</p>}

        {!loading && !error && data && (
          <>
            {/* Votações */}
            {activeTab === 'voting' && (
              <div>
                {data.voting.length === 0 ? (
                  <p className="text-gray-400 text-sm">Nenhuma votação registrada.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                          <th className="pb-2 font-medium w-20">Voto</th>
                          <th className="pb-2 font-medium">Proposição</th>
                          <th className="pb-2 font-medium w-24 text-right">Data</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {data.voting.slice(0, 100).map((v) => {
                          const cfg = VOTE_CONFIG[v.voteType] ?? VOTE_CONFIG.ABSENT
                          return (
                            <tr key={v.id} className="hover:bg-gray-50">
                              <td className="py-2 pr-3">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.className}`}>
                                  {cfg.label}
                                </span>
                              </td>
                              <td className="py-2 pr-3 text-gray-700">
                                {v.proposalUrl ? (
                                  <a
                                    href={v.proposalUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="hover:text-brand-600 hover:underline"
                                  >
                                    {v.proposalName}
                                  </a>
                                ) : (
                                  v.proposalName
                                )}
                              </td>
                              <td className="py-2 text-right text-gray-400">
                                {new Date(v.votedAt).toLocaleDateString('pt-BR')}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    {data.voting.length > 100 && (
                      <p className="text-xs text-gray-400 mt-3">
                        Exibindo 100 de {data.voting.length} votações.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Patrimônio */}
            {activeTab === 'assets' && (
              <div>
                {data.assets.length === 0 ? (
                  <p className="text-gray-400 text-sm">Nenhuma declaração de bens disponível.</p>
                ) : (
                  <div className="space-y-4">
                    {data.assets.map((a) => (
                      <div key={a.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-semibold text-gray-900">{a.year}</p>
                          {a.variation !== null && (
                            <p className={`text-xs mt-0.5 ${a.variation >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {a.variation >= 0 ? '+' : ''}{fmt(a.variation)} vs. ano anterior
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-gray-900 text-lg">{fmt(a.totalValue)}</p>
                          {a.sourceUrl && (
                            <a
                              href={a.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-brand-500 hover:underline"
                            >
                              TSE ↗
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Financiamento */}
            {activeTab === 'financing' && (
              <div>
                {!data.financing ? (
                  <p className="text-gray-400 text-sm">Dados de financiamento não disponíveis.</p>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-green-50 rounded-lg">
                        <p className="text-xs text-green-600 font-medium mb-1">Total Arrecadado</p>
                        <p className="text-xl font-bold text-green-900">{fmt(data.financing.totalReceived)}</p>
                      </div>
                      <div className="p-4 bg-orange-50 rounded-lg">
                        <p className="text-xs text-orange-600 font-medium mb-1">Total Gasto</p>
                        <p className="text-xl font-bold text-orange-900">{fmt(data.financing.totalSpent)}</p>
                      </div>
                    </div>
                    {data.financing.sourceUrl && (
                      <a
                        href={data.financing.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-brand-500 hover:underline block"
                      >
                        Ver dados completos no TSE ↗
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
