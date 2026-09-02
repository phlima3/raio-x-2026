'use client'

import Image from 'next/image'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ViewTransitionLink } from './ViewTransitionLink'

export type PresidentialCandidate = {
  id: string
  slug: string
  name: string
  party: string
  state: string
  position: string
  photoUrl?: string | null
  ballotNumber?: number | null
  isIncumbent?: boolean
  firstProposalTitle?: string | null
}

type SortKey = 'default' | 'name' | 'state'

type Props = {
  candidates: PresidentialCandidate[]
}

const SORT_LABELS: Record<SortKey, string> = {
  default: 'Editorial',
  name: 'A–Z',
  state: 'UF',
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
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

function sortCandidates(
  input: PresidentialCandidate[],
  key: SortKey
): PresidentialCandidate[] {
  if (key === 'default') return input
  const copy = [...input]
  switch (key) {
    case 'name':
      return copy.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    case 'state':
      return copy.sort((a, b) => {
        const s = (a.state ?? '').localeCompare(b.state ?? '', 'pt-BR')
        return s !== 0 ? s : a.name.localeCompare(b.name, 'pt-BR')
      })
  }
}

export function PresidentialIndex({ candidates }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('default')
  const listRef = useRef<HTMLOListElement | null>(null)
  const itemRefs = useRef<Map<string, HTMLLIElement>>(new Map())
  const rectsRef = useRef<Map<string, DOMRect>>(new Map())
  const previousOrder = useRef<string[]>(candidates.map((c) => c.id))

  const sorted = useMemo(
    () => sortCandidates(candidates, sortKey),
    [candidates, sortKey]
  )

  const handleSort = (key: SortKey) => {
    if (key === sortKey) return

    if (!prefersReducedMotion()) {
      const rects = new Map<string, DOMRect>()
      itemRefs.current.forEach((node, id) => {
        rects.set(id, node.getBoundingClientRect())
      })
      rectsRef.current = rects
    }

    previousOrder.current = sorted.map((c) => c.id)
    setSortKey(key)
  }

  useLayoutEffect(() => {
    if (prefersReducedMotion()) return
    const rects = rectsRef.current
    if (rects.size === 0) return

    itemRefs.current.forEach((node, id) => {
      const prev = rects.get(id)
      if (!prev) return
      const next = node.getBoundingClientRect()
      const dx = prev.left - next.left
      const dy = prev.top - next.top
      if (dx === 0 && dy === 0) return

      node.animate(
        [
          { transform: `translate(${dx}px, ${dy}px)` },
          { transform: 'translate(0, 0)' },
        ],
        {
          duration: 560,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          fill: 'both',
        }
      )
    })

    rectsRef.current = new Map()
  }, [sorted])

  return (
    <>
      <div
        role="toolbar"
        aria-label="Ordenação da lista"
        className="mb-8 flex items-center flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted border-y border-ink/20 py-2"
      >
        <span className="text-ink-muted">Ordenar por</span>
        {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => {
          const active = sortKey === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => handleSort(key)}
              aria-pressed={active}
              className={
                'focus-editorial transition-colors border-b py-1.5 ' +
                (active
                  ? 'text-ember border-ember'
                  : 'border-transparent hover:text-ember hover:border-ember')
              }
            >
              {SORT_LABELS[key]}
            </button>
          )
        })}
        <span className="ml-auto text-ink-muted hidden md:inline">
          <kbd className="font-mono">⌘K</kbd> para busca rápida
        </span>
      </div>

      <ol
        ref={listRef}
        className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 border-t border-ink/25"
      >
        {sorted.map((c, i) => (
          <li
            key={c.id}
            ref={(node) => {
              if (node) itemRefs.current.set(c.id, node)
              else itemRefs.current.delete(c.id)
            }}
            className={sortKey === 'default' ? 'rise-in' : ''}
            style={
              sortKey === 'default'
                ? { animationDelay: `${i * 60}ms` }
                : undefined
            }
          >
            <Entry candidate={c} index={i + 1} />
          </li>
        ))}
      </ol>
    </>
  )
}

function Entry({
  candidate,
  index,
}: {
  candidate: PresidentialCandidate
  index: number
}) {
  const {
    slug,
    name,
    party,
    state,
    photoUrl,
    ballotNumber,
    isIncumbent,
    firstProposalTitle,
  } = candidate
  const initials = initialsFor(name)

  return (
    <ViewTransitionLink
      href={`/candidatos/${slug}`}
      className="focus-editorial group relative flex items-start gap-5 py-7 border-b border-ink/20 hover:bg-paper-light/70 transition-colors pr-4"
    >
      <span className="font-mono text-[11px] tracking-[0.1em] text-ink-soft tabular-nums pt-1.5 w-8 shrink-0">
        {String(index).padStart(2, '0')}
      </span>

      <div
        className="relative w-16 h-16 md:w-20 md:h-20 rounded-full overflow-hidden bg-ember/10 border border-ink/20 shrink-0"
        style={{ viewTransitionName: `photo-${slug}` }}
      >
        {photoUrl ? (
          <Image
            src={photoUrl}
            alt={name}
            fill
            sizes="80px"
            className="object-cover grayscale contrast-110 group-hover:grayscale-0 transition-all duration-700"
            unoptimized
          />
        ) : (
          <span className="flex items-center justify-center w-full h-full font-serif text-xl text-ember">
            {initials}
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <h3
          className="font-serif text-2xl md:text-[1.7rem] leading-tight tracking-[-0.01em] group-hover:text-ember transition-colors"
          style={{ viewTransitionName: `name-${slug}` }}
        >
          {name}
        </h3>
        <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted">
          {party} · {state}
          {ballotNumber ? (
            <>
              <span className="mx-2 text-ink-soft">·</span>Nº{' '}
              <span className="tabular-nums">{ballotNumber}</span>
            </>
          ) : null}
          {isIncumbent ? (
            <>
              <span className="mx-2 text-ink-soft">·</span>
              <span className="text-ember">incumbente</span>
            </>
          ) : null}
        </p>
        {firstProposalTitle && (
          <p className="mt-3 font-serif italic text-[15px] text-ink-muted line-clamp-2 leading-snug">
            <span className="text-ember not-italic mr-1">“</span>
            {firstProposalTitle}
            <span className="text-ember not-italic ml-0.5">”</span>
          </p>
        )}
      </div>

      <span
        aria-hidden
        className="absolute right-1 top-1/2 -translate-y-1/2 translate-x-2 opacity-0 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 font-serif text-ember text-2xl"
      >
        →
      </span>
    </ViewTransitionLink>
  )
}
