'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { CandidateCard } from './CandidateCard'
import { EditorialSelect, type SelectOption } from './EditorialSelect'

// Só carrega a malha do IBGE (~20 kB gz) quando o cargo é estadual.
const BrazilStateMap = dynamic(
  () => import('./BrazilStateMap').then((m) => m.BrazilStateMap),
  { loading: () => <div className="h-64" /> }
)

// Cargos disputados por estado — aí o mapa substitui o select.
const STATE_SCOPED = new Set(['GOVERNADOR', 'SENADOR'])

interface Candidate {
  id: string
  name: string
  party: string
  state: string
  position: string
  photoUrl?: string | null
  ballotNumber?: number | null
  isIncumbent?: boolean
  approvalRate?: number | null
  firstProposalTitle?: string | null
  slug: string
}

interface BuscaClientProps {
  initialCandidates: Candidate[]
  initialTotal: number
  initialQ: string
  initialPosition: string
  initialState: string
  positionOptions: SelectOption[]
  stateOptions: SelectOption[]
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function BuscaClient({
  initialCandidates,
  initialTotal,
  initialQ,
  initialPosition,
  initialState,
  positionOptions,
  stateOptions,
}: BuscaClientProps) {
  const router = useRouter()
  const [q, setQ] = useState(initialQ)
  const [position, setPosition] = useState(initialPosition)
  const [state, setState] = useState(initialState)
  const [candidates, setCandidates] = useState(initialCandidates)
  const [total, setTotal] = useState(initialTotal)
  const [fetching, setFetching] = useState(false)
  const [generation, setGeneration] = useState(0)
  const resultsRef = useRef<HTMLDivElement>(null)

  const debouncedQ = useDebounce(q, 300)

  const syncUrl = useCallback((search: string, pos: string, st: string) => {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (pos) params.set('position', pos)
    if (st) params.set('state', st)
    const qs = params.toString()
    router.replace(qs ? `/busca?${qs}` : '/busca', { scroll: false })
  }, [router])

  const fetchResults = useCallback(async (search: string, pos: string, st: string) => {
    setFetching(true)
    const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
    const params = new URLSearchParams({ limit: '50' })
    if (search) params.set('search', search)
    if (pos) params.set('position', pos)
    if (st) params.set('state', st)

    try {
      const res = await fetch(`${API_BASE}/api/candidates?${params}`)
      const json = await res.json()
      if (json.success) {
        setCandidates(json.data ?? [])
        setTotal(json.meta?.total ?? json.data?.length ?? 0)
        setGeneration((g) => g + 1)
      }
    } catch {
      // keep current results on error
    } finally {
      setFetching(false)
    }
  }, [])

  useEffect(() => {
    const isInitial =
      debouncedQ === initialQ && position === initialPosition && state === initialState
    if (isInitial) return

    syncUrl(debouncedQ, position, state)
    fetchResults(debouncedQ, position, state)
  }, [debouncedQ, position, state, syncUrl, fetchResults, initialQ, initialPosition, initialState])

  useEffect(() => {
    if (!resultsRef.current) return
    const items = resultsRef.current.querySelectorAll<HTMLElement>('[data-result]')
    if (prefersReducedMotion()) {
      items.forEach((el) => { el.style.opacity = '1' })
      return
    }
    items.forEach((el, i) => {
      el.style.opacity = '0'
      const anim = el.animate(
        [
          { opacity: 0, transform: 'translateY(14px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        {
          duration: 520,
          delay: i * 40,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          fill: 'forwards',
        }
      )
      anim.finished.then(() => { el.style.opacity = '1' }).catch(() => { el.style.opacity = '1' })
    })
  }, [generation])

  const showMap = STATE_SCOPED.has(position)
  const hasFilters = Boolean(q || position || state)

  const handleClear = () => {
    setQ('')
    setPosition('')
    setState('')
    syncUrl('', '', '')
    fetchResults('', '', '')
  }

  return (
    <>
      {/* Search form — editorial, live */}
      <div className="mb-10">
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
          <div className="relative flex-1">
            <label
              htmlFor="search-q"
              className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft mb-1 block"
            >
              Nome ou partido
            </label>
            <input
              id="search-q"
              type="search"
              value={q}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
              placeholder="Buscar…"
              className="focus-editorial w-full bg-transparent border-b-2 border-ink/30 py-2 text-ink font-serif text-lg placeholder:text-ink-soft/50 placeholder:italic focus:border-ember transition-colors min-h-[44px]"
            />
          </div>

          <div className="sm:w-48">
            <EditorialSelect
              name="position"
              label="Cargo"
              defaultValue={position}
              options={positionOptions}
              onChange={setPosition}
            />
          </div>

          {!showMap && (
            <div className="sm:w-32">
              <EditorialSelect
                name="state"
                label="Estado"
                defaultValue={state}
                options={stateOptions}
                onChange={setState}
              />
            </div>
          )}
        </div>

        {showMap && <BrazilStateMap value={state} onChange={setState} />}

        {hasFilters && (
          <div className="mt-4 flex items-center flex-wrap gap-2 border-t border-ink/10 pt-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft mr-1">
              Filtros:
            </span>
            {q && (
              <span className="inline-flex items-center font-mono text-[10px] uppercase tracking-[0.14em] text-ember border border-ember/30 px-2.5 py-0.5">
                &ldquo;{q}&rdquo;
              </span>
            )}
            {position && (
              <span className="inline-flex items-center font-mono text-[10px] uppercase tracking-[0.14em] text-ink border border-ink/20 px-2.5 py-0.5">
                {positionOptions.find((p) => p.value === position)?.label}
              </span>
            )}
            {state && (
              <span className="inline-flex items-center font-mono text-[10px] uppercase tracking-[0.14em] text-ink border border-ink/20 px-2.5 py-0.5">
                {state}
              </span>
            )}
            <button
              type="button"
              onClick={handleClear}
              className="focus-editorial font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft hover:text-ember transition-colors ml-2 border-b border-ink-soft/30 hover:border-ember py-1 px-1"
            >
              Limpar
            </button>
          </div>
        )}
      </div>

      {/* Results */}
      {candidates.length === 0 ? (
        <div className="py-20 text-center border-t border-dashed border-ink/20">
          <p className="font-serif text-2xl text-ink-muted italic">
            {hasFilters
              ? 'Nenhum candidato encontrado'
              : 'Use os filtros acima para buscar candidatos'}
          </p>
          {hasFilters && (
            <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft">
              Tente termos mais amplos ou{' '}
              <button
                type="button"
                onClick={handleClear}
                className="text-ember hover:border-b hover:border-ember"
              >
                limpe os filtros
              </button>
            </p>
          )}
          {!hasFilters && (
            <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft">
              Ou veja os{' '}
              <Link href="/" className="text-ember hover:border-b hover:border-ember">
                candidatos em destaque
              </Link>
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-baseline justify-between border-y border-ink/20 py-2 mb-1">
            <p
              aria-live="polite"
              aria-atomic="true"
              className={
                'font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted transition-opacity ' +
                (fetching ? 'opacity-50' : '')
              }
            >
              {total === candidates.length
                ? `${total} candidato${total !== 1 ? 's' : ''}`
                : `${candidates.length} de ${total}`}
            </p>
            <p
              role="status"
              className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft hidden sm:block"
            >
              {fetching ? 'Buscando…' : 'Resultados'}
            </p>
          </div>

          <div
            ref={resultsRef}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8"
          >
            {candidates.map((c, i) => (
              <div key={c.id} data-result>
                <CandidateCard {...c} index={i + 1} />
              </div>
            ))}
          </div>

          {total > candidates.length && (
            <p className="text-center font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft mt-10 border-t border-dashed border-ink/15 pt-4">
              Exibindo {candidates.length} de {total} — refine sua busca para mais resultados
            </p>
          )}
        </>
      )}
    </>
  )
}
