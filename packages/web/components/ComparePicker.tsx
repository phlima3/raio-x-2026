'use client'

import Image from 'next/image'
import { useMemo, useState } from 'react'
import { BRAZIL_STATES } from '@/lib/landing'
import { partyLabel } from '@/lib/candidacy'
import { eligibleOpponents, filterPickerCandidates, raceOf } from '@/lib/comparisons'
import type { CandidateSummary } from '@/lib/types'

const POSITION_LABELS: Record<string, string> = {
  PRESIDENTE: 'Presidente da República',
  GOVERNADOR: 'Governador(a)',
  SENADOR: 'Senador(a)',
}

function raceLabel(candidate: CandidateSummary): string {
  const race = raceOf(candidate)
  const cargo = POSITION_LABELS[race.position] ?? race.position
  return race.state ? `${cargo} por ${BRAZIL_STATES[race.state] ?? race.state}` : cargo
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

function buildPickerHref(slug: string, selectedA?: string, selectedB?: string): string {
  if (!selectedA) return `/comparar?a=${slug}`
  if (!selectedB && slug !== selectedA) return `/comparar?a=${selectedA}&b=${slug}`
  if (slug === selectedA) return selectedB ? `/comparar?a=${selectedB}` : '/comparar'
  if (slug === selectedB) return `/comparar?a=${selectedA}`
  return `/comparar?a=${selectedA}&b=${slug}`
}

interface Props {
  candidates: CandidateSummary[]
  selectedA?: string
  selectedB?: string
}

const CONTROL =
  'focus-editorial w-full bg-paper-light border border-ink/30 px-3 py-2.5 text-base text-ink placeholder:text-ink-soft'

export function ComparePicker({ candidates, selectedA, selectedB }: Props) {
  const [query, setQuery] = useState('')
  const [position, setPosition] = useState('')
  const [state, setState] = useState('')

  const first = candidates.find((c) => c.slug === selectedA)
  // Escolhido o primeiro, só faz sentido oferecer quem disputa o mesmo cargo:
  // comparar plano de governo de presidente com o de governador compara
  // disputas diferentes. A disputa já está travada; cargo e UF somem do filtro.
  const eligible = useMemo(
    () => eligibleOpponents(candidates, selectedA),
    [candidates, selectedA],
  )
  const shown = useMemo(
    () => filterPickerCandidates(eligible, first ? { query } : { query, position, state }),
    [eligible, first, query, position, state],
  )
  const states = useMemo(
    () =>
      Array.from(new Set(eligible.map((c) => c.state)))
        .filter((uf) => uf && uf !== 'BR')
        .sort((a, b) => (BRAZIL_STATES[a] ?? a).localeCompare(BRAZIL_STATES[b] ?? b, 'pt-BR')),
    [eligible],
  )

  if (candidates.length === 0) {
    return (
      <p className="py-16 text-center text-lg text-ink-muted">
        Nenhum candidato disponível agora. Tente de novo mais tarde.
      </p>
    )
  }

  return (
    <div>
      <p className="text-lg leading-snug text-ink mb-5">
        {first
          ? <>Agora escolha quem comparar com <strong className="font-medium">{first.name}</strong>. Só aparece quem disputa {raceLabel(first)}.</>
          : 'Escolha o primeiro candidato.'}
      </p>

      {selectedA && (
        <div className="flex items-center flex-wrap gap-4 mb-6 pb-5 border-b border-ink/15">
          <SelectedBadge
            candidate={first}
            removeHref={selectedB ? `/comparar?a=${selectedB}` : '/comparar'}
          />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr] gap-3 mb-8">
        <label className="block">
          <span className="block text-sm text-ink-muted mb-1">Nome ou partido</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={CONTROL}
            autoComplete="off"
          />
        </label>
        {!first && (
          <>
            <label className="block">
              <span className="block text-sm text-ink-muted mb-1">Cargo</span>
              <select
                value={position}
                onChange={(e) => {
                  setPosition(e.target.value)
                  if (e.target.value === 'PRESIDENTE') setState('')
                }}
                className={CONTROL}
              >
                <option value="">Todos</option>
                {Object.entries(POSITION_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-sm text-ink-muted mb-1">Estado</span>
              <select
                value={state}
                onChange={(e) => setState(e.target.value)}
                className={CONTROL}
                disabled={position === 'PRESIDENTE'}
              >
                <option value="">Todos</option>
                {states.map((uf) => (
                  <option key={uf} value={uf}>{BRAZIL_STATES[uf] ?? uf}</option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="py-12 text-center text-lg text-ink-muted">
          Nenhum candidato com esse nome{first ? ' nesta disputa' : ' e esses filtros'}.
        </p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8">
          {shown.map((c) => {
            const isSelected = c.slug === selectedA || c.slug === selectedB
            return (
              <li key={c.id}>
                <a
                  href={buildPickerHref(c.slug, selectedA, selectedB)}
                  aria-current={isSelected ? 'true' : undefined}
                  className={
                    'focus-editorial group flex items-center gap-3 border-b border-ink/15 py-4 px-2 transition-colors ' +
                    (isSelected ? 'bg-ember/[0.06]' : 'hover:bg-paper-light')
                  }
                >
                  <Photo candidate={c} size={48} selected={isSelected} />
                  <span className="min-w-0">
                    <span className={
                      'block font-serif text-lg leading-tight line-clamp-2 ' +
                      (isSelected ? 'text-ember' : 'group-hover:text-ember')
                    }>
                      {c.name}
                    </span>
                    <span className="block text-sm text-ink-muted mt-0.5">{partyLabel(c)}</span>
                  </span>
                </a>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function Photo({
  candidate,
  size,
  selected,
}: {
  candidate: CandidateSummary
  size: number
  selected?: boolean
}) {
  return (
    <span
      className={
        'relative rounded-full overflow-hidden border shrink-0 bg-paper-dark ' +
        (selected ? 'border-ember' : 'border-ink/15')
      }
      style={{ width: size, height: size }}
    >
      {candidate.photoUrl ? (
        <Image
          src={candidate.photoUrl}
          alt=""
          fill
          sizes={`${size}px`}
          className="object-cover"
          unoptimized
        />
      ) : (
        <span className="flex items-center justify-center w-full h-full font-serif text-base text-ink-muted">
          {initialsFor(candidate.name)}
        </span>
      )}
    </span>
  )
}

function SelectedBadge({
  candidate,
  removeHref,
}: {
  candidate?: CandidateSummary
  removeHref: string
}) {
  if (!candidate) return null
  return (
    <div className="flex items-center gap-3">
      <Photo candidate={candidate} size={40} selected />
      <div className="min-w-0">
        <p className="font-serif text-base leading-tight">{candidate.name}</p>
        <p className="text-sm text-ink-muted">{partyLabel(candidate)}</p>
      </div>
      <a
        href={removeHref}
        className="focus-editorial text-sm text-ink-muted hover:text-ember underline underline-offset-4 ml-2 min-h-[44px] flex items-center"
      >
        Trocar
      </a>
    </div>
  )
}
