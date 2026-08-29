import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { JsonLd } from '@/components/JsonLd'
import {
  EDITORIAL_COMPARISONS,
  findEditorialComparison,
  isEditorialComparisonReady,
  type EditorialComparison,
} from '@/lib/comparisons'
import { fetchCandidateSeoQualification } from '@/lib/api'
import { buildBreadcrumbList, buildEditorialWebPageSchema } from '@/lib/structured-data'

import type { JSX } from "react";

interface Props { params: Promise<{ pair: string }> }

export const dynamicParams = false

export function generateStaticParams() {
  return EDITORIAL_COMPARISONS.filter(isEditorialComparisonReady).map((comparison) => ({
    pair: comparison.slug,
  }))
}

async function eligibility(
  pair: string,
): Promise<{ comparison: EditorialComparison; indexable: boolean } | null> {
  const comparison = findEditorialComparison(pair)
  if (!comparison || !isEditorialComparisonReady(comparison)) return null
  const [candidateA, candidateB] = await Promise.all([
    fetchCandidateSeoQualification(comparison.candidateA),
    fetchCandidateSeoQualification(comparison.candidateB),
  ])
  return { comparison, indexable: Boolean(candidateA?.indexable && candidateB?.indexable) }
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;
  const data = await eligibility(params.pair)
  if (!data) return { robots: { index: false, follow: false } }
  return {
    title: data.comparison.title,
    description: data.comparison.description,
    alternates: { canonical: `/comparacoes/${data.comparison.slug}` },
    robots: data.indexable ? { index: true, follow: true } : { index: false, follow: true },
  }
}

export default async function EditorialComparisonPage(props: Props): Promise<JSX.Element> {
  const params = await props.params;
  const data = await eligibility(params.pair)
  if (!data) notFound()
  const { comparison } = data
  const path = `/comparacoes/${comparison.slug}`
  return (
    <article className="paper-grain text-ink">
      <JsonLd data={buildBreadcrumbList([
        { name: 'Início', path: '/' },
        { name: 'Comparações', path: '/comparacoes' },
        { name: comparison.title, path },
      ])} />
      <JsonLd data={buildEditorialWebPageSchema({ path, name: comparison.title, description: comparison.description, dateModified: comparison.updatedAt })} />
      <header className="container mx-auto px-4 md:px-6 py-16 md:py-24 border-b-2 border-ink">
        <Link href="/comparacoes" className="font-mono text-[10px] uppercase tracking-[0.18em] text-ember">§ Comparações</Link>
        <h1 className="mt-6 font-serif text-4xl md:text-7xl leading-[0.96] tracking-[-0.02em] max-w-5xl">{comparison.title}</h1>
        <p className="mt-8 font-serif italic text-xl leading-[1.6] text-ink-muted max-w-3xl">{comparison.introduction}</p>
      </header>
      <div className="container mx-auto px-4 md:px-6 py-14 md:py-20">
        <ol className="border-t-2 border-ink">
          {comparison.differences.map((difference, index) => (
            <li key={difference.theme} className="border-b border-ink/20 py-8 grid grid-cols-12 gap-5">
              <span className="col-span-2 md:col-span-1 font-mono text-[10px] text-ink-soft">{String(index + 1).padStart(2, '0')}</span>
              <div className="col-span-10 md:col-span-10">
                <h2 className="font-serif text-3xl">{difference.theme}</h2>
                <p className="mt-4 text-[16px] leading-[1.75] text-ink-muted">{difference.summary}</p>
                <div className="mt-4 flex flex-wrap gap-4 font-mono text-[9px] uppercase tracking-[0.14em]">
                  {difference.sourceUrls.map((url, sourceIndex) => (
                    <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="text-ember hover:underline">Fonte {sourceIndex + 1} ↗</a>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-10 flex flex-wrap gap-4">
          <Link href={`/candidatos/${comparison.candidateA}`} className="border border-ink px-4 py-3 font-mono text-[10px] uppercase tracking-[0.16em] hover:bg-ink hover:text-paper">Perfil A →</Link>
          <Link href={`/candidatos/${comparison.candidateB}`} className="border border-ink px-4 py-3 font-mono text-[10px] uppercase tracking-[0.16em] hover:bg-ink hover:text-paper">Perfil B →</Link>
          <Link href={`/comparar?a=${comparison.candidateA}&b=${comparison.candidateB}`} className="bg-ink text-paper px-4 py-3 font-mono text-[10px] uppercase tracking-[0.16em] hover:bg-ember">Explorar dados no comparador →</Link>
        </div>
        <p className="mt-10 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-soft">Autoria: {comparison.author} · Revisão: {comparison.reviewer}</p>
      </div>
    </article>
  )
}
