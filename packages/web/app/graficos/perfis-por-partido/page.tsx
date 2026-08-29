import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { JsonLd } from '@/components/JsonLd'
import { fetchCandidateSeoReport, fetchCandidateStats } from '@/lib/api'
import { canonicalUrl } from '@/lib/seo'
import { buildBreadcrumbList } from '@/lib/structured-data'

import type { JSX } from "react";

const PATH = '/graficos/perfis-por-partido'
const TITLE = 'Perfis monitorados por partido nas Eleições 2026'
const DESCRIPTION =
  'Gráfico reutilizável com os partidos mais presentes no catálogo do Raio-X 2026, metodologia e fonte.'

export const revalidate = 3600

interface GraphData {
  stats: Awaited<ReturnType<typeof fetchCandidateStats>>['data']
  report: Awaited<ReturnType<typeof fetchCandidateSeoReport>>
  entries: Array<[string, number]>
  latestMaterialUpdate: string | null
  ready: boolean
}

async function loadGraphData(): Promise<GraphData> {
  const [stats, report] = await Promise.all([
    fetchCandidateStats(),
    fetchCandidateSeoReport(),
  ])
  const entries = Object.entries(stats.data.byParty)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))
    .slice(0, 10)
  const materialDates = report.data
    .map((candidate) => candidate.materialUpdatedAt)
    .filter((value): value is string => Boolean(value))
    .map((value) => Date.parse(value))
    .filter(Number.isFinite)
  const latestMaterialUpdate = materialDates.length
    ? new Date(Math.max(...materialDates)).toISOString()
    : null

  return {
    stats: stats.data,
    report,
    entries,
    latestMaterialUpdate,
    ready: stats.data.total > 0 && report.meta.indexable > 0,
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const { ready } = await loadGraphData()
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: PATH },
    robots: ready
      ? { index: true, follow: true }
      : { index: false, follow: true },
    openGraph: {
      title: `${TITLE} — Raio-X 2026`,
      description: DESCRIPTION,
      url: PATH,
      images: [{ url: `${PATH}/imagem`, width: 1200, height: 630 }],
    },
  }
}

function formatDate(value: string | null): string {
  if (!value) return 'atualização material em revisão'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(value))
}

export default async function PartyProfilesGraphPage(): Promise<JSX.Element> {
  const { stats, entries, latestMaterialUpdate, ready } = await loadGraphData()
  const maximum = Math.max(...entries.map(([, count]) => count), 1)
  const imageUrl = canonicalUrl(`${PATH}/imagem`)
  const pageUrl = canonicalUrl(PATH)
  const embedCode = `<a href="${pageUrl}"><img src="${imageUrl}" alt="Perfis monitorados por partido nas Eleições 2026 — Raio-X 2026" width="1200" height="630"></a>`

  return (
    <article className="paper-grain text-ink">
      <JsonLd
        data={buildBreadcrumbList([
          { name: 'Início', path: '/' },
          { name: 'Dados', path: '/dados' },
          { name: 'Perfis por partido', path: PATH },
        ])}
      />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Dataset',
          name: TITLE,
          description: DESCRIPTION,
          url: pageUrl,
          creator: { '@id': canonicalUrl('/#organization') },
          isPartOf: { '@id': canonicalUrl('/#website') },
          ...(latestMaterialUpdate ? { dateModified: latestMaterialUpdate } : {}),
          distribution: {
            '@type': 'DataDownload',
            encodingFormat: 'image/png',
            contentUrl: imageUrl,
          },
        }}
      />

      <div className="border-y border-ink/25 bg-paper-light/60">
        <nav
          aria-label="Você está em"
          className="container mx-auto px-4 md:px-6 py-2.5 flex gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted"
        >
          <Link href="/" className="hover:text-ember">§ Início</Link>
          <span aria-hidden>/</span>
          <Link href="/dados" className="hover:text-ember">Dados</Link>
          <span aria-hidden>/</span>
          <span className="text-ink">Perfis por partido</span>
        </nav>
      </div>

      <header className="container mx-auto px-4 md:px-6 pt-16 md:pt-24 pb-14 border-b border-ink/25">
        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-ember mb-5">
          <span className="inline-block w-8 h-px bg-ember align-middle mr-3" />
          Gráfico citável · Eleições 2026
        </p>
        <h1 className="font-serif text-4xl sm:text-6xl md:text-7xl leading-[0.96] tracking-[-0.02em] max-w-5xl text-balance">
          Perfis monitorados por partido
        </h1>
        <p className="mt-8 font-serif italic text-xl md:text-2xl leading-[1.55] text-ink-muted max-w-3xl text-pretty">
          Uma fotografia do catálogo editorial do Raio-X 2026 — não uma lista
          oficial de candidaturas registradas.
        </p>
      </header>

      <div className="container mx-auto px-4 md:px-6 py-14 md:py-20 grid grid-cols-12 gap-x-10 gap-y-12">
        <section className="col-span-12 lg:col-span-8" aria-labelledby="grafico-titulo">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-ink pb-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ember mb-2">
                Top 10 do catálogo
              </p>
              <h2 id="grafico-titulo" className="font-serif text-3xl md:text-4xl">
                Quantidade de perfis
              </h2>
            </div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted">
              Base total: {stats.total.toLocaleString('pt-BR')} perfis
            </p>
          </div>

          {entries.length > 0 ? (
            <ol className="mt-8 space-y-5">
              {entries.map(([party, count], index) => (
                <li key={party} className="grid grid-cols-[2rem_minmax(5rem,9rem)_1fr_3rem] items-center gap-3">
                  <span className="font-mono text-[10px] tabular-nums text-ink-soft">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="font-mono text-xs uppercase tracking-[0.12em] truncate" title={party}>
                    {party}
                  </span>
                  <span className="h-5 bg-ink/10" aria-hidden>
                    <span
                      className="block h-full bg-ember"
                      style={{ width: `${Math.max((count / maximum) * 100, 2)}%` }}
                    />
                  </span>
                  <strong className="font-serif text-xl text-right tabular-nums">{count}</strong>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-8 border border-dashed border-ink/30 p-8 font-serif italic text-xl text-ink-muted">
              O catálogo ainda não possui dados suficientes para publicar o gráfico.
            </p>
          )}

          <div className="mt-12 border-t border-ink/20 pt-5 text-sm leading-relaxed text-ink-muted">
            <p>
              <strong className="text-ink">Leitura:</strong> cada unidade representa um perfil
              canônico monitorado no catálogo. Uma pessoa com registros duplicados é contada uma
              vez. A classificação partidária acompanha a edição canônica vigente.
            </p>
            <p className="mt-3">
              <strong className="text-ink">Fonte:</strong>{' '}
              <Link href="/dados" className="text-ember underline underline-offset-4">API do Raio-X 2026</Link>
              {' '}· atualização material mais recente: {formatDate(latestMaterialUpdate)}.
            </p>
            <p className="mt-3">
              Situação de registro deve ser confirmada na Justiça Eleitoral. Consulte também a{' '}
              <Link href="/metodologia" className="text-ember underline underline-offset-4">metodologia</Link>
              {' '}e as <Link href="/fontes" className="text-ember underline underline-offset-4">fontes</Link>.
            </p>
            {!ready && (
              <p className="mt-3 font-medium text-ember">
                Publicação em revisão: nenhum perfil passou integralmente pelo gate editorial.
              </p>
            )}
          </div>
        </section>

        <aside className="col-span-12 lg:col-span-4 lg:border-l lg:border-ink/20 lg:pl-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ember mb-4">
            Reutilização
          </p>
          <h2 className="font-serif text-3xl">Imagem pronta para incorporar</h2>
          <Image
            src={`${PATH}/imagem`}
            alt="Prévia do gráfico de perfis monitorados por partido"
            width={1200}
            height={630}
            unoptimized
            className="mt-6 w-full h-auto border border-ink/20"
          />
          <p className="mt-5 text-sm leading-relaxed text-ink-muted">
            A imagem é atualizada com o catálogo. Preserve o link, o crédito e a ressalva de que os
            números não equivalem ao registro oficial de candidaturas.
          </p>
          <pre className="mt-5 overflow-x-auto whitespace-pre-wrap break-all bg-ink text-paper p-4 text-[10px] leading-relaxed">
            <code>{embedCode}</code>
          </pre>
          <a
            href={`${PATH}/imagem`}
            className="mt-5 inline-block font-mono text-[10px] uppercase tracking-[0.18em] text-ember underline underline-offset-4"
          >
            Abrir PNG em 1200 × 630 →
          </a>
        </aside>
      </div>
    </article>
  )
}
