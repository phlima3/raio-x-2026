import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
  CandidateLandingList,
  LandingPageFrame,
  latestMaterialUpdate,
} from '@/components/LandingPage'
import { fetchCandidateSeoReport } from '@/lib/api'
import { BRAZIL_STATES, filterQualifiedCandidates } from '@/lib/landing'
import type { CandidateSeoReportItem } from '@/lib/types'

import type { JSX } from "react";

interface Props { params: Promise<{ uf: string }> }

export const dynamicParams = false
export const revalidate = 900

export function generateStaticParams() {
  return Object.keys(BRAZIL_STATES).map((uf) => ({ uf: uf.toLowerCase() }))
}

interface StatePageData {
  code: string
  stateName: string
  candidates: CandidateSeoReportItem[]
}

async function pageData(uf: string): Promise<StatePageData | null> {
  const code = uf.toUpperCase()
  const stateName = BRAZIL_STATES[code]
  if (!stateName) return null
  const report = await fetchCandidateSeoReport()
  return {
    code,
    stateName,
    candidates: filterQualifiedCandidates(report.data, { position: 'SENADOR', state: code }),
  }
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;
  const data = await pageData(params.uf)
  if (!data) return { robots: { index: false, follow: false } }
  const title = `Candidatos ao Senado por ${data.stateName} em 2026`
  const description = `Conheça os candidatos ao Senado por ${data.stateName} em 2026, suas propostas, trajetória, situação eleitoral e fontes.`
  return {
    title,
    description,
    alternates: { canonical: `/senador/${data.code.toLowerCase()}` },
    robots: data.candidates.length > 0 ? { index: true, follow: true } : { index: false, follow: true },
  }
}

export default async function SenatorPage(props: Props): Promise<JSX.Element> {
  const params = await props.params;
  const data = await pageData(params.uf)
  if (!data) notFound()
  const title = `Candidatos ao Senado por ${data.stateName} em 2026`
  return (
    <LandingPageFrame path={`/senador/${data.code.toLowerCase()}`} eyebrow={`Senado Federal · ${data.code}`} title={title} description={`Perfis qualificados da disputa ao Senado por ${data.stateName}.`} intro={`Consulte os nomes acompanhados para o Senado em ${data.stateName}. Páginas incompletas ou ainda sem revisão não entram nesta seleção.`} dateModified={latestMaterialUpdate(data.candidates)}>
      <section className="container mx-auto px-4 md:px-6 py-14 md:py-20">
        <CandidateLandingList candidates={data.candidates} />
      </section>
    </LandingPageFrame>
  )
}
