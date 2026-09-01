'use client'

import { useState } from 'react'
import { BRAZIL_UF_PATHS, BRAZIL_VIEWBOX } from '@/lib/brazilMap'
import { BRAZIL_STATES } from '@/lib/landing'

const UFS = Object.keys(BRAZIL_UF_PATHS).sort()

type Props = {
  value: string
  onChange: (uf: string) => void
}

// ponytail: o SVG é aria-hidden de propósito — a lista de siglas abaixo dele é o
// controle acessível, e duplicar teclado/foco nos <path> só traria bug de foco.
export function BrazilStateMap({ value, onChange }: Props) {
  const [hovered, setHovered] = useState<string | null>(null)
  const active = hovered ?? value

  const toggle = (uf: string) => onChange(uf === value ? '' : uf)

  const fillFor = (uf: string) =>
    uf === value
      ? 'fill-ember stroke-paper'
      : uf === hovered
        ? 'fill-ember/30 stroke-ink/40'
        : 'fill-paper-dark stroke-ink/20'

  // Sigla e mancha no mapa acendem juntas, nos dois sentidos.
  const chipClass = (uf: string) =>
    'focus-editorial w-full min-h-[40px] border font-mono text-[11px] uppercase tracking-[0.1em] transition-colors ' +
    (uf === value
      ? 'border-ember bg-ember text-paper'
      : uf === hovered
        ? 'border-ember text-ember'
        : 'border-ink/20 text-ink-muted hover:border-ember hover:text-ember')

  return (
    <div className="border-t border-ink/15 pt-4 mt-4">
      <div className="flex items-baseline justify-between gap-4 mb-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
          Filtrar por estado
        </p>
        <p
          aria-live="polite"
          className="font-serif italic text-[15px] text-ink-muted text-right"
        >
          {active ? BRAZIL_STATES[active] : 'Todos os estados'}
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-[300px_minmax(0,1fr)] sm:items-start">
        <svg
          aria-hidden="true"
          viewBox={BRAZIL_VIEWBOX}
          className="w-full max-w-[300px] mx-auto h-auto"
        >
          {UFS.map((uf) => (
            <path
              key={uf}
              d={BRAZIL_UF_PATHS[uf]}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              className={`cursor-pointer transition-colors duration-150 ${fillFor(uf)}`}
              onMouseEnter={() => setHovered(uf)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => toggle(uf)}
            />
          ))}
        </svg>

        <ul className="grid grid-cols-5 sm:grid-cols-7 gap-1">
          <li>
            <button
              type="button"
              aria-pressed={value === ''}
              onClick={() => onChange('')}
              onMouseEnter={() => setHovered(null)}
              onFocus={() => setHovered(null)}
              className={
                'focus-editorial w-full min-h-[40px] border font-mono text-[10px] uppercase tracking-[0.14em] transition-colors ' +
                (value === ''
                  ? 'border-ember bg-ember text-paper'
                  : 'border-ink/20 text-ink-muted hover:border-ember hover:text-ember')
              }
            >
              Todos
            </button>
          </li>
          {UFS.map((uf) => (
            <li key={uf}>
              <button
                type="button"
                aria-pressed={uf === value}
                aria-label={BRAZIL_STATES[uf]}
                onClick={() => toggle(uf)}
                onMouseEnter={() => setHovered(uf)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(uf)}
                onBlur={() => setHovered(null)}
                className={chipClass(uf)}
              >
                {uf}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
