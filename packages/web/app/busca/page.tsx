import type { Metadata } from 'next'
import { fetchCandidates } from '@/lib/api'
import { BuscaClient } from '@/components/BuscaClient'

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
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO',
  'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ',
  'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
]

const STATE_OPTIONS = [
  { value: '', label: 'Todos' },
  ...STATES.map((s) => ({ value: s, label: s })),
]

export default async function BuscaPage({ searchParams }: Props) {
  const { q = '', position = '', state = '' } = searchParams

  const params: Record<string, string> = { limit: '50' }
  if (q) params.search = q
  if (position) params.position = position
  if (state) params.state = state

  const res = await fetchCandidates(params).catch(() => ({ data: [], meta: null }))
  const candidates = res.data ?? []
  const total = (res as { meta?: { total?: number } }).meta?.total ?? candidates.length

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 pt-8 pb-16">
      <header className="border-b-2 border-ink pb-4 mb-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft mb-2">
          § Índice de busca
        </p>
        <h1 className="font-serif text-4xl sm:text-5xl tracking-[-0.02em] text-balance">
          Buscar candidatos
        </h1>
        <p className="mt-2 font-serif italic text-ink-muted text-[15px] leading-relaxed">
          Encontre candidatos a presidente ou governador por nome, partido ou estado.
        </p>
      </header>

      <BuscaClient
        initialCandidates={candidates}
        initialTotal={total}
        initialQ={q}
        initialPosition={position}
        initialState={state}
        positionOptions={POSITIONS}
        stateOptions={STATE_OPTIONS}
      />
    </div>
  )
}
