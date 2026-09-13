'use client'

import Image from 'next/image'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ViewTransitionLink } from './ViewTransitionLink'
import { fundoEleitoralLine } from '@/lib/financing'

export type PresidentialCandidate = {
  id: string
  slug: string
  name: string
  party: string
  state: string
  position: string
  photoUrl?: string | null
  isIncumbent?: boolean
  firstProposalTitle?: string | null
  fefcReceived?: string | null
  totalReceived?: string | null
}

type SortKey = 'default' | 'name' | 'fefc'

type Props = {
  candidates: PresidentialCandidate[]
}

const SORT_LABELS: Record<SortKey, string> = {
  default: 'Editorial',
  name: 'Nome',
  fefc: 'Fundo eleitoral',
}

function money(value: string | null | undefined): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : -1
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
    case 'fefc':
      // Maior fundão primeiro; quem não tem contas (-1) vai para o fim.
      return copy.sort(
        (a, b) =>
          money(b.fefcReceived) - money(a.fefcReceived) ||
          a.name.localeCompare(b.name, 'pt-BR'),
      )
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
        className="mb-6 flex items-center flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted border-y border-ink/20 py-2"
      >
        <span>Ordenar por</span>
        {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => {
          const active = sortKey === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => handleSort(key)}
              aria-pressed={active}
              className={
                'focus-editorial transition-colors border-b py-1 ' +
                (active
                  ? 'text-ember border-ember'
                  : 'border-transparent text-ink hover:text-ember hover:border-ember')
              }
            >
              {SORT_LABELS[key]}
            </button>
          )
        })}
        <span className="ml-auto hidden md:inline">
          <kbd className="font-mono">⌘K</kbd> abre a busca rápida
        </span>
      </div>

      <ol
        ref={listRef}
        className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 border-t border-ink/25"
      >
        {sorted.map((c) => (
          <li
            key={c.id}
            ref={(node) => {
              if (node) itemRefs.current.set(c.id, node)
              else itemRefs.current.delete(c.id)
            }}
          >
            <Entry candidate={c} />
          </li>
        ))}
      </ol>
    </>
  )
}

function Entry({ candidate }: { candidate: PresidentialCandidate }) {
  const { slug, name, party, photoUrl, isIncumbent, firstProposalTitle } = candidate

  return (
    <ViewTransitionLink
      href={`/candidatos/${slug}`}
      className="focus-editorial group flex items-start gap-5 py-6 border-b border-ink/20 hover:bg-paper-light/70 transition-colors"
    >
      <div
        className="relative w-16 h-16 md:w-20 md:h-20 rounded-full overflow-hidden bg-paper-dark border border-ink/20 shrink-0"
        style={{ viewTransitionName: `photo-${slug}` }}
      >
        {photoUrl ? (
          <Image
            src={photoUrl}
            alt=""
            fill
            sizes="80px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <span className="flex items-center justify-center w-full h-full font-serif text-xl text-ink-muted">
            {initialsFor(name)}
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <h3
          className="font-serif text-2xl md:text-[1.6rem] leading-tight tracking-[-0.01em] group-hover:text-ember transition-colors"
          style={{ viewTransitionName: `name-${slug}` }}
        >
          {name}
        </h3>
        <p className="mt-1 text-sm text-ink-muted">
          {party}
          {isIncumbent ? ', no cargo' : ''}
        </p>
        {firstProposalTitle && (
          <p className="mt-3 font-serif italic text-[15px] text-ink-muted line-clamp-2 leading-snug">
            “{firstProposalTitle}”
          </p>
        )}
        {/* `undefined` é API antiga, sem o campo; `null` é candidato sem contas. */}
        {candidate.totalReceived !== undefined && (
          <p className="mt-3 text-[15px] text-ink">
            {fundoEleitoralLine(
              candidate.totalReceived === null
                ? null
                : { totalReceived: candidate.totalReceived, fefcReceived: candidate.fefcReceived },
            )}
          </p>
        )}
      </div>
    </ViewTransitionLink>
  )
}
