import type { Metadata } from 'next'
import Link from 'next/link'
import { fetchCandidates } from '@/lib/api'
import { CandidateCard } from '@/components/CandidateCard'

interface Props {
  searchParams: { q?: string; position?: string; state?: string }
}

export function generateMetadata({ searchParams }: Props): Metadata {
  const q = searchParams.q ?? ''
  return {
    title: q ? `Busca: "${q}"` : 'Buscar Candidatos',
    description: 'Encontre candidatos a presidente ou governador por nome, partido ou estado.',
  }
}

const POSITIONS = [
  { value: '', label: 'Todos os cargos' },
  { value: 'PRESIDENTE', label: 'Presidente' },
  { value: 'GOVERNADOR', label: 'Governador' },
  { value: 'SENADOR', label: 'Senador' },
]

const STATES = [
  '', 'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO',
  'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ',
  'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
]

export default async function BuscaPage({ searchParams }: Props) {
  const { q = '', position = '', state = '' } = searchParams

  const params: Record<string, string> = { limit: '50' }
  if (q) params.q = q
  if (position) params.position = position
  if (state) params.state = state

  const res = await fetchCandidates(params).catch(() => ({ data: [], meta: null }))
  const candidates = res.data ?? []
  const total = (res as { meta?: { total?: number } }).meta?.total ?? candidates.length

  const hasFilters = Boolean(q || position || state)

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Buscar candidatos</h1>
      <p className="text-gray-500 text-sm mb-8">
        Encontre candidatos a presidente ou governador por nome, partido ou estado.
      </p>

      {/* Search form */}
      <form action="/busca" method="get" className="mb-8">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Buscar por nome ou partido…"
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-300"
          />

          <select
            name="position"
            defaultValue={position}
            className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-300 bg-white"
          >
            {POSITIONS.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>

          <select
            name="state"
            defaultValue={state}
            className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-300 bg-white"
          >
            <option value="">Todos os estados</option>
            {STATES.filter(Boolean).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <button
            type="submit"
            className="px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl text-sm transition-colors"
          >
            Buscar
          </button>
        </div>

        {hasFilters && (
          <div className="mt-3 flex items-center gap-3">
            <span className="text-xs text-gray-500">Filtros ativos:</span>
            {q && (
              <span className="inline-flex items-center gap-1 text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full">
                "{q}"
              </span>
            )}
            {position && (
              <span className="inline-flex items-center gap-1 text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full">
                {POSITIONS.find((p) => p.value === position)?.label}
              </span>
            )}
            {state && (
              <span className="inline-flex items-center gap-1 text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full">
                {state}
              </span>
            )}
            <Link href="/busca" className="text-xs text-gray-400 hover:text-red-500 underline">
              Limpar filtros
            </Link>
          </div>
        )}
      </form>

      {/* Results */}
      {candidates.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg font-medium text-gray-600 mb-2">
            {hasFilters ? 'Nenhum candidato encontrado' : 'Use os filtros acima para buscar candidatos'}
          </p>
          {hasFilters && (
            <p className="text-sm">
              Tente termos mais amplos ou{' '}
              <Link href="/busca" className="text-brand-600 hover:underline">
                limpe os filtros
              </Link>
              .
            </p>
          )}
          {!hasFilters && (
            <p className="text-sm mt-1">
              Ou veja os{' '}
              <Link href="/" className="text-brand-600 hover:underline">
                candidatos em destaque
              </Link>
              .
            </p>
          )}
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-500 mb-5">
            {total === candidates.length
              ? `${total} candidato${total !== 1 ? 's' : ''} encontrado${total !== 1 ? 's' : ''}`
              : `Exibindo ${candidates.length} de ${total} candidatos`}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {candidates.map((c) => (
              <CandidateCard key={c.id} {...c} />
            ))}
          </div>

          {total > candidates.length && (
            <p className="text-center text-xs text-gray-400 mt-8">
              Mostrando os primeiros {candidates.length} resultados. Refine sua busca para encontrar mais.
            </p>
          )}
        </>
      )}
    </div>
  )
}
