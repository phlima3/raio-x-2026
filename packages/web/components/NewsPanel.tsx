'use client'

import { useState, useEffect } from 'react'
import type { NewsItem } from '@/lib/types'

const TOPIC_LABELS: Record<string, string> = {
  economy:    'Economia',
  security:   'Segurança',
  environment:'Meio Ambiente',
  education:  'Educação',
  health:     'Saúde',
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
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
            <div className="h-3 bg-gray-100 rounded w-full mb-1" />
            <div className="h-3 bg-gray-100 rounded w-2/3" />
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return <p className="text-red-600 text-sm">{error}</p>
  }

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-dashed border-gray-200 p-8 text-center text-gray-400 text-sm">
        Nenhuma declaração recente encontrada.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <article
          key={item.id}
          className={`bg-white rounded-xl border p-4 transition-colors ${
            item.hasContradiction
              ? 'border-red-200 bg-red-50/30'
              : 'border-gray-100'
          }`}
        >
          <div className="flex flex-wrap items-start gap-2 mb-1">
            <h4 className="font-semibold text-gray-900 text-sm leading-snug flex-1">
              {item.title}
            </h4>
            {item.hasContradiction && (
              <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium whitespace-nowrap flex-shrink-0">
                Contradição detectada
              </span>
            )}
          </div>

          <p className="text-sm text-gray-600 leading-relaxed mb-2">{item.summary}</p>

          {item.hasContradiction && item.contradictionNote && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-2 leading-relaxed">
              {item.contradictionNote}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400 mt-2 pt-2 border-t border-gray-100">
            {item.topic && (
              <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                {TOPIC_LABELS[item.topic] ?? item.topic}
              </span>
            )}
            <span>{new Date(item.publishedAt).toLocaleDateString('pt-BR')}</span>
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-brand-500 hover:text-brand-700 font-medium"
            >
              Ver fonte ↗
            </a>
          </div>
        </article>
      ))}
    </div>
  )
}
