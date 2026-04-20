'use client'

import { useEffect, useRef, useState } from 'react'

type Props = {
  value: number
  label: string
  index: number
  durationMs?: number
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4)
}

export function StatTicker({ value, label, index, durationMs = 1400 }: Props) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [display, setDisplay] = useState(0)
  const [started, setStarted] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    if (prefersReducedMotion()) {
      setDisplay(value)
      setStarted(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !started) {
            setStarted(true)
            observer.disconnect()
            break
          }
        }
      },
      { threshold: 0.3 }
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [value, started])

  useEffect(() => {
    if (!started) return
    if (value === 0) {
      setDisplay(0)
      return
    }

    const start = performance.now()
    const delay = index * 90

    let frameId = 0
    const tick = (now: number) => {
      const elapsed = Math.max(0, now - start - delay)
      const progress = Math.min(1, elapsed / durationMs)
      const eased = easeOutQuart(progress)
      setDisplay(Math.round(eased * value))
      if (progress < 1) {
        frameId = requestAnimationFrame(tick)
      }
    }

    frameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameId)
  }, [started, value, index, durationMs])

  return (
    <div
      ref={ref}
      className="px-5 md:px-8 py-10 flex flex-col justify-between min-h-[180px]"
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
        {String(index + 1).padStart(2, '0')}
      </p>
      <div>
        <p className="font-serif font-medium text-5xl md:text-6xl lg:text-7xl leading-none tracking-[-0.03em] tabular-nums">
          {display.toLocaleString('pt-BR')}
        </p>
        <p className="mt-4 text-xs md:text-sm text-ink-muted leading-snug max-w-[14ch]">
          {label}
        </p>
      </div>
    </div>
  )
}
