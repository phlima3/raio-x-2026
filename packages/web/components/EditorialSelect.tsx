'use client'

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'

export type SelectOption = {
  value: string
  label: string
}

type Props = {
  name: string
  label: string
  options: SelectOption[]
  defaultValue?: string
  onChange?: (value: string) => void
}

export function EditorialSelect({ name, label, options, defaultValue = '', onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState(
    () => options.find((o) => o.value === defaultValue) ?? options[0]
  )
  const [focusIdx, setFocusIdx] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const buttonId = useId()
  const listboxId = useId()

  const close = useCallback(() => {
    setOpen(false)
    setFocusIdx(-1)
  }, [])

  // Mantém o rótulo em sincronia quando o filtro muda por fora (limpar, mapa).
  useEffect(() => {
    setSelected(options.find((o) => o.value === defaultValue) ?? options[0])
  }, [defaultValue, options])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, close])

  useEffect(() => {
    if (!open || focusIdx < 0) return
    const items = listRef.current?.querySelectorAll('[role="option"]')
    if (items?.[focusIdx]) {
      ;(items[focusIdx] as HTMLElement).scrollIntoView({ block: 'nearest' })
    }
  }, [open, focusIdx])

  const handleKeyDown = (e: KeyboardEvent) => {
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (!open) {
          setOpen(true)
          setFocusIdx(options.findIndex((o) => o.value === selected.value))
        } else if (focusIdx >= 0) {
          setSelected(options[focusIdx])
          onChange?.(options[focusIdx].value)
          close()
        }
        break
      case 'ArrowDown':
        e.preventDefault()
        if (!open) {
          setOpen(true)
          setFocusIdx(options.findIndex((o) => o.value === selected.value))
        } else {
          setFocusIdx((prev) => Math.min(prev + 1, options.length - 1))
        }
        break
      case 'ArrowUp':
        e.preventDefault()
        if (open) {
          setFocusIdx((prev) => Math.max(prev - 1, 0))
        }
        break
      case 'Home':
        if (open) {
          e.preventDefault()
          setFocusIdx(0)
        }
        break
      case 'End':
        if (open) {
          e.preventDefault()
          setFocusIdx(options.length - 1)
        }
        break
      case 'Escape':
        if (open) {
          e.preventDefault()
          close()
        }
        break
      case 'Tab':
        if (open) close()
        break
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <input type="hidden" name={name} value={selected.value} />

      <span
        id={`${buttonId}-label`}
        className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft mb-1 block"
      >
        {label}
      </span>

      <button
        type="button"
        id={buttonId}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-labelledby={`${buttonId}-label`}
        aria-activedescendant={open && focusIdx >= 0 ? `${listboxId}-${focusIdx}` : undefined}
        onClick={() => {
          setOpen((prev) => !prev)
          if (!open) {
            setFocusIdx(options.findIndex((o) => o.value === selected.value))
          }
        }}
        onKeyDown={handleKeyDown}
        className="focus-editorial w-full bg-transparent border-b-2 border-ink/30 py-2 text-ink font-serif text-lg text-left cursor-pointer focus:border-ember transition-colors flex items-center justify-between gap-2 min-h-[44px]"
      >
        <span className={selected.value ? 'text-ink' : 'text-ink-soft/70 italic'}>
          {selected.label}
        </span>
        <svg
          aria-hidden="true"
          className={
            'w-3.5 h-3.5 text-ink-soft shrink-0 transition-transform duration-200 ' +
            (open ? 'rotate-180' : '')
          }
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M2.5 4.5L6 8L9.5 4.5" />
        </svg>
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-labelledby={`${buttonId}-label`}
          className="editorial-dropdown absolute z-50 left-0 right-0 top-full mt-1 bg-paper border border-ink/20 max-h-60 overflow-y-auto shadow-sm"
        >
          {options.map((opt, i) => {
            const isSelected = opt.value === selected.value
            const isFocused = i === focusIdx
            return (
              <li
                key={opt.value}
                id={`${listboxId}-${i}`}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setFocusIdx(i)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  setSelected(opt)
                  onChange?.(opt.value)
                  close()
                }}
                className={
                  'px-3 py-2.5 font-serif text-base cursor-pointer transition-colors min-h-[44px] flex items-center ' +
                  (isFocused ? 'bg-ember/10 text-ink ' : 'text-ink-muted ') +
                  (isSelected ? 'font-medium ' : '')
                }
              >
                <span className="flex items-center justify-between">
                  {opt.label}
                  {isSelected && (
                    <span className="text-ember font-mono text-[10px]">&#10003;</span>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
