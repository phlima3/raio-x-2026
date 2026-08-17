'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ProposalBlock } from './ProposalBlock'
import type { Proposal } from '@/lib/types'

interface Props {
  proposals: Proposal[]
}

export function ProposalsSection({ proposals }: Props) {
  const router = useRouter()
  const [activeTema, setActiveTema] = useState('')

  useEffect(() => {
    setActiveTema(new URLSearchParams(window.location.search).get('tema') ?? '')
  }, [])

  if (proposals.length === 0) {
    return (
      <div className="border border-dashed border-ink/30 py-14 px-6 text-center">
        <p className="font-serif italic text-xl text-ink-muted text-pretty max-w-md mx-auto">
          Nenhuma proposta revisada para este candidato ainda.
        </p>
        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
          Só publicamos proposta com fonte verificada
        </p>
      </div>
    )
  }

  const categories = Array.from(
    new Set(proposals.map((p) => p.category ?? 'Outros'))
  )

  const filtered = activeTema
    ? proposals.filter((p) => (p.category ?? 'Outros') === activeTema)
    : proposals

  const grouped: Record<string, Proposal[]> = {}
  for (const p of filtered) {
    const key = p.category ?? 'Outros'
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(p)
  }

  const handleTema = (tema: string) => {
    setActiveTema(tema)
    const params = new URLSearchParams(window.location.search)
    if (tema) params.set('tema', tema)
    else params.delete('tema')
    router.replace(`?${params}`, { scroll: false })
  }

  const aiExtracted = proposals.some((p) => p.origin === 'AI_EXTRACTION')

  return (
    <div>
      {/* Publicamos a extração sem revisão item a item. O leitor tem de saber
          disso antes de ler, não depois. */}
      {aiExtracted && (
        <p className="mb-8 border-l-2 border-amber-800/50 pl-4 py-1 text-[15px] leading-[1.65] text-ink-muted text-pretty max-w-2xl">
          Parte destas propostas foi <strong className="font-medium text-ink">resumida por IA</strong> a
          partir do plano de governo que o candidato registrou no TSE, sem revisão humana item a item.
          Cada entrada traz o link para o documento oficial — em caso de dúvida, ele é que vale.
        </p>
      )}

      {categories.length > 1 && (
        <div
          role="toolbar"
          aria-label="Filtrar por tema"
          className="mb-10 flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted border-y border-ink/20 py-2"
        >
          <span className="text-ink-muted">Tema</span>
          <button
            type="button"
            onClick={() => handleTema('')}
            aria-pressed={!activeTema}
            className={
              'focus-editorial transition-colors border-b py-1.5 ' +
              (!activeTema
                ? 'text-ember border-ember'
                : 'border-transparent hover:text-ember hover:border-ember')
            }
          >
            Todas
          </button>
          {categories.map((cat) => {
            const active = activeTema === cat
            return (
              <button
                key={cat}
                type="button"
                onClick={() => handleTema(cat)}
                aria-pressed={active}
                className={
                  'focus-editorial transition-colors border-b py-1.5 ' +
                  (active
                    ? 'text-ember border-ember'
                    : 'border-transparent hover:text-ember hover:border-ember')
                }
              >
                {cat}
              </button>
            )
          })}
        </div>
      )}

      <div className="space-y-14">
        {Object.entries(grouped).map(([category, categoryProposals]) => (
          <section key={category} aria-labelledby={`cat-${category}`}>
            {!activeTema && (
              <h3
                id={`cat-${category}`}
                className="font-mono text-[11px] uppercase tracking-[0.28em] text-ember mb-5 flex items-baseline gap-3"
              >
                <span className="inline-block w-6 h-px bg-ember align-middle" />
                {category}
                <span className="text-ink-soft tabular-nums">
                  ({categoryProposals.length})
                </span>
              </h3>
            )}
            <div className="border-t border-ink/20">
              {categoryProposals.map((p) => (
                <ProposalBlock key={p.id} {...p} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
