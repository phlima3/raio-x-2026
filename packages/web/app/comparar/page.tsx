import type { Metadata } from 'next'
import { Suspense } from 'react'
import { fetchCandidates } from '@/lib/api'
import { CandidateCard } from '@/components/CandidateCard'
import { Comparator } from '@/components/Comparator'
import type { CandidateSummary } from '@/lib/types'

export const metadata: Metadata = {
  title: 'Comparar Candidatos',
  description: 'Compare propostas e histórico de dois candidatos lado a lado.',
}

interface Props {
  searchParams: { a?: string; b?: string; topic?: string }
}

export default async function CompararPage({ searchParams }: Props) {
  const { a, b, topic } = searchParams

  // Fetch all presidents + governors for the picker
  const [presidentsRes, governorsRes] = await Promise.allSettled([
    fetchCandidates({ position: 'PRESIDENTE', limit: '20' }),
    fetchCandidates({ position: 'GOVERNADOR', limit: '50' }),
  ])

  const presidents = presidentsRes.status === 'fulfilled' ? presidentsRes.value.data : []
  const governors = governorsRes.status === 'fulfilled' ? governorsRes.value.data : []
  const allCandidates = [...presidents, ...governors]

  const bothSelected = Boolean(a && b)

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Comparar candidatos</h1>
      <p className="text-gray-500 text-sm mb-8">
        Selecione dois candidatos para ver propostas, divergências e um resumo gerado por IA.
      </p>

      {!bothSelected && (
        <CandidatePicker candidates={allCandidates} selectedA={a} selectedB={b} />
      )}

      {bothSelected && (
        <>
          {/* Change selection link */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">
              Comparando <strong>{a}</strong> vs <strong>{b}</strong>
            </p>
            <a
              href="/comparar"
              className="text-xs text-brand-600 hover:text-brand-800 font-medium"
            >
              ← Trocar seleção
            </a>
          </div>

          <Suspense fallback={<div className="text-gray-400 text-sm py-8 text-center">Carregando comparação…</div>}>
            <Comparator candidateSlugA={a!} candidateSlugB={b!} topic={topic} />
          </Suspense>
        </>
      )}
    </div>
  )
}

// ── Candidate picker (server component) ───────────────────────────────────────

interface CandidatePickerProps {
  candidates: CandidateSummary[]
  selectedA?: string
  selectedB?: string
}

function CandidatePicker({ candidates, selectedA, selectedB }: CandidatePickerProps) {
  if (candidates.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p>Nenhum candidato encontrado no banco de dados.</p>
        <p className="text-sm mt-1">Execute <code className="bg-gray-100 px-1 rounded">pnpm db:seed</code> para popular os dados.</p>
      </div>
    )
  }

  const selected = [selectedA, selectedB].filter(Boolean) as string[]

  return (
    <div>
      {selected.length === 0 && (
        <div className="bg-brand-50 border border-brand-100 rounded-xl p-4 mb-6 text-sm text-brand-800">
          Clique em um candidato para selecioná-lo. Selecione dois para comparar.
        </div>
      )}
      {selected.length === 1 && (
        <div className="bg-brand-50 border border-brand-100 rounded-xl p-4 mb-6 text-sm text-brand-800">
          Ótimo! Agora selecione o segundo candidato para comparar.
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {candidates.map((c) => {
          const isSelected = selected.includes(c.slug)
          const href = buildPickerHref(c.slug, selectedA, selectedB)

          return (
            <a
              key={c.id}
              href={href}
              className={`block rounded-xl border-2 transition-all ${
                isSelected
                  ? 'border-brand-500 ring-2 ring-brand-200'
                  : 'border-transparent hover:border-gray-200'
              }`}
            >
              <CandidateCard {...c} />
              {isSelected && (
                <div className="text-center text-xs text-brand-700 font-medium py-1 bg-brand-50 rounded-b-xl -mt-1">
                  ✓ Selecionado
                </div>
              )}
            </a>
          )
        })}
      </div>
    </div>
  )
}

function buildPickerHref(slug: string, selectedA?: string, selectedB?: string): string {
  if (!selectedA) return `/comparar?a=${slug}`
  if (!selectedB && slug !== selectedA) return `/comparar?a=${selectedA}&b=${slug}`
  if (slug === selectedA) return selectedB ? `/comparar?a=${selectedB}` : '/comparar'
  if (slug === selectedB) return `/comparar?a=${selectedA}`
  return `/comparar?a=${selectedA}&b=${slug}`
}
