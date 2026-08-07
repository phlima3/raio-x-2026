import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
  CandidateLandingList,
  LandingPageFrame,
  latestMaterialUpdate,
} from '@/components/LandingPage'
import { fetchCandidateSeoReport } from '@/lib/api'
import {
  filterQualifiedCandidates,
  LANDING_THEMES,
  type LandingThemeSlug,
} from '@/lib/landing'

interface Props { params: { tema: string } }

export const dynamicParams = false
export const revalidate = 900

export function generateStaticParams() {
  return Object.keys(LANDING_THEMES).map((tema) => ({ tema }))
}

async function pageData(slug: string) {
  const theme = LANDING_THEMES[slug as LandingThemeSlug]
  if (!theme) return null
  const report = await fetchCandidateSeoReport()
  return {
    slug: slug as LandingThemeSlug,
    theme,
    candidates: filterQualifiedCandidates(report.data, { topic: slug }),
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await pageData(params.tema)
  if (!data) return { robots: { index: false, follow: false } }
  const title = `Propostas dos candidatos sobre ${data.theme.label} em 2026`
  const description = `${data.theme.description} Compare perfis qualificados, contexto e fontes para as Eleições 2026.`
  return {
    title,
    description,
    alternates: { canonical: `/temas/${data.slug}` },
    robots: data.candidates.length > 0 ? { index: true, follow: true } : { index: false, follow: true },
  }
}

export default async function ThemePage({ params }: Props) {
  const data = await pageData(params.tema)
  if (!data) notFound()
  const title = `Propostas dos candidatos sobre ${data.theme.label} em 2026`
  return (
    <LandingPageFrame path={`/temas/${data.slug}`} eyebrow="Temas da eleição" title={title} description={data.theme.description} intro={`${data.theme.description} A seleção abaixo inclui somente perfis aprovados pelo gate e com conteúdo catalogado neste tema.`} dateModified={latestMaterialUpdate(data.candidates)}>
      <section className="container mx-auto px-4 md:px-6 py-14 md:py-20">
        <div className="mb-10 max-w-3xl border-l-2 border-ember pl-5 text-[15px] leading-[1.75] text-ink-muted">
          Esta página organiza posições documentadas; ela não presume equivalência entre propostas nem produz recomendação de voto. Abra cada perfil para conferir o texto e a fonte original.
        </div>
        <CandidateLandingList candidates={data.candidates} emptyMessage="Ainda não há perfis revisados com propostas qualificadas neste tema." />
      </section>
    </LandingPageFrame>
  )
}
