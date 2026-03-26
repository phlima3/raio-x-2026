'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { CandidateSummary, ComparisonResult } from '@/lib/types'
import { ProposalBlock } from './ProposalBlock'

interface ComparisonData {
  candidateA: CandidateSummary
  candidateB: CandidateSummary
  comparisons: ComparisonResult[]
}

interface ComparatorProps {
  candidateSlugA: string
  candidateSlugB: string
  topic?: string
}

export function Comparator({ candidateSlugA, candidateSlugB, topic }: ComparatorProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [data, setData] = useState<ComparisonData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTopic, setActiveTopic] = useState(topic ?? '')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
    const params = new URLSearchParams({ candidateA: candidateSlugA, candidateB: candidateSlugB })
    if (activeTopic) params.set('topic', activeTopic)

    try {
      const res = await fetch(`${API_BASE}/api/comparison?${params}`)
      const json = await res.json()
      if (json.success) setData(json.data)
      else setError(json.error ?? 'Erro ao carregar comparação')
    } catch {
      setError('Falha de conexão com a API')
    } finally {
      setLoading(false)
    }
  }, [candidateSlugA, candidateSlugB, activeTopic])

  useEffect(() => { fetchData() }, [fetchData])

  const handleTopicChange = (t: string) => {
    setActiveTopic(t)
    const params = new URLSearchParams(searchParams.toString())
    if (t) params.set('topic', t)
    else params.delete('topic')
    router.replace(`?${params}`, { scroll: false })
  }

  const themes = data?.comparisons.map((c) => c.theme) ?? []
  const activeComparison = activeTopic
    ? data?.comparisons.find((c) => c.theme === activeTopic)
    : data?.comparisons[0]

  if (loading) {
    return (
      <div className="mt-6 space-y-4 animate-pulse">
        <div className="h-12 bg-gray-200 rounded-xl" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-48 bg-gray-100 rounded-xl" />
          <div className="h-48 bg-gray-100 rounded-xl" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mt-6 bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <p className="text-red-700 text-sm">{error}</p>
        <button
          onClick={fetchData}
          className="mt-3 text-xs text-red-600 underline hover:no-underline"
        >
          Tentar novamente
        </button>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="mt-6">
      {/* Candidate headers */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {[
          { c: data.candidateA, slug: candidateSlugA },
          { c: data.candidateB, slug: candidateSlugB },
        ].map(({ c, slug }) => (
          <div key={slug} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
              <span className="text-brand-700 font-bold text-sm">
                {c.name.split(' ').filter((w) => w.length > 2).slice(0, 2).map((w) => w[0]).join('')}
              </span>
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 text-sm truncate">{c.name}</p>
              <p className="text-xs text-gray-500">{c.party} · {c.state}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Topic tabs */}
      {themes.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-none">
          {themes.map((theme) => (
            <button
              key={theme}
              onClick={() => handleTopicChange(theme)}
              className={`flex-shrink-0 text-xs px-4 py-2 rounded-full font-medium transition-colors ${
                (activeTopic || themes[0]) === theme
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {theme}
            </button>
          ))}
        </div>
      )}

      {/* AI summary banner */}
      {activeComparison?.aiSummary && (
        <div className="bg-brand-50 border border-brand-100 rounded-xl p-4 mb-6">
          <p className="text-xs text-brand-500 font-medium uppercase tracking-wide mb-1">
            Resumo gerado por IA · {activeComparison.theme}
          </p>
          <p className="text-sm text-brand-900 leading-relaxed">{activeComparison.aiSummary}</p>
        </div>
      )}

      {/* Side-by-side proposals */}
      {activeComparison ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-brand-500 inline-block" />
              {data.candidateA.name.split(' ')[0]}
            </h3>
            {activeComparison.proposalsA.length === 0 ? (
              <p className="text-sm text-gray-400 italic py-4">Sem propostas para este tema.</p>
            ) : (
              activeComparison.proposalsA.map((p) => <ProposalBlock key={p.id} {...p} />)
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-gray-400 inline-block" />
              {data.candidateB.name.split(' ')[0]}
            </h3>
            {activeComparison.proposalsB.length === 0 ? (
              <p className="text-sm text-gray-400 italic py-4">Sem propostas para este tema.</p>
            ) : (
              activeComparison.proposalsB.map((p) => <ProposalBlock key={p.id} {...p} />)
            )}
          </div>
        </div>
      ) : (
        <p className="text-gray-400 text-sm text-center py-8">
          Nenhuma proposta encontrada para comparar.
        </p>
      )}
    </div>
  )
}
