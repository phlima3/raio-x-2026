import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { Suspense } from 'react'
import { fetchCandidates } from '@/lib/api'
import { Comparator } from '@/components/Comparator'
import type { CandidateSummary } from '@/lib/types'

interface Props {
  searchParams: {
    a?: string
    b?: string
    topic?: string
    [key: string]: string | string[] | undefined
  }
}

export function generateMetadata({ searchParams }: Props): Metadata {
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

export default async function CompararPage({ searchParams }: Props) {
  const { a, b, topic } = searchParams

  const [presidentsRes, governorsRes, senatorsRes] = await Promise.allSettled([
    fetchCandidates({ position: 'PRESIDENTE', limit: '20' }),
    fetchCandidates({ position: 'GOVERNADOR', limit: '50' }),
    fetchCandidates({ position: 'SENADOR', limit: '100' }),
  ])

  const presidents = presidentsRes.status === 'fulfilled' ? presidentsRes.value.data : []
  const governors = governorsRes.status === 'fulfilled' ? governorsRes.value.data : []
  const senators = senatorsRes.status === 'fulfilled' ? senatorsRes.value.data : []
  const allCandidates = [...presidents, ...governors, ...senators]

  const bothSelected = Boolean(a && b)

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 pt-8 pb-16">
      <header className="border-b-2 border-ink pb-4 mb-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft mb-2">
          § Comparativo
        </p>
        <h1 className="font-serif text-4xl sm:text-5xl tracking-[-0.02em] text-balance">
          Comparar candidatos
        </h1>
        <p className="mt-2 font-serif italic text-ink-muted text-[15px] leading-relaxed">
          Selecione dois candidatos para ver propostas, divergências e um resumo gerado por IA.
        </p>
        <Link
          href="/comparacoes"
          className="mt-4 inline-block font-mono text-[10px] uppercase tracking-[0.16em] text-ember hover:underline"
        >
          Ver comparações com revisão editorial →
        </Link>
      </header>

      {!bothSelected && (
        <CandidatePicker candidates={allCandidates} selectedA={a} selectedB={b} />
      )}

      {bothSelected && (
        <>
          <div className="flex items-center justify-between border-b border-ink/15 pb-3 mb-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted">
              Comparando{' '}
              <span className="text-ink font-medium">{a}</span>
              <span className="mx-2 text-ink-soft">vs</span>
              <span className="text-ink font-medium">{b}</span>
            </p>
            <Link
              href="/comparar"
              className="font-mono text-[10px] uppercase tracking-[0.14em] text-ember hover:border-b hover:border-ember transition-colors"
            >
              ← Trocar seleção
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

interface CandidatePickerProps {
  candidates: CandidateSummary[]
  selectedA?: string
  selectedB?: string
}

function initialsFor(name: string): string {
  return name
    .split(' ')
    .filter((w) => w.length > 2)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

function CandidatePicker({ candidates, selectedA, selectedB }: CandidatePickerProps) {
  if (candidates.length === 0) {
    return (
      <div className="py-20 text-center border-t border-dashed border-ink/20">
        <p className="font-serif text-2xl text-ink-muted italic">
          Nenhum candidato encontrado no banco de dados.
        </p>
        <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft">
          Aguarde a próxima sincronização oficial ou consulte o runbook de operação
        </p>
      </div>
    )
  }

  const selected = [selectedA, selectedB].filter(Boolean) as string[]
  const step = selected.length

  return (
    <div>
      <div className="border-t border-b border-ink/20 py-3 mb-6 flex items-center gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
          {step === 0 && 'Passo 1 de 2 — Selecione o primeiro candidato'}
          {step === 1 && 'Passo 2 de 2 — Selecione o segundo candidato'}
        </span>
        {step > 0 && (
          <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.14em] text-ember">
            {step}/2 selecionado{step > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Selected preview strip */}
      {step > 0 && (
        <div className="flex items-center flex-wrap gap-4 sm:gap-6 mb-6 pb-5 border-b border-dashed border-ink/15">
          {selectedA && (
            <SelectedBadge
              candidate={candidates.find((c) => c.slug === selectedA)}
              label="A"
              removeHref={selectedB ? `/comparar?a=${selectedB}` : '/comparar'}
            />
          )}
          {step === 1 && (
            <span className="font-serif text-2xl text-ink-soft italic">vs</span>
          )}
          {selectedB && (
            <SelectedBadge
              candidate={candidates.find((c) => c.slug === selectedB)}
              label="B"
              removeHref={`/comparar?a=${selectedA}`}
            />
          )}
        </div>
      )}

      {/* Candidate grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8">
        {candidates.map((c, i) => {
          const isSelected = selected.includes(c.slug)
          const href = buildPickerHref(c.slug, selectedA, selectedB)

          return (
            <a
              key={c.id}
              href={href}
              className={
                'group block border-b border-ink/15 pb-5 pt-4 px-2 transition-colors ' +
                (isSelected
                  ? 'bg-ember/[0.05]'
                  : 'hover:bg-paper-light/50')
              }
            >
              <span className="font-mono text-[10px] tracking-[0.18em] text-ink-soft tabular-nums mb-2 block">
                {String(i + 1).padStart(2, '0')}
              </span>

              <div className="flex items-start gap-3">
                <div
                  className={
                    'relative w-12 h-12 rounded-full overflow-hidden border shrink-0 ' +
                    (isSelected
                      ? 'border-ember bg-ember/10'
                      : 'border-ink/15 bg-ember/10')
                  }
                >
                  {c.photoUrl ? (
                    <Image
                      src={c.photoUrl}
                      alt={c.name}
                      fill
                      sizes="48px"
                      className={
                        'object-cover transition-all duration-500 ' +
                        (isSelected ? '' : 'grayscale contrast-110 group-hover:grayscale-0')
                      }
                      unoptimized
                    />
                  ) : (
                    <span className="flex items-center justify-center w-full h-full font-serif text-base text-ember">
                      {initialsFor(c.name)}
                    </span>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className={
                    'font-serif text-lg leading-tight tracking-[-0.01em] transition-colors line-clamp-2 ' +
                    (isSelected ? 'text-ember' : 'group-hover:text-ember')
                  }>
                    {c.name}
                  </h3>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                    {c.party} · {c.state}
                  </p>
                </div>

                {isSelected && (
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ember border border-ember/40 px-2 py-0.5 shrink-0">
                    ✓
                  </span>
                )}
              </div>
            </a>
          )
        })}
      </div>
    </div>
  )
}

function SelectedBadge({
  candidate,
  label,
  removeHref,
}: {
  candidate?: CandidateSummary
  label: string
  removeHref: string
}) {
  if (!candidate) return null
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
        {label}
      </span>
      <div className="relative w-10 h-10 rounded-full overflow-hidden border border-ink/20 bg-ember/10 shrink-0">
        {candidate.photoUrl ? (
          <Image
            src={candidate.photoUrl}
            alt={candidate.name}
            fill
            sizes="40px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <span className="flex items-center justify-center w-full h-full font-serif text-sm text-ember">
            {initialsFor(candidate.name)}
          </span>
        )}
      </div>
      <div className="min-w-0">
        <p className="font-serif text-base leading-tight">{candidate.name}</p>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
          {candidate.party}
        </p>
      </div>
      <a
        href={removeHref}
        className="focus-editorial font-mono text-sm text-ink-soft hover:text-ember transition-colors ml-1 p-1.5 -m-1.5 min-w-[44px] min-h-[44px] flex items-center justify-center"
        aria-label={`Remover ${candidate.name}`}
      >
        ×
      </a>
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
