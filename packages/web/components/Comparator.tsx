'use client'

import Image from 'next/image'
import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type {
  CandidateSummary,
  ComparisonFinancing,
  ComparisonResult,
} from '@/lib/types'
import { renderableImageUrl } from '@/lib/seo'
import { ProposalBlock } from './ProposalBlock'
import { FinancingComparison } from './FinancingComparison'

interface ComparisonData {
  candidateA: CandidateSummary
  candidateB: CandidateSummary
  comparisons: ComparisonResult[]
  financingA: ComparisonFinancing | null
  financingB: ComparisonFinancing | null
}

interface ComparatorProps {
  candidateSlugA: string
  candidateSlugB: string
  topic?: string
}

function initialsFor(name: string): string {
  return name
    .split(' ')
    .filter((w) => w.length > 2)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

// Sticky no mobile: as colunas empilham e, rolando, não dava para saber de
// quem era a proposta. 56px = altura do Navbar sticky.
function ColumnHeader({ letter, candidate }: { letter: 'A' | 'B'; candidate: CandidateSummary }) {
  const photoUrl = renderableImageUrl(candidate.photoUrl)
  return (
    <h3 className="sticky top-[56px] z-20 sm:static flex items-center gap-2.5 bg-paper-light py-2 mb-4 border-b border-ink/10 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
      <span className="text-ember">{letter}</span>
      <span className="relative w-6 h-6 rounded-full overflow-hidden border border-ink/20 bg-ember/10 shrink-0">
        {photoUrl ? (
          <Image src={photoUrl} alt="" fill sizes="24px" className="object-cover" unoptimized />
        ) : (
          <span className="flex items-center justify-center w-full h-full font-serif text-[10px] text-ember">
            {initialsFor(candidate.name)}
          </span>
        )}
      </span>
      <span className="truncate text-ink">{candidate.name}</span>
    </h3>
  )
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function Comparator({ candidateSlugA, candidateSlugB, topic }: ComparatorProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [data, setData] = useState<ComparisonData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTopic, setActiveTopic] = useState(topic ?? '')
  const [contentVisible, setContentVisible] = useState(true)

  const tabBarRef = useRef<HTMLDivElement>(null)
  const indicatorRef = useRef<HTMLDivElement>(null)
  const proposalsRef = useRef<HTMLDivElement>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
    // Sem `topic`: a API filtrada devolve UMA comparação só, e a barra de abas
    // (que exige themes.length > 1) sumia sem volta. Busca todos os temas uma
    // vez e filtra no cliente — que é o que activeComparison já fazia.
    const params = new URLSearchParams({ candidateA: candidateSlugA, candidateB: candidateSlugB })

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
  }, [candidateSlugA, candidateSlugB])

  useEffect(() => { fetchData() }, [fetchData])

  const themes = data?.comparisons.map((c) => c.theme) ?? []
  const currentTheme = activeTopic || themes[0]
  const activeComparison = activeTopic
    ? data?.comparisons.find((c) => c.theme === activeTopic)
    : data?.comparisons[0]

  // Sliding tab indicator
  useLayoutEffect(() => {
    if (!tabBarRef.current || !indicatorRef.current || !currentTheme) return
    const activeBtn = Array.from(
      tabBarRef.current.querySelectorAll<HTMLButtonElement>('[data-theme]'),
    ).find((button) => button.dataset.theme === currentTheme)
    if (!activeBtn) return

    const barRect = tabBarRef.current.getBoundingClientRect()
    const btnRect = activeBtn.getBoundingClientRect()
    const left = btnRect.left - barRect.left
    const width = btnRect.width
    // Abas quebram linha no mobile: ancora no fundo do botão ativo, não da barra
    const top = btnRect.bottom - barRect.top - 2

    indicatorRef.current.animate(
      [{ left: `${left}px`, width: `${width}px`, top: `${top}px` }],
      {
        duration: prefersReducedMotion() ? 0 : 360,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        fill: 'forwards',
      }
    )
  }, [currentTheme, data])

  const handleTopicChange = (t: string) => {
    if (t === activeTopic || (t === themes[0] && !activeTopic)) return

    if (!prefersReducedMotion() && proposalsRef.current) {
      setContentVisible(false)
      setTimeout(() => {
        setActiveTopic(t)
        const params = new URLSearchParams(searchParams.toString())
        if (t) params.set('topic', t)
        else params.delete('topic')
        router.replace(`?${params}`, { scroll: false })
        setContentVisible(true)
      }, 200)
    } else {
      setActiveTopic(t)
      const params = new URLSearchParams(searchParams.toString())
      if (t) params.set('topic', t)
      else params.delete('topic')
      router.replace(`?${params}`, { scroll: false })
    }
  }

  // Rise-in for candidate headers on load
  useEffect(() => {
    if (!data || prefersReducedMotion()) return
    const headers = document.querySelectorAll('[data-cmp-header]')
    headers.forEach((el, i) => {
      (el as HTMLElement).animate(
        [
          { opacity: 0, transform: 'translateY(12px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        {
          duration: 520,
          delay: i * 120,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          fill: 'both',
        }
      )
    })
  }, [data])

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8 mb-8">
          <div className="border-b-2 border-ink/10 pb-4 space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-ink/10" />
              <div className="space-y-2 flex-1">
                <div className="h-5 bg-ink/10 w-2/3" />
                <div className="h-3 bg-ink/[0.06] w-1/3" />
              </div>
            </div>
          </div>
          <div className="border-b-2 border-ink/10 pb-4 space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-ink/10" />
              <div className="space-y-2 flex-1">
                <div className="h-5 bg-ink/10 w-2/3" />
                <div className="h-3 bg-ink/[0.06] w-1/3" />
              </div>
            </div>
          </div>
        </div>
        <div className="flex gap-4 border-b border-ink/10 pb-2 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-4 bg-ink/[0.06] w-20" />
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8">
          <div className="space-y-6">
            <div className="h-6 bg-ink/10 w-3/4" />
            <div className="h-4 bg-ink/[0.06] w-full" />
            <div className="h-4 bg-ink/[0.06] w-5/6" />
          </div>
          <div className="space-y-6">
            <div className="h-6 bg-ink/10 w-3/4" />
            <div className="h-4 bg-ink/[0.06] w-full" />
            <div className="h-4 bg-ink/[0.06] w-5/6" />
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="py-16 text-center border-t border-dashed border-ink/20">
        <p className="font-serif text-xl text-ink-muted italic">{error}</p>
        <button
          onClick={fetchData}
          className="mt-4 font-mono text-[11px] uppercase tracking-[0.18em] text-ember hover:border-b hover:border-ember transition-colors"
        >
          Tentar novamente
        </button>
      </div>
    )
  }

  if (!data) return null

  return (
    <div>
      {/* Candidate headers — dual column, stack on mobile */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8 mb-8">
        {[data.candidateA, data.candidateB].map((c) => {
          const photoUrl = renderableImageUrl(c.photoUrl)

          return (
          <div key={c.slug} className="border-b-2 border-ink pb-4" data-cmp-header>
            <div className="flex items-center gap-3">
              <div className="relative w-12 h-12 rounded-full overflow-hidden border border-ink/20 bg-ember/10 shrink-0">
                {photoUrl ? (
                  <Image
                    src={photoUrl}
                    alt={c.name}
                    fill
                    sizes="48px"
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <span className="flex items-center justify-center w-full h-full font-serif text-base text-ember">
                    {initialsFor(c.name)}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <h2 className="font-serif text-2xl leading-tight tracking-[-0.01em] truncate">
                  {c.name}
                </h2>
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted mt-0.5">
                  {c.party} · {c.state}
                </p>
              </div>
            </div>
          </div>
          )
        })}
      </div>

      {/* Dinheiro público antes das propostas: vale para qualquer tema, e não
          é tema de proposta — por isso fica fora da barra de abas. */}
      <FinancingComparison
        financingA={data.financingA ?? null}
        financingB={data.financingB ?? null}
        nameA={data.candidateA.name}
        nameB={data.candidateB.name}
      />

      {/* Topic tabs — editorial with sliding indicator */}
      {themes.length > 1 && (
        <div
          ref={tabBarRef}
          role="tablist"
          aria-label="Temas para comparação"
          className="relative flex items-center flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted border-y border-ink/20 py-2 mb-8"
        >
          <span className="text-ink-soft">Tema</span>
          {themes.map((theme) => {
            const active = currentTheme === theme
            return (
              <button
                key={theme}
                type="button"
                role="tab"
                aria-selected={active}
                data-theme={theme}
                onClick={() => handleTopicChange(theme)}
                className={
                  'focus-editorial transition-colors py-1.5 relative z-10 ' +
                  (active ? 'text-ember' : 'hover:text-ember')
                }
              >
                {theme}
              </button>
            )
          })}
          {/* Sliding indicator */}
          <div
            ref={indicatorRef}
            aria-hidden
            className="absolute h-[2px] bg-ember"
            style={{ left: 0, width: 0, top: 0 }}
          />
        </div>
      )}

      {/* Side-by-side proposals with cross-fade */}
      {activeComparison ? (
        <div
          ref={proposalsRef}
          role="tabpanel"
          aria-label={activeComparison.theme}
          aria-busy={!contentVisible}
          className="transition-opacity duration-200"
          style={{ opacity: contentVisible ? 1 : 0 }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 sm:divide-x sm:divide-ink/10">
            <div>
<ColumnHeader letter="A" candidate={data.candidateA} />
              {activeComparison.proposalsA.length === 0 ? (
                <p className="font-serif italic text-[15px] text-ink-soft py-8">
                  Sem propostas para este tema.
                </p>
              ) : (
                activeComparison.proposalsA.map((p) => <ProposalBlock key={p.id} {...p} />)
              )}
            </div>
            <div className="sm:pl-8 border-t border-ink/10 pt-6 sm:border-t-0 sm:pt-0">
<ColumnHeader letter="B" candidate={data.candidateB} />
              {activeComparison.proposalsB.length === 0 ? (
                <p className="font-serif italic text-[15px] text-ink-soft py-8">
                  Sem propostas para este tema.
                </p>
              ) : (
                activeComparison.proposalsB.map((p) => <ProposalBlock key={p.id} {...p} />)
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="py-16 text-center border-t border-dashed border-ink/20">
          <p className="font-serif text-xl text-ink-muted italic">
            Nenhuma proposta encontrada para comparar.
          </p>
        </div>
      )}
    </div>
  )
}
