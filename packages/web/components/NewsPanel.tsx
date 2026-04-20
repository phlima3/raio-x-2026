'use client'

import { useEffect, useState } from 'react'
import type { NewsItem } from '@/lib/types'

const TOPIC_LABELS: Record<string, string> = {
  economy: 'Economia',
  security: 'Segurança',
  environment: 'Meio ambiente',
  education: 'Educação',
  health: 'Saúde',
}

interface NewsPanelProps {
  candidateSlug: string
}

export function NewsPanel({ candidateSlug }: NewsPanelProps) {
  const [items, setItems] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

    fetch(`${API_BASE}/api/candidates/${candidateSlug}/news`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setItems(json.data)
        else setError(json.error ?? 'Erro ao carregar declarações')
      })
      .catch(() => setError('Falha de conexão'))
      .finally(() => setLoading(false))
  }, [candidateSlug])

  if (loading) {
    return (
      <ol className="border-t border-ink/25">
        {[1, 2, 3].map((i) => (
          <li key={i} className="border-b border-ink/20 py-6 animate-pulse">
            <div className="h-5 w-3/4 bg-ink/10 mb-3" />
            <div className="h-3 w-full bg-ink/10 mb-1.5" />
            <div className="h-3 w-2/3 bg-ink/10" />
          </li>
        ))}
      </ol>
    )
  }

  if (error) {
    return (
      <div className="border border-ember/40 py-6 px-4 text-center">
        <p className="font-serif italic text-ember">{error}</p>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="border border-dashed border-ink/30 py-14 px-6 text-center">
        <p className="font-serif italic text-xl text-ink-muted">
          Nenhuma declaração recente catalogada.
        </p>
        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
          Monitoramento contínuo nos principais veículos
        </p>
      </div>
    )
  }

  return (
    <ol className="border-t border-ink/25">
      {items.map((item, i) => (
        <li key={item.id}>
          <article className="border-b border-ink/20 py-7 group">
            <div className="flex items-baseline gap-5">
              <span className="font-mono text-[11px] tabular-nums text-ink-soft tracking-[0.1em] w-8 shrink-0">
                {String(i + 1).padStart(2, '0')}
              </span>

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
                  <h4 className="font-serif text-xl md:text-2xl leading-snug tracking-[-0.01em] flex-1 min-w-[14rem] text-pretty">
                    {item.title}
                  </h4>
                  {item.hasContradiction && (
                    <span className="font-mono text-[10px] uppercase tracking-[0.22em] px-2 py-1 border border-ember/50 text-ember whitespace-nowrap">
                      § Contradição detectada
                    </span>
                  )}
                </div>

                <p className="font-serif italic text-[16px] md:text-[17px] leading-[1.65] text-ink-muted max-w-3xl text-pretty">
                  <span className="text-ember not-italic font-normal mr-1">
                    “
                  </span>
                  {item.summary}
                  <span className="text-ember not-italic font-normal ml-0.5">
                    ”
                  </span>
                </p>

                {item.hasContradiction && item.contradictionNote && (
                  <div className="mt-4 max-w-3xl border-t border-b border-ember/40 py-4 bg-ember/[0.03]">
                    <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ember mb-2">
                      Nota editorial
                    </p>
                    <p className="text-[14px] leading-relaxed text-ink-muted">
                      {item.contradictionNote}
                    </p>
                  </div>
                )}

                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mt-4 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
                  {item.topic && (
                    <span className="text-ink-muted">
                      {TOPIC_LABELS[item.topic] ?? item.topic}
                    </span>
                  )}
                  {item.topic && <span aria-hidden>·</span>}
                  <span className="tabular-nums">
                    {new Date(item.publishedAt).toLocaleDateString('pt-BR')}
                  </span>
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="focus-editorial ml-auto text-ember hover:underline underline-offset-4"
                  >
                    Ver fonte ↗
                  </a>
                </div>
              </div>
            </div>
          </article>
        </li>
      ))}
    </ol>
  )
}
