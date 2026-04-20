'use client'

import { useEffect, useState } from 'react'

type Section = {
  id: string
  label: string
  roman: string
}

const SECTIONS: Section[] = [
  { id: 'propostas', label: 'Propostas', roman: 'I' },
  { id: 'consistencia', label: 'Consistência', roman: 'II' },
  { id: 'declaracoes', label: 'Declarações', roman: 'III' },
  { id: 'transparencia', label: 'Transparência', roman: 'IV' },
]

export function SectionNav() {
  const [active, setActive] = useState<string>(SECTIONS[0].id)

  useEffect(() => {
    const elements = SECTIONS.map((s) => document.getElementById(s.id)).filter(
      (el): el is HTMLElement => el !== null
    )
    if (elements.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        if (visible.length > 0) {
          setActive(visible[0].target.id)
        }
      },
      {
        rootMargin: '-20% 0px -60% 0px',
        threshold: [0, 0.25, 0.5, 0.75, 1],
      }
    )

    elements.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault()
    const node = document.getElementById(id)
    if (!node) return
    const headerOffset = 112
    const y =
      node.getBoundingClientRect().top + window.pageYOffset - headerOffset
    window.scrollTo({
      top: y,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
    })
  }

  return (
    <nav
      aria-label="Seções do dossiê"
      className="sticky top-[56px] md:top-[60px] z-30 border-b border-ink/25 bg-paper-light/95 backdrop-blur-[2px]"
    >
      <div className="container mx-auto px-4 md:px-6 overflow-x-auto">
        <ul className="flex items-stretch gap-x-6 md:gap-x-8 font-mono text-[11px] uppercase tracking-[0.2em] whitespace-nowrap">
          <li
            aria-hidden
            className="hidden md:flex items-center text-ink-muted pr-2 border-r border-ink/15"
          >
            § Seções
          </li>
          {SECTIONS.map(({ id, label, roman }) => {
            const isActive = active === id
            return (
              <li key={id}>
                <a
                  href={`#${id}`}
                  onClick={(e) => handleClick(e, id)}
                  aria-current={isActive ? 'location' : undefined}
                  className={
                    'focus-editorial flex items-baseline gap-2 py-3 border-b-2 transition-colors ' +
                    (isActive
                      ? 'text-ember border-ember'
                      : 'text-ink-muted border-transparent hover:text-ember')
                  }
                >
                  <span
                    className={
                      'font-serif text-sm normal-case tracking-normal transition-colors ' +
                      (isActive ? 'text-ember' : 'text-ink-soft')
                    }
                  >
                    {roman}.
                  </span>
                  <span>{label}</span>
                </a>
              </li>
            )
          })}
        </ul>
      </div>
    </nav>
  )
}
