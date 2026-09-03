import { notFound, permanentRedirect } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import type { CandidateDetail } from '@/lib/types'
import {
  fetchCandidate,
  fetchCandidateConsistency,
  fetchCandidateNews,
  fetchCandidateSeoQualification,
  fetchCandidateSeoReport,
  isApiNotFound,
} from '@/lib/api'
import { ProposalsSection } from '@/components/ProposalsSection'
import { TransparencyPanel } from '@/components/TransparencyPanel'
import { ConsistencyPanel } from '@/components/ConsistencyPanel'
import { NewsPanel } from '@/components/NewsPanel'
import { SectionNav } from '@/components/SectionNav'
import { absoluteImageUrl, canonicalUrl, renderableImageUrl } from '@/lib/seo'
import { bioProvenance, candidacyStatusPresentation, opensAsDownload } from '@/lib/candidacy'
import { JsonLd } from '@/components/JsonLd'
import {
  buildBreadcrumbList,
  buildCandidateWebPageSchema,
} from '@/lib/structured-data'

import type { JSX } from "react";

interface Props {
  params: Promise<{ slug: string }>
}

const POSITION_LABELS: Record<string, string> = {
  PRESIDENTE: 'Presidente da República',
  SENADOR: 'Senador(a) Federal',
  DEPUTADO_FEDERAL: 'Deputado(a) Federal',
  GOVERNADOR: 'Governador(a)',
}

export const revalidate = 3600

/**
 * So a disputa presidencial e pre-renderizada no build.
 *
 * `dynamicParams` continua ligado: as demais fichas sao geradas na primeira
 * visita e ficam em cache pelo mesmo `revalidate`. Nada sai do indice por isso
 * -- o sitemap e montado do relatorio de qualidade, nao desta lista.
 *
 * Pre-renderizar todas custava uma requisicao a API por ficha, em rajada. Com
 * a trilha de fonte oficial isso passou de poucas dezenas para 510, estourou o
 * limite de requisicoes da API e derrubou o build inteiro no 429. O build nao
 * deve depender da vazao da API para terminar.
 */
export async function generateStaticParams(): Promise<Array<{ slug: string }>> {
  const report = await fetchCandidateSeoReport()
  return report.data
    .filter((candidate) => candidate.indexable && candidate.position === 'PRESIDENTE')
    .map((candidate) => ({ slug: candidate.slug }))
}

const STATUS_TONES = {
  neutral: 'border-ink/30 text-ink-muted',
  attention: 'border-amber-700/50 text-amber-900',
  verified: 'border-emerald-800/50 text-emerald-900',
  closed: 'border-ember/50 text-ember',
} as const

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(date)
}

/**
 * Frase do card de compartilhamento, montada do que a ficha realmente tem.
 *
 * Só entra número que existe: prometer "0 propostas" é pior que não citar
 * proposta nenhuma.
 */
function resumoSocial(c: CandidateDetail): string {
  const fatos: string[] = []
  const propostas = c.proposals?.length ?? 0
  if (propostas > 0) {
    fatos.push(`${propostas} ${propostas === 1 ? 'proposta extraída' : 'propostas extraídas'} do plano de governo`)
  }
  const recebido = Number(c.campaignFinancings?.[0]?.totalReceived)
  if (Number.isFinite(recebido) && recebido > 0) {
    fatos.push(
      `${recebido.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        maximumFractionDigits: 0,
      })} declarados em campanha`,
    )
  }
  const votacoes = c.votingRecords?.length ?? 0
  if (votacoes > 0) fatos.push(`${votacoes} votações registradas`)

  const cabeca = `${c.name} (${c.party}-${c.state}) nas Eleições 2026.`
  if (fatos.length === 0) return `${cabeca} Situação da candidatura e fontes oficiais.`
  return `${cabeca} ${fatos.join(', ')}. Cada dado com a fonte no TSE.`
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;
  try {
    const [res, qualification] = await Promise.all([
      fetchCandidate(params.slug),
      fetchCandidateSeoQualification(params.slug),
    ])
    const c = res.data
    const canonicalPath = `/candidatos/${c.slug}`
    const socialImage = canonicalUrl(`/candidatos/${c.slug}/opengraph-image`)
    return {
      title: `${c.name}: propostas, partido e histórico`,
      description: `Veja quem é ${c.name} (${c.party}-${c.state}), sua situação nas Eleições 2026, propostas, histórico de votações, patrimônio e fontes oficiais.`,
      alternates: { canonical: canonicalPath },
      robots: qualification?.indexable
        ? { index: true, follow: true }
        : { index: false, follow: true },
      openGraph: {
        title: `${c.name} — Raio-X 2026`,
        // Texto que o leitor ve no card compartilhado. Cita o que esta ficha
        // tem de concreto, em vez da mesma frase para as 519 candidaturas:
        // "Propostas, votacoes e dados de transparencia de X" nao diferencia
        // nada e nao da motivo para abrir.
        description: resumoSocial(c),
        url: canonicalPath,
        images: [{ url: socialImage, alt: `Raio-X eleitoral de ${c.name}` }],
      },
      twitter: {
        card: 'summary_large_image',
        images: [socialImage],
      },
    }
  } catch (error) {
    if (!isApiNotFound(error, `/api/candidates/${params.slug}`)) throw error
    return {
      title: `Candidato — ${params.slug}`,
      description: 'Perfil completo, propostas e dados de transparência.',
      robots: { index: false, follow: true },
    }
  }
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

export default async function CandidatePage(props: Props): Promise<JSX.Element> {
  const params = await props.params;
  let candidate
  try {
    const res = await fetchCandidate(params.slug)
    candidate = res.data
  } catch (error) {
    if (!isApiNotFound(error, `/api/candidates/${params.slug}`)) throw error
    notFound()
  }

  if (candidate.slug !== params.slug) {
    permanentRedirect(`/candidatos/${candidate.slug}`)
  }

  const [qualification, consistencyResult, newsResult] = await Promise.all([
    fetchCandidateSeoQualification(candidate.slug),
    fetchCandidateConsistency(candidate.slug, { compute: false }).catch(() => ({
      success: false,
      data: [],
    })),
    fetchCandidateNews(candidate.slug).catch(() => ({ success: false, data: [] })),
  ])

  // Consistência cruza proposta com voto no Congresso: quem não exerce mandato
  // parlamentar nunca terá esse dado — 12 dos 13 presidenciáveis. Declarações
  // dependem do rastreio de imprensa. Mostrar a seção vazia com um botão de
  // "gerar análise" que não tem o que cruzar promete o que o site não entrega.
  const hasVotingRecord = (candidate.votingRecords?.length ?? 0) > 0
  const hasNews = newsResult.data.length > 0
  const sections = [
    { id: 'propostas', label: 'Propostas' },
    ...(hasVotingRecord ? [{ id: 'consistencia', label: 'Consistência' }] : []),
    ...(hasNews ? [{ id: 'declaracoes', label: 'Declarações' }] : []),
    { id: 'transparencia', label: 'Transparência' },
  ].map((section, index) => ({
    ...section,
    roman: ['I', 'II', 'III', 'IV'][index],
  }))
  const roman = (id: string) => sections.find((s) => s.id === id)?.roman ?? ''

  const initials = initialsFor(candidate.name)
  // O JSON-LD precisa da URL absoluta; a tag <img> tem de apontar para a
  // origem que serve o arquivo, senão a foto do `public/` só carrega em prod.
  // O expediente não pode anunciar revisão que não houve: a ficha de fonte
  // oficial é derivada do registro no TSE, campo a campo, sem redação humana.
  const revisadoPorPessoa = Boolean(candidate.editorialReviewer?.trim())
  const photoUrl = renderableImageUrl(candidate.photoUrl)
  const photoSchemaUrl = absoluteImageUrl(candidate.photoUrl)
  const officeLabel =
    POSITION_LABELS[candidate.position] ?? candidate.position
  const status = candidacyStatusPresentation(candidate.candidacyStatus)
  const statusVerifiedAt = formatDate(candidate.candidacyStatusVerifiedAt)
  const materialUpdatedAt = formatDate(candidate.materialUpdatedAt)
  const reviewedAt = formatDate(candidate.reviewedAt)
  const description = `Veja quem é ${candidate.name} (${candidate.party}-${candidate.state}), sua situação nas Eleições 2026, propostas, histórico de votações, patrimônio e fontes oficiais.`

  return (
    <div className="paper-grain text-ink">
      <JsonLd
        data={buildBreadcrumbList([
          { name: 'Início', path: '/' },
          { name: candidate.name, path: `/candidatos/${candidate.slug}` },
        ])}
      />
      <JsonLd
        data={buildCandidateWebPageSchema({
          name: candidate.name,
          slug: candidate.slug,
          description,
          image: photoSchemaUrl,
          dateModified: candidate.materialUpdatedAt,
        })}
      />
      {/* ——— Top strip — breadcrumb + marker ——— */}
      <div className="border-y border-ink/25 bg-paper-light/60">
        <div className="container mx-auto px-4 md:px-6 py-2.5 flex items-center justify-between gap-4 font-mono text-[10px] md:text-[11px] uppercase tracking-[0.22em] text-ink-muted">
          <nav aria-label="Você está em" className="flex items-center gap-2 min-w-0">
            <Link
              href="/"
              className="focus-editorial hover:text-ember transition-colors"
            >
              § Arquivo
            </Link>
            <span aria-hidden className="text-ink-soft">
              /
            </span>
            <span className="truncate text-ink">Perfil eleitoral</span>
          </nav>
          <span className="hidden sm:inline text-ink-soft whitespace-nowrap">
            Dossiê · Ed. Nº 01
          </span>
        </div>
      </div>

      {/* ——— Masthead editorial ——— */}
      <section className="container mx-auto px-4 md:px-6 pt-12 md:pt-16 pb-10">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-ember mb-6 md:mb-8">
          <span className="inline-block w-8 h-px bg-ember align-middle mr-3" />
          {officeLabel}
        </p>

        <div className="grid grid-cols-12 gap-x-6 md:gap-x-10 gap-y-8">
          {/* Foto — morph target */}
          <div className="col-span-12 md:col-span-4 lg:col-span-3">
            <figure
              className="relative aspect-[4/5] w-full max-w-[280px] md:max-w-none mx-auto md:mx-0 bg-ember/10 border border-ink/25 overflow-hidden"
              style={{ viewTransitionName: `photo-${params.slug}` }}
            >
              {photoUrl ? (
                <Image
                  src={photoUrl}
                  alt={candidate.name}
                  fill
                  sizes="(max-width: 768px) 280px, 25vw"
                  className="object-cover"
                  priority
                  unoptimized
                />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center font-serif text-5xl text-ember">
                  {initials}
                </span>
              )}
              {candidate.isIncumbent && (
                <span className="absolute top-0 left-0 bg-ink text-paper font-mono text-[9px] uppercase tracking-[0.22em] px-2 py-1">
                  Incumbente
                </span>
              )}
              {photoUrl && (
                <figcaption className="absolute inset-x-0 bottom-0 bg-ink/85 px-2 py-1.5 font-mono text-[8px] uppercase tracking-[0.14em] text-paper">
                  {candidate.photoSourceUrl ? (
                    <a
                      href={candidate.photoSourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                    >
                      Foto: fonte registrada ↗
                    </a>
                  ) : (
                    'Foto: crédito em revisão'
                  )}
                  {candidate.photoLicense ? ` · ${candidate.photoLicense}` : ''}
                </figcaption>
              )}
            </figure>

            <dl className="mt-5 space-y-4 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted">
              <div>
                <dt className="text-ink-muted">Partido</dt>
                <dd className="mt-1 font-serif text-lg normal-case tracking-normal text-ink">
                  {candidate.party}
                </dd>
              </div>
              <div>
                <dt className="text-ink-muted">Estado</dt>
                <dd className="mt-1 font-serif text-lg normal-case tracking-normal text-ink">
                  {candidate.state}
                </dd>
              </div>
              {candidate.ballotNumber != null && (
                <div>
                  <dt className="text-ink-muted">Número</dt>
                  <dd className="mt-1 font-serif text-lg normal-case tracking-normal text-ink tabular-nums">
                    {candidate.ballotNumber}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-ink-muted">Situação eleitoral</dt>
                <dd className="mt-2 normal-case tracking-normal">
                  <span
                    className={`inline-block border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] ${STATUS_TONES[status.tone]}`}
                  >
                    {status.label}
                  </span>
                  <p className="mt-2 text-xs leading-relaxed text-ink-muted">
                    {status.description}
                  </p>
                  {candidate.candidacyStatusSourceUrl && statusVerifiedAt ? (
                    <a
                      href={candidate.candidacyStatusSourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-block font-mono text-[9px] uppercase tracking-[0.14em] text-ember hover:underline"
                    >
                      {/* O rótulo depende do endereço, e não da fonte: a página da
                          candidatura abre para leitura, o pacote do catálogo cai
                          na pasta de downloads. */}
                      {opensAsDownload(candidate.candidacyStatusSourceUrl)
                        ? 'Baixar fonte'
                        : 'Ver fonte'}{' '}
                      · verificada em {statusVerifiedAt} ↗
                    </a>
                  ) : (
                    <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.14em] text-ember">
                      Fonte e verificação pendentes
                    </p>
                  )}
                </dd>
              </div>
              {candidate.coalitionName && (
                <div>
                  <dt className="text-ink-muted">Coligação</dt>
                  <dd className="mt-1 font-serif text-base normal-case tracking-normal text-ink-muted italic">
                    {candidate.coalitionName}
                  </dd>
                </div>
              )}
              {candidate.runningMateName && (
                <div>
                  <dt className="text-ink-muted">Vice na chapa</dt>
                  <dd className="mt-1 font-serif text-base normal-case tracking-normal text-ink">
                    {candidate.runningMateName}
                    {candidate.runningMateParty ? ` · ${candidate.runningMateParty}` : ''}
                  </dd>
                  {candidate.runningMateSourceUrl && (
                    <a
                      href={candidate.runningMateSourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-block font-mono text-[9px] uppercase tracking-[0.14em] text-ember hover:underline"
                    >
                      {opensAsDownload(candidate.runningMateSourceUrl)
                        ? 'Baixar fonte da composição da chapa'
                        : 'Ver fonte da composição da chapa'}{' '}
                      ↗
                    </a>
                  )}
                </div>
              )}
            </dl>
          </div>

          {/* Nome + pull-quote + CTA */}
          <div className="col-span-12 md:col-span-8 lg:col-span-9">
            <h1
              className="font-serif font-normal text-4xl sm:text-6xl md:text-7xl lg:text-[5.5rem] leading-[0.95] tracking-[-0.02em] text-balance"
              style={{ viewTransitionName: `name-${params.slug}` }}
            >
              {candidate.name}
            </h1>

            {candidate.bioSummary || candidate.bio ? (
              <div className="mt-8 md:mt-10 max-w-2xl">
                <blockquote>
                <p className="font-serif italic text-xl md:text-2xl leading-[1.5] text-ink-muted text-pretty">
                  <span className="text-ember not-italic font-normal mr-1">
                    “
                  </span>
                  {candidate.bioSummary ?? candidate.bio}
                  <span className="text-ember not-italic font-normal ml-0.5">
                    ”
                  </span>
                </p>
                </blockquote>
                {candidate.bioSummary && (
                  <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-soft">
                    {bioProvenance(candidate.bioSourceUrl) === 'registro_oficial' ? (
                      <>
                        Ficha do registro no TSE ·{' '}
                        {candidate.bioSourceUrl ? (
                          <a
                            href={candidate.bioSourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-ember hover:underline"
                          >
                            conferir na fonte
                          </a>
                        ) : (
                          'fonte oficial'
                        )}
                      </>
                    ) : (
                      <>
                        Síntese assistida por IA ·{' '}
                        {reviewedAt ? `revisada em ${reviewedAt}` : 'revisão humana pendente'}
                      </>
                    )}{' '}
                    ·{' '}
                    <Link href="/politica-editorial" className="text-ember hover:underline">
                      política editorial
                    </Link>
                  </p>
                )}
              </div>
            ) : null}

            {candidate.bio && candidate.bioSummary && candidate.bio !== candidate.bioSummary && (
              <details className="mt-5 group max-w-2xl">
                <summary className="focus-editorial list-none cursor-pointer font-mono text-[11px] uppercase tracking-[0.22em] text-ember hover:underline pb-0.5 inline-block border-b border-transparent hover:border-ember">
                  <span className="group-open:hidden">§ Ler biografia completa</span>
                  <span className="hidden group-open:inline">× Fechar</span>
                </summary>
                <p className="mt-4 text-[15px] leading-[1.75] text-ink-muted text-pretty">
                  {candidate.bio}
                </p>
              </details>
            )}

            {(candidate.partyHistory?.length ?? 0) > 1 && (
              <details className="mt-5 group max-w-2xl">
                <summary className="focus-editorial list-none cursor-pointer font-mono text-[11px] uppercase tracking-[0.22em] text-ink-muted hover:text-ember pb-0.5 inline-block border-b border-transparent hover:border-ember">
                  <span className="group-open:hidden">▸ Histórico partidário</span>
                  <span className="hidden group-open:inline">▾ Ocultar histórico</span>
                </summary>
                <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.22em] text-ink-muted">
                  {candidate.partyHistory.join(' → ')}
                </p>
              </details>
            )}

            {/* CTAs */}
            <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 font-mono text-[11px] uppercase tracking-[0.2em]">
              <Link
                href={`/comparar?a=${candidate.slug}`}
                className="focus-editorial group bg-ink text-paper px-5 py-3 hover:bg-ember transition-colors inline-flex items-center gap-2"
              >
                <span>Comparar lado a lado</span>
                <span
                  aria-hidden
                  className="transition-transform group-hover:translate-x-1"
                >
                  →
                </span>
              </Link>
              {candidate.siteUrl && (
                <a
                  href={candidate.siteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="focus-editorial text-ink-muted hover:text-ember border-b border-transparent hover:border-ember pb-0.5 transition-colors"
                >
                  Site oficial ↗
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Sticky mini-TOC */}
      <SectionNav sections={sections} />

      {/* ——— Seção I — Propostas ——— */}
      <section
        id="propostas"
        aria-labelledby="s-propostas"
        className="cv-auto"
      >
        <div className="container mx-auto px-4 md:px-6 py-16 md:py-20">
          <header className="mb-10 md:mb-12">
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-ember mb-4">
              <span className="inline-block w-8 h-px bg-ember align-middle mr-3" />
              Seção {roman('propostas')}
            </p>
            <h2
              id="s-propostas"
              className="font-serif text-3xl md:text-5xl leading-[0.98] tracking-[-0.015em]"
            >
              Propostas
              {(candidate.proposals?.length ?? 0) > 0 && (
                <span className="ml-3 font-mono text-sm uppercase tracking-[0.2em] text-ink-soft tabular-nums align-middle">
                  ({candidate.proposals.length})
                </span>
              )}
            </h2>
            <p className="mt-3 font-serif italic text-ink-muted text-[15px] md:text-base max-w-xl">
              Plataforma declarada, agrupada por tema. Fontes atribuídas em cada entrada.
            </p>
          </header>
          <ProposalsSection proposals={candidate.proposals ?? []} />
        </div>
      </section>

      {/* ——— Consistência — renderizada só quando há o que mostrar ——— */}
      {hasVotingRecord && (
        <section
          id="consistencia"
          aria-labelledby="s-consistencia"
          className="border-t border-ink/25 cv-auto"
        >
          <div className="container mx-auto px-4 md:px-6 py-16 md:py-20">
            <header className="mb-10 md:mb-12">
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-ember mb-4">
                <span className="inline-block w-8 h-px bg-ember align-middle mr-3" />
                Seção {roman('consistencia')}
              </p>
              <h2
                id="s-consistencia"
                className="font-serif text-3xl md:text-5xl leading-[0.98] tracking-[-0.015em]"
              >
                Consistência
              </h2>
              <p className="mt-3 font-serif italic text-ink-muted text-[15px] md:text-base max-w-xl text-pretty">
                Cruzamento entre o que o candidato <em>propõe</em> e como{' '}
                <em>vota</em> no Congresso. Síntese por IA, com contradições sinalizadas.
              </p>
            </header>
            <ConsistencyPanel
              candidateSlug={candidate.slug}
              initialScores={consistencyResult.data}
            />
          </div>
        </section>
      )}

      {/* ——— Declarações — renderizada só quando há o que mostrar ——— */}
      {hasNews && (
        <section
          id="declaracoes"
          aria-labelledby="s-declaracoes"
          className="border-t border-ink/25 cv-auto"
        >
          <div className="container mx-auto px-4 md:px-6 py-16 md:py-20">
            <header className="mb-10 md:mb-12">
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-ember mb-4">
                <span className="inline-block w-8 h-px bg-ember align-middle mr-3" />
                Seção {roman('declaracoes')}
              </p>
              <h2
                id="s-declaracoes"
                className="font-serif text-3xl md:text-5xl leading-[0.98] tracking-[-0.015em]"
              >
                Declarações recentes
              </h2>
              <p className="mt-3 font-serif italic text-ink-muted text-[15px] md:text-base max-w-xl">
                Posições públicas rastreadas em veículos de imprensa. Checadas contra propostas.
              </p>
            </header>
            <NewsPanel candidateSlug={candidate.slug} initialItems={newsResult.data} />
          </div>
        </section>
      )}

      {/* ——— Seção IV — Transparência ——— */}
      <section
        id="transparencia"
        aria-labelledby="s-transparencia"
        className="border-t border-ink/25 cv-auto"
      >
        <div className="container mx-auto px-4 md:px-6 py-16 md:py-24">
          <header className="mb-10 md:mb-12">
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-ember mb-4">
              <span className="inline-block w-8 h-px bg-ember align-middle mr-3" />
              Seção {roman('transparencia')}
            </p>
            <h2
              id="s-transparencia"
              className="font-serif text-3xl md:text-5xl leading-[0.98] tracking-[-0.015em]"
            >
              Transparência
            </h2>
            <p className="mt-3 font-serif italic text-ink-muted text-[15px] md:text-base max-w-xl">
              Votações, patrimônio declarado e financiamento de campanha — fonte oficial TSE/Congresso.
            </p>
          </header>
          <TransparencyPanel
            candidateSlug={candidate.slug}
            initialData={{
              voting: candidate.votingRecords ?? [],
              assets: candidate.assetDeclarations ?? [],
              financing: candidate.campaignFinancings?.[0] ?? null,
            }}
          />
        </div>
      </section>

      <section className="border-t-2 border-ink bg-paper-dark/40">
        <div className="container mx-auto px-4 md:px-6 py-12 md:py-16">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-ember">
                Expediente do perfil
              </p>
              <p className="mt-3 font-serif text-xl">
                {revisadoPorPessoa
                  ? 'Revisão editorial concluída'
                  : qualification?.indexable
                    ? 'Ficha de fonte oficial'
                    : 'Fora do índice'}
              </p>
            </div>
            <dl className="space-y-3 text-sm text-ink-muted">
              <div>
                <dt className="font-mono text-[9px] uppercase tracking-[0.18em]">Autoria</dt>
                <dd className="mt-1">
                  {candidate.editorialAuthor ?? 'Ficha derivada do registro no TSE'}
                </dd>
              </div>
              <div>
                <dt className="font-mono text-[9px] uppercase tracking-[0.18em]">Revisão</dt>
                <dd className="mt-1">{candidate.editorialReviewer ?? 'Sem revisão humana'}</dd>
              </div>
              <div>
                <dt className="font-mono text-[9px] uppercase tracking-[0.18em]">Atualização material</dt>
                <dd className="mt-1">{materialUpdatedAt ?? 'Não registrada'}</dd>
              </div>
            </dl>
            <nav aria-label="Confiança editorial" className="flex flex-col items-start gap-3 font-mono text-[10px] uppercase tracking-[0.18em]">
              <Link href="/metodologia" className="hover:text-ember hover:underline">Metodologia →</Link>
              <Link href="/fontes" className="hover:text-ember hover:underline">Fontes utilizadas →</Link>
              <Link href="/correcoes" className="hover:text-ember hover:underline">Contestar ou corrigir →</Link>
              <Link href="/changelog" className="hover:text-ember hover:underline">Histórico de mudanças →</Link>
            </nav>
          </div>
        </div>
      </section>
    </div>
  )
}
