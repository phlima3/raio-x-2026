'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ProposalBlock } from './ProposalBlock'
import type { Proposal } from '@/lib/types'

interface Props {
  proposals: Proposal[]
  initialTema?: string
}

export function ProposalsSection({ proposals, initialTema }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [activeTema, setActiveTema] = useState(initialTema ?? '')

  if (proposals.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-dashed border-gray-200 p-8 text-center text-gray-400 text-sm">
        Propostas serão adicionadas após as convenções partidárias (julho de 2026).
        <br />
        <span className="text-xs mt-1 block">
          Os dados são coletados dos sites e programas de governo dos candidatos.
        </span>
      </div>
    )
  }

  const categories = Array.from(
    new Set(proposals.map((p) => p.category ?? 'Outros'))
  )

  const filtered = activeTema
    ? proposals.filter((p) => (p.category ?? 'Outros') === activeTema)
    : proposals

  // Group by category for "all" view
  const grouped: Record<string, Proposal[]> = {}
  for (const p of filtered) {
    const key = p.category ?? 'Outros'
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(p)
  }

  const handleTema = (tema: string) => {
    setActiveTema(tema)
    const params = new URLSearchParams(searchParams.toString())
    if (tema) params.set('tema', tema)
    else params.delete('tema')
    router.replace(`?${params}`, { scroll: false })
  }

  return (
    <div>
      {categories.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-5">
          <button
            onClick={() => handleTema('')}
            className={`text-xs px-4 py-1.5 rounded-full font-medium transition-colors ${
              !activeTema
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Todas
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => handleTema(cat)}
              className={`text-xs px-4 py-1.5 rounded-full font-medium transition-colors ${
                activeTema === cat
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-8">
        {Object.entries(grouped).map(([category, categoryProposals]) => (
          <div key={category}>
            {!activeTema && (
              <h3 className="text-base font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <span className="inline-block w-1 h-4 bg-brand-500 rounded-full" />
                {category}
                <span className="text-xs text-gray-400 font-normal">
                  ({categoryProposals.length})
                </span>
              </h3>
            )}
            {categoryProposals.map((p) => (
              <ProposalBlock key={p.id} {...p} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
