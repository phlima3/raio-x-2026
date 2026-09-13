import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { fetchCandidate, fetchCandidates, isApiNotFound } from '@/lib/api'
import { Comparator } from '@/components/Comparator'
import { ComparePicker } from '@/components/ComparePicker'
import { raceOf } from '@/lib/comparisons'
import type { CandidateSummary } from '@/lib/types'

interface Props {
  searchParams: Promise<{
    a?: string
    b?: string
    topic?: string
    [key: string]: string | string[] | undefined
  }>
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const searchParams = await props.searchParams;
  const hasParameters = Object.keys(searchParams).length > 0

  return {
    title: 'Comparar Candidatos',
    description: 'Compare propostas e histórico de dois candidatos lado a lado.',
    alternates: { canonical: '/comparar' },
    robots: hasParameters
      ? { index: false, follow: true }
      : { index: true, follow: true },
    openGraph: { url: '/comparar' },
  }
}

/**
 * A disputa do primeiro escolhido, pelo slug da URL.
 *
 * Resolver pela ficha, e não procurando na listagem, é o que garante que o
 * candidato sempre seja encontrado: a listagem é paginada e o botão "comparar
 * lado a lado" da ficha manda qualquer slug para cá.
 */
async function fetchRaceOf(slug: string): Promise<{ position: string; state: string | null } | null> {
  try {
    const { data } = await fetchCandidate(slug)
    return raceOf(data)
  } catch (error) {
    if (isApiNotFound(error, `/api/candidates/${slug}`)) return null
    throw error
  }
}

/** O `limit` da API é limitado a 100, e são 194 governadores e 351 senadores. */
const PAGE_SIZE = 100

/**
 * Percorre as páginas de um cargo. Pedir uma fatia só deixava o catálogo
 * cortado em ES: quem quisesse comparar dois candidatos de SP não achava
 * nenhum dos dois na lista.
 */
async function fetchAllCandidates(params: Record<string, string>): Promise<CandidateSummary[]> {
  const todos: CandidateSummary[] = []
  for (let page = 1; ; page++) {
    const { data, meta } = await fetchCandidates({
      ...params,
      page: String(page),
      limit: String(PAGE_SIZE),
    })
    todos.push(...data)
    if (data.length === 0 || todos.length >= (meta?.total ?? todos.length)) break
  }
  return todos
}

export default async function CompararPage(props: Props) {
  const searchParams = await props.searchParams;
  const { a, b, topic } = searchParams

  // Escolhido o primeiro, o segundo sai da disputa dele — e não de uma fatia
  // do catálogo. São 194 governadores e 351 senadores; as fatias de 50 e 100
  // paravam em ES, então quem chegasse pelo botão da ficha de um candidato de
  // SP não encontrava nenhum adversário legítimo na lista.
  const selectedRace = a ? await fetchRaceOf(a) : null

  const pools = selectedRace
    ? [{
      position: selectedRace.position,
      ...(selectedRace.state ? { state: selectedRace.state } : {}),
    }]
    : [{ position: 'PRESIDENTE' }, { position: 'GOVERNADOR' }, { position: 'SENADOR' }]

  const resultados = await Promise.allSettled(pools.map((p) => fetchAllCandidates(p)))
  const allCandidates = resultados.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))

  const bothSelected = Boolean(a && b)
  const nameOf = (slug: string) => allCandidates.find((c) => c.slug === slug)?.name ?? slug

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 pt-8 pb-16">
      <header className="border-b-2 border-ink pb-5 mb-8">
        <h1 className="font-serif text-4xl sm:text-5xl tracking-[-0.02em] text-balance">
          Comparar candidatos
        </h1>
        <p className="mt-3 text-ink-muted text-base leading-relaxed max-w-[60ch]">
          Escolha dois candidatos da mesma disputa para ver as propostas de cada um, lado a lado.
        </p>
        <Link
          href="/comparacoes"
          className="focus-editorial mt-3 inline-block text-sm text-ember underline underline-offset-4"
        >
          Comparações com revisão editorial
        </Link>
      </header>

      {!bothSelected && (
        <ComparePicker candidates={allCandidates} selectedA={a} selectedB={b} />
      )}

      {bothSelected && (
        <>
          <div className="flex items-baseline justify-between gap-4 flex-wrap border-b border-ink/15 pb-3 mb-6">
            <p className="text-base text-ink-muted">
              <span className="text-ink font-medium">{nameOf(a!)}</span>
              <span className="mx-2">e</span>
              <span className="text-ink font-medium">{nameOf(b!)}</span>
            </p>
            <Link
              href="/comparar"
              className="focus-editorial text-sm text-ember underline underline-offset-4"
            >
              Trocar seleção
            </Link>
          </div>

          <Suspense fallback={<ComparatorSkeleton />}>
            <Comparator candidateSlugA={a!} candidateSlugB={b!} topic={topic} />
          </Suspense>
        </>
      )}
    </div>
  )
}

function ComparatorSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8 mb-8">
        <div className="border-b-2 border-ink/10 pb-4 space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-ink/10" />
            <div className="space-y-2 flex-1">
              <div className="h-5 bg-ink/10 w-2/3" />
              <div className="h-3 bg-ink/[0.06] w-1/3" />
            </div>
          </div>
        </div>
        <div className="border-b-2 border-ink/10 pb-4 space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-ink/10" />
            <div className="space-y-2 flex-1">
              <div className="h-5 bg-ink/10 w-2/3" />
              <div className="h-3 bg-ink/[0.06] w-1/3" />
            </div>
          </div>
        </div>
      </div>
      <div className="flex gap-4 border-b border-ink/10 pb-2 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-4 bg-ink/[0.06] w-20" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="h-6 bg-ink/10 w-3/4" />
          <div className="h-4 bg-ink/[0.06] w-full" />
          <div className="h-4 bg-ink/[0.06] w-5/6" />
        </div>
        <div className="space-y-6">
          <div className="h-6 bg-ink/10 w-3/4" />
          <div className="h-4 bg-ink/[0.06] w-full" />
          <div className="h-4 bg-ink/[0.06] w-5/6" />
        </div>
      </div>
    </div>
  )
}

