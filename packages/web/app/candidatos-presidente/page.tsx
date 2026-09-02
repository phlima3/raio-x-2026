import type { Metadata } from 'next'
import {
  CandidateLandingList,
  LandingPageFrame,
  latestMaterialUpdate,
} from '@/components/LandingPage'
import { fetchCandidateSeoReport } from '@/lib/api'
import { filterQualifiedCandidates } from '@/lib/landing'
import type { CandidateSeoReportItem } from '@/lib/types'

import type { JSX } from "react";

const description =
  'Veja os candidatos à Presidência nas Eleições 2026 com situação eleitoral, partido, propostas, histórico e fontes.'

async function candidates(): Promise<CandidateSeoReportItem[]> {
  const report = await fetchCandidateSeoReport()
  return filterQualifiedCandidates(report.data, { position: 'PRESIDENTE' })
}

export async function generateMetadata(): Promise<Metadata> {
  const items = await candidates()
  return {
    title: 'Candidatos à Presidência em 2026',
    description,
    alternates: { canonical: '/candidatos-presidente' },
    robots: items.length > 0 ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { url: '/candidatos-presidente' },
  }
}

export default async function PresidentialCandidatesPage(): Promise<JSX.Element> {
  const items = await candidates()
  return (
    <LandingPageFrame
      path="/candidatos-presidente"
      eyebrow="Presidência da República"
      title="Candidatos à Presidência em 2026"
      description={description}
      intro="A lista reúne perfis montados a partir de dados oficiais do TSE, com a fonte citada em cada campo. Revisão humana só quando há texto editorial. A situação exibida diferencia pré-candidatura, escolha em convenção, pedido de registro e decisão da Justiça Eleitoral."
      dateModified={latestMaterialUpdate(items)}
    >
      <section className="container mx-auto px-4 md:px-6 py-14 md:py-20">
        <div className="mb-8 flex flex-wrap items-baseline justify-between gap-4">
          <h2 className="font-serif text-3xl md:text-5xl">Perfis qualificados</h2>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">{items.length} no índice</span>
        </div>
        <CandidateLandingList candidates={items} />
      </section>
    </LandingPageFrame>
  )
}
