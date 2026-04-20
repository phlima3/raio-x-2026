'use client'

import { useEffect, useRef, useState } from 'react'

type Props = {
  value: number
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4)
}

export function ApprovalMeter({ value }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [display, setDisplay] = useState(0)
  const [started, setStarted] = useState(false)

  useEffect(() => {
    const node = wrapRef.current
    if (!node) return

    if (prefersReducedMotion()) {
      setDisplay(value)
      setStarted(true)
      return
    }

    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !started) {
            setStarted(true)
            obs.disconnect()
            break
          }
        }
      },
      { threshold: 0.3 }
    )

    obs.observe(node)
    return () => obs.disconnect()
  }, [value, started])

  useEffect(() => {
    if (!started) return
    if (value === 0) {
      setDisplay(0)
      return
    }

    const start = performance.now()
    const duration = 1200
    let frameId = 0
    const tick = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(1, elapsed / duration)
      const eased = easeOutQuart(progress)
      setDisplay(Math.round(eased * value))
      if (progress < 1) frameId = requestAnimationFrame(tick)
    }
    frameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameId)
  }, [started, value])

  return (
    <div ref={wrapRef} className="mt-10 max-w-md">
      <div className="flex items-baseline justify-between mb-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-muted">
          Aprovação popular
        </span>
        <span className="font-serif text-3xl tabular-nums leading-none tracking-[-0.02em]">
          {display}
          <span className="text-base text-ink-soft ml-0.5">%</span>
        </span>
      </div>
      <div
        className="relative h-1 bg-ink/10 overflow-hidden"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Taxa de aprovação"
      >
        <div
          className="absolute inset-y-0 left-0 bg-ember transition-[width] duration-[1200ms] ease-out"
          style={{ width: `${display}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-ink-soft tabular-nums">
        <span>0</span>
        <span>25</span>
        <span>50</span>
        <span>75</span>
        <span>100</span>
      </div>
    </div>
  )
}
