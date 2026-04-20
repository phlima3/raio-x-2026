'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type PaletteItem = {
  id: string
  slug: string
  name: string
  party: string
  state: string
}

type Props = {
  items: PaletteItem[]
}

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function score(item: PaletteItem, query: string): number {
  if (!query) return 0
  const q = normalize(query)
  const fields = [
    normalize(item.name),
    normalize(item.party),
    normalize(item.state),
  ]
  let best = -1
  for (const f of fields) {
    if (f.startsWith(q)) best = Math.max(best, 100)
    else if (f.includes(q)) best = Math.max(best, 60)
  }
  return best
}

export function CommandPalette({ items }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const router = useRouter()
  const listboxId = 'cmdk-listbox'

  const results = useMemo(() => {
    if (!query.trim()) return items.slice(0, 8)
    return items
      .map((item) => ({ item, s: score(item, query) }))
      .filter((r) => r.s >= 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 10)
      .map((r) => r.item)
  }, [items, query])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey

      if (mod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setOpen((v) => !v)
        return
      }

      if (!open && e.key === '/') {
        const target = e.target as HTMLElement | null
        const tag = target?.tagName?.toLowerCase()
        if (tag === 'input' || tag === 'textarea' || target?.isContentEditable)
          return
        e.preventDefault()
        setOpen(true)
        return
      }

      if (!open) return

      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) =>
          results.length === 0 ? 0 : (i + 1) % results.length
        )
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) =>
          results.length === 0 ? 0 : (i - 1 + results.length) % results.length
        )
      } else if (e.key === 'Home') {
        e.preventDefault()
        setActiveIndex(0)
      } else if (e.key === 'End') {
        e.preventDefault()
        setActiveIndex(Math.max(0, results.length - 1))
      } else if (e.key === 'Tab') {
        const panel = panelRef.current
        if (!panel) return
        const focusables = panel.querySelectorAll<HTMLElement>(
          'input, button, [tabindex]:not([tabindex="-1"])'
        )
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const target = results[activeIndex]
        if (target) {
          setOpen(false)
          router.push(`/candidatos/${target.slug}`)
        } else if (query.trim()) {
          setOpen(false)
          router.push(`/busca?q=${encodeURIComponent(query.trim())}`)
        }
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, results, activeIndex, query, router])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
      requestAnimationFrame(() => inputRef.current?.focus())
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-editorial group hidden md:flex fixed bottom-6 right-6 z-40 items-center gap-3 bg-ink text-paper px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.2em] border border-ink hover:bg-ember hover:border-ember transition-colors shadow-[4px_4px_0_rgba(26,22,20,0.25)] hover:shadow-[6px_6px_0_rgba(26,22,20,0.3)]"
        aria-label="Abrir busca rápida (Cmd+K)"
      >
        <span aria-hidden className="opacity-70">
          §
        </span>
        <span>Busca rápida</span>
        <kbd className="ml-2 px-1.5 py-0.5 bg-paper text-ink font-mono text-[10px] border border-paper group-hover:bg-paper-light">
          ⌘K
        </kbd>
      </button>
    )
  }

  const resultsCount = results.length
  const resultsLabel =
    resultsCount === 0
      ? 'nenhum resultado'
      : resultsCount === 1
        ? '1 resultado'
        : `${resultsCount} resultados`

  const activeId =
    results[activeIndex] != null ? `cmdk-opt-${results[activeIndex].id}` : undefined

  return (
    <div
      className="cmdk-scrim fixed inset-0 z-50 bg-ink/70 backdrop-blur-sm flex items-start justify-center pt-[10vh] px-4"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Busca rápida"
    >
      <div
        ref={panelRef}
        className="cmdk-panel paper-grain w-full max-w-xl border-2 border-ink shadow-[8px_8px_0_rgba(26,22,20,0.35)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center border-b-2 border-ink">
          <span
            aria-hidden
            className="px-4 py-4 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-muted border-r border-ink/20 whitespace-nowrap"
          >
            §
          </span>
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listboxId}
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="nome, partido ou estado"
            className="flex-1 min-w-0 bg-transparent py-4 px-4 font-serif text-lg placeholder:italic placeholder:text-ink-soft focus:outline-none"
          />
          <kbd className="mr-4 px-2 py-1 bg-paper-dark/60 text-ink-muted font-mono text-[10px] uppercase tracking-wider">
            esc
          </kbd>
        </div>

        {results.length === 0 ? (
          <div className="py-10 px-5 text-center">
            <p className="font-serif italic text-ink-muted">
              Nenhum registro.
            </p>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted">
              Enter para busca ampla
            </p>
          </div>
        ) : (
          <ul
            id={listboxId}
            role="listbox"
            aria-label="Candidatos encontrados"
            className="max-h-[50vh] overflow-y-auto"
          >
            {results.map((item, i) => {
              const active = i === activeIndex
              return (
                <li key={item.id} role="presentation">
                  <button
                    id={`cmdk-opt-${item.id}`}
                    type="button"
                    role="option"
                    aria-selected={active}
                    tabIndex={-1}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => {
                      setOpen(false)
                      router.push(`/candidatos/${item.slug}`)
                    }}
                    className={
                      'focus-editorial w-full flex items-baseline gap-4 px-5 py-3 text-left border-b border-ink/10 transition-colors ' +
                      (active ? 'bg-ember/10' : 'hover:bg-paper-light/70')
                    }
                  >
                    <span className="font-mono text-[10px] tabular-nums text-ink-soft uppercase tracking-[0.12em] w-6">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span
                      className={
                        'font-serif text-lg leading-tight flex-1 ' +
                        (active ? 'text-ember' : 'text-ink')
                      }
                    >
                      {item.name}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-ink-muted">
                      {item.party} · {item.state}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <div
          aria-live="polite"
          className="flex items-center justify-between px-5 py-2.5 border-t border-ink/20 font-mono text-[9px] uppercase tracking-[0.2em] text-ink-muted"
        >
          <span>
            <kbd className="mr-1">↑↓</kbd> navegar ·{' '}
            <kbd className="mx-1">↵</kbd> abrir
          </span>
          <span>{resultsLabel}</span>
        </div>
      </div>
    </div>
  )
}
