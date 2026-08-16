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

interface Props { params: { uf: string } }

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
    candidates: filterQualifiedCandidates(report.data, { position: 'GOVERNADOR', state: code }),
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await pageData(params.uf)
  if (!data) return { robots: { index: false, follow: false } }
  const title = `Candidatos a governador de ${data.stateName} em 2026`
  const description = `Compare os candidatos ao governo de ${data.stateName} nas Eleições 2026: situação eleitoral, propostas, partido, histórico e fontes.`
  return {
    title,
    description,
    alternates: { canonical: `/governador/${data.code.toLowerCase()}` },
    robots: data.candidates.length > 0 ? { index: true, follow: true } : { index: false, follow: true },
  }
}

export default async function GovernorPage({ params }: Props): Promise<JSX.Element> {
  const data = await pageData(params.uf)
  if (!data) notFound()
  const path = `/governador/${data.code.toLowerCase()}`
  const title = `Candidatos a governador de ${data.stateName} em 2026`
  const description = `Perfis qualificados da disputa pelo governo de ${data.stateName}, com propostas e fontes.`
  return (
    <LandingPageFrame path={path} eyebrow={`Governo estadual · ${data.code}`} title={title} description={description} intro={`Acompanhe os nomes da disputa em ${data.stateName}. Só entram nesta lista perfis com status documentado, revisão editorial e conteúdo substantivo apoiado por fontes.`} dateModified={latestMaterialUpdate(data.candidates)}>
      <section className="container mx-auto px-4 md:px-6 py-14 md:py-20">
        <CandidateLandingList candidates={data.candidates} />
      </section>
    </LandingPageFrame>
  )
}
