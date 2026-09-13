import type { Metadata } from 'next'
import Link from 'next/link'
import { LandingPageFrame, latestMaterialUpdate } from '@/components/LandingPage'
import { fetchCandidateProposals, fetchCandidateSeoReport } from '@/lib/api'
import { candidacyStatusPresentation } from '@/lib/candidacy'
import { filterQualifiedCandidates } from '@/lib/landing'
import type { CandidateSeoReportItem, Proposal } from '@/lib/types'

import type { JSX } from "react";

const title = 'Propostas de todos os candidatos à Presidência em 2026'

const description =
  'Propostas de todos os candidatos a presidente em 2026, resumidas por tema — economia, saúde, educação, segurança e meio ambiente — com partido, situação no TSE e link para o plano de governo de cada um.'

// A ordem dos temas é a mesma dos planos de governo e das landings /temas.
// Quem tem menos temas cobertos completa com o que houver, até o teto.
const THEME_ORDER = ['Economia', 'Saúde', 'Educação', 'Segurança', 'Meio Ambiente']
const PROPOSALS_PER_CANDIDATE = 5

interface CandidateWithProposals {
  candidate: CandidateSeoReportItem
  highlights: Proposal[]
  total: number
  planUrl: string | null
}

function pickHighlights(byCategory: Record<string, Proposal[]>): Proposal[] {
  const picked: Proposal[] = []
  for (const theme of THEME_ORDER) {
    const first = byCategory[theme]?.[0]
    if (first) picked.push(first)
  }
  for (const [category, list] of Object.entries(byCategory)) {
    if (picked.length >= PROPOSALS_PER_CANDIDATE) break
    if (THEME_ORDER.includes(category)) continue
    if (list[0]) picked.push(list[0])
  }
  return picked.slice(0, PROPOSALS_PER_CANDIDATE)
}

async function candidates(): Promise<CandidateWithProposals[]> {
  const report = await fetchCandidateSeoReport()
  const qualified = filterQualifiedCandidates(report.data, { position: 'PRESIDENTE' })
  return Promise.all(
    qualified.map(async (candidate) => {
      // Ficha sem proposta ainda entra na lista: a página é sobre todos os
      // candidatos, e o leitor precisa saber que aquele não registrou plano.
      const byCategory = await fetchCandidateProposals(candidate.slug)
        .then((response) => response.data)
        .catch(() => ({}) as Record<string, Proposal[]>)
      const all = Object.values(byCategory).flat()
      return {
        candidate,
        highlights: pickHighlights(byCategory),
        total: all.length,
        planUrl: all.find((p) => p.source === 'tse_program' && p.url)?.url ?? null,
      }
    }),
  )
}

export async function generateMetadata(): Promise<Metadata> {
  const items = await candidates()
  return {
    title,
    description,
    alternates: { canonical: '/candidatos-presidente' },
    robots: items.length > 0 ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { url: '/candidatos-presidente' },
  }
}

export default async function PresidentialCandidatesPage(): Promise<JSX.Element> {
  const items = await candidates()
  const aiExtracted = items.some((item) =>
    item.highlights.some((proposal) => proposal.origin === 'AI_EXTRACTION'),
  )
  return (
    <LandingPageFrame
      path="/candidatos-presidente"
      eyebrow="Presidência da República"
      title={title}
      description={description}
      intro={`As propostas de todos os candidatos a presidente em 2026 reunidas numa página só: ${items.length} candidaturas com perfil qualificado, cada uma com o que propõe em economia, saúde, educação, segurança e meio ambiente, a fonte de cada afirmação e o link para o plano de governo registrado no TSE.`}
      dateModified={latestMaterialUpdate(items.map((item) => item.candidate))}
    >
      <section className="container mx-auto px-4 md:px-6 py-14 md:py-20">
        {items.length === 0 ? (
          <div className="border border-dashed border-ink/30 px-6 py-14 text-center">
            <p className="font-serif italic text-xl text-ink-muted">
              Nenhum perfil reúne fontes suficientes para esta página.
            </p>
          </div>
        ) : (
          <>
            <nav
              aria-label="Candidatos nesta página"
              className="mb-10 flex flex-wrap gap-x-5 gap-y-2 border-y border-ink/20 py-3 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted"
            >
              {items.map(({ candidate }) => (
                <a
                  key={candidate.slug}
                  href={`#${candidate.slug}`}
                  className="focus-editorial border-b border-transparent py-1 hover:border-ember hover:text-ember"
                >
                  {candidate.name}
                </a>
              ))}
            </nav>

            {aiExtracted && (
              <p className="mb-12 max-w-2xl border-l-2 border-amber-800/50 py-1 pl-4 text-[15px] leading-[1.65] text-ink-muted text-pretty">
                Parte destas propostas foi <strong className="font-medium text-ink">resumida por IA</strong> a
                partir do plano de governo que cada candidato registrou no TSE, sem revisão humana item a item.
                Cada ficha traz o link para o documento oficial — em caso de dúvida, ele é que vale.
              </p>
            )}

            <div className="border-t-2 border-ink">
              {items.map(({ candidate, highlights, total, planUrl }, index) => {
                const status = candidacyStatusPresentation(candidate.candidacyStatus)
                return (
                  <article
                    key={candidate.slug}
                    id={candidate.slug}
                    className="scroll-mt-24 grid gap-6 border-b border-ink/20 py-10 md:grid-cols-12 md:py-12"
                  >
                    <header className="md:col-span-4">
                      <span className="font-mono text-[10px] tabular-nums tracking-[0.14em] text-ink-soft">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <h2 className="mt-2 font-serif text-3xl leading-tight md:text-4xl">
                        <Link
                          href={`/candidatos/${candidate.slug}`}
                          className="focus-editorial hover:text-ember transition-colors"
                        >
                          {candidate.name}
                        </Link>
                      </h2>
                      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted">
                        {candidate.party} · {status.label}
                      </p>
                    </header>

                    <div className="md:col-span-8">
                      {highlights.length === 0 ? (
                        <p className="font-serif italic text-lg text-ink-muted">
                          Nenhuma proposta com fonte verificada para esta candidatura ainda.
                        </p>
                      ) : (
                        <ul className="divide-y divide-ink/15 border-y border-ink/15">
                          {highlights.map((proposal) => (
                            <li key={proposal.id} className="py-4">
                              <span className="block font-mono text-[10px] uppercase tracking-[0.22em] text-ember">
                                {proposal.category ?? 'Outros'}
                              </span>
                              <p className="mt-1.5 font-serif text-lg leading-snug text-pretty md:text-xl">
                                {proposal.title}
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}
                      <p className="mt-5 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[10px] uppercase tracking-[0.22em]">
                        <Link
                          href={`/candidatos/${candidate.slug}#propostas`}
                          className="focus-editorial text-ember hover:underline underline-offset-4"
                        >
                          {total > highlights.length
                            ? `Todas as ${total} propostas →`
                            : 'Ver a ficha completa →'}
                        </Link>
                        {planUrl && (
                          <a
                            href={planUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="focus-editorial text-ink-muted hover:text-ember"
                          >
                            Plano de governo no TSE ↗
                          </a>
                        )}
                      </p>
                    </div>
                  </article>
                )
              })}
            </div>
          </>
        )}
      </section>
    </LandingPageFrame>
  )
}
