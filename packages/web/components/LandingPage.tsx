import Link from 'next/link'
import type { CandidateSeoReportItem } from '@/lib/types'
import { candidacyStatusPresentation } from '@/lib/candidacy'
import { JsonLd } from './JsonLd'
import {
  buildBreadcrumbList,
  buildEditorialWebPageSchema,
} from '@/lib/structured-data'

export function LandingPageFrame({
  path,
  eyebrow,
  title,
  description,
  intro,
  dateModified,
  children,
}: {
  path: string
  eyebrow: string
  title: string
  description: string
  intro: string
  dateModified?: string | null
  children: React.ReactNode
}) {
  return (
    <div className="paper-grain text-ink">
      <JsonLd data={buildBreadcrumbList([
        { name: 'Início', path: '/' },
        { name: title, path },
      ])} />
      <JsonLd data={buildEditorialWebPageSchema({
        path,
        name: title,
        description,
        ...(dateModified ? { dateModified } : {}),
      })} />
      <div className="border-y border-ink/25 bg-paper-light/60">
        <nav aria-label="Você está em" className="container mx-auto px-4 md:px-6 py-2.5 flex gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted">
          <Link href="/" className="hover:text-ember">§ Início</Link>
          <span aria-hidden>/</span>
          <span className="truncate text-ink">{title}</span>
        </nav>
      </div>
      <header className="container mx-auto px-4 md:px-6 pt-14 md:pt-20 pb-12 md:pb-16 border-b-2 border-ink">
        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-ember mb-5">
          <span className="inline-block w-8 h-px bg-ember align-middle mr-3" />
          {eyebrow}
        </p>
        <h1 className="font-serif text-4xl sm:text-6xl md:text-7xl leading-[0.96] tracking-[-0.02em] max-w-5xl text-balance">
          {title}
        </h1>
        <p className="mt-7 font-serif italic text-xl md:text-2xl leading-[1.55] text-ink-muted max-w-3xl text-pretty">
          {intro}
        </p>
        {dateModified && (
          <p className="mt-6 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-soft">
            Dados revisados até{' '}
            <time dateTime={dateModified}>
              {new Intl.DateTimeFormat('pt-BR', {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
                timeZone: 'America/Sao_Paulo',
              }).format(new Date(dateModified))}
            </time>
          </p>
        )}
      </header>
      {children}
    </div>
  )
}

export function CandidateLandingList({
  candidates,
  emptyMessage = 'Nenhum perfil reúne fontes suficientes para esta página.',
}: {
  candidates: CandidateSeoReportItem[]
  emptyMessage?: string
}) {
  if (candidates.length === 0) {
    return (
      <div className="border border-dashed border-ink/30 px-6 py-14 text-center">
        <p className="font-serif italic text-xl text-ink-muted">{emptyMessage}</p>
        <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-soft">
          A página permanece fora do índice até haver conteúdo qualificado.
        </p>
      </div>
    )
  }

  return (
    <ol className="border-t-2 border-ink">
      {candidates.map((candidate, index) => {
        const status = candidacyStatusPresentation(candidate.candidacyStatus)
        return (
          <li key={candidate.slug} className="border-b border-ink/20">
            <Link
              href={`/candidatos/${candidate.slug}`}
              className="group grid grid-cols-12 gap-4 items-baseline py-6 md:py-7 hover:bg-paper-light/70 focus-editorial"
            >
              <span className="col-span-2 md:col-span-1 font-mono text-[10px] tabular-nums tracking-[0.14em] text-ink-soft">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="col-span-10 md:col-span-5 font-serif text-2xl md:text-3xl group-hover:text-ember transition-colors">
                {candidate.name}
              </span>
              <span className="col-span-5 md:col-span-2 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted">
                {candidate.party} · {candidate.state}
              </span>
              <span className="col-span-6 md:col-span-3 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-muted">
                {status.label}
              </span>
              <span className="col-span-1 text-right text-ember" aria-hidden>→</span>
            </Link>
          </li>
        )
      })}
    </ol>
  )
}

export function latestMaterialUpdate(candidates: CandidateSeoReportItem[]): string | null {
  return candidates.reduce<string | null>((latest, candidate) => {
    if (!candidate.materialUpdatedAt) return latest
    if (!latest || Date.parse(candidate.materialUpdatedAt) > Date.parse(latest)) {
      return candidate.materialUpdatedAt
    }
    return latest
  }, null)
}
