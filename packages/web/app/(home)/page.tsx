import Link from 'next/link'
import type { Metadata } from 'next'
import {
  fetchCandidates,
  fetchCandidateSeoReport,
  fetchCandidateStats,
} from '@/lib/api'
import { StatTicker } from '@/components/StatTicker'
import {
  PresidentialIndex,
  type PresidentialCandidate,
} from '@/components/PresidentialIndex'
import { CommandPalette } from '@/components/CommandPalette'

export const revalidate = 900

export const metadata: Metadata = {
  alternates: { canonical: '/' },
  openGraph: { url: '/' },
}

const ELECTION_DATE = new Date('2026-10-04T00:00:00-03:00')

function daysUntilElection(): number {
  const diff = ELECTION_DATE.getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / 86_400_000))
}

function formatLongDate(d: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(d)
}

export default async function HomePage() {
  // 100 é o teto aceito por /api/candidates. A disputa presidencial cabe
  // inteira nesse limite; a paleta de comandos é um atalho de navegação e a
  // busca completa vive em /busca.
  const [presidentsRes, statsRes, allRes, qualityReport] = await Promise.allSettled([
    fetchCandidates({ position: 'PRESIDENTE', limit: '100' }),
    fetchCandidateStats(),
    fetchCandidates({ limit: '100' }),
    fetchCandidateSeoReport(),
  ])

  const presidents: PresidentialCandidate[] =
    presidentsRes.status === 'fulfilled' ? presidentsRes.value.data : []
  const stats = statsRes.status === 'fulfilled' ? statsRes.value.data : null
  const paletteItems =
    allRes.status === 'fulfilled'
      ? allRes.value.data.map((candidate) => ({
          id: candidate.id,
          slug: candidate.slug,
          name: candidate.name,
          party: candidate.party,
          state: candidate.state,
        }))
      : []

  const daysLeft = daysUntilElection()
  const seoReport = qualityReport.status === 'fulfilled' ? qualityReport.value.data : []
  const latestUpdate = seoReport.reduce<Date | null>((latest, candidate) => {
    if (!candidate.materialUpdatedAt) return latest
    const candidateDate = new Date(candidate.materialUpdatedAt)
    if (Number.isNaN(candidateDate.getTime())) return latest
    return !latest || candidateDate > latest ? candidateDate : latest
  }, null)
  const publishedAt = latestUpdate ? formatLongDate(latestUpdate) : null

  const statItems = stats
    ? [
        { n: stats.total, label: 'Candidatos catalogados' },
        {
          n: Object.keys(stats.byParty).length,
          label: 'Partidos representados',
        },
        {
          n: Object.keys(stats.byState).length,
          label: 'Unidades federativas',
        },
        {
          n: stats.byPosition['PRESIDENTE'] ?? 0,
          label: 'Nomes à presidência',
        },
      ]
    : []

  return (
    <div className="paper-grain text-ink">
      {/* ——— Masthead strip ——— */}
      <div className="border-y border-ink/25 bg-paper-light/60">
        <div className="container mx-auto px-4 md:px-6 py-2.5 flex items-center justify-between gap-3 font-mono text-[10px] md:text-[11px] uppercase tracking-[0.22em] text-ink-muted">
          <span className="whitespace-nowrap">Dossiê Eleitoral</span>
          <span className="hidden md:inline truncate">
            Edição Nº 01 · Ano I{publishedAt ? ` · Dados atualizados em ${publishedAt}` : ''}
          </span>
          <span className="flex items-center gap-2 whitespace-nowrap">
            <span
              aria-hidden
              className="inline-block w-1.5 h-1.5 rounded-full bg-ember animate-pulse"
            />
            <span className="hidden sm:inline">1º turno em </span>
            <strong className="text-ember tabular-nums ml-0.5">
              {daysLeft}
            </strong>
            <span className="ml-1">dias</span>
          </span>
        </div>
      </div>

      {/* ——— Hero ——— */}
      <section className="container mx-auto px-6 pt-16 md:pt-24 pb-14 relative">
        <div className="grid grid-cols-12 gap-x-8 gap-y-10">
          <header className="col-span-12 md:col-span-8 rise-in">
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-ember mb-7">
              <span className="inline-block w-8 h-px bg-ember align-middle mr-3" />
              Eleições gerais · Outubro de 2026
            </p>
            <h1 className="font-serif font-normal text-[2.5rem] sm:text-6xl md:text-7xl lg:text-[5.5rem] leading-[0.95] tracking-[-0.02em] text-balance">
              Quem são,
              <br />
              o que{' '}
              <em className="italic text-ember">propõem</em>,
              <br />
              como{' '}
              <em className="italic">votaram</em>.
            </h1>
            <p className="mt-10 max-w-xl text-lg md:text-[19px] leading-[1.65] text-ink-muted text-pretty">
              Raio-X 2026 é um{' '}
              <span className="text-ink font-medium">arquivo público</span>{' '}
              dos candidatos à Presidência e aos governos estaduais —
              propostas, histórico legislativo e dados de transparência
              compilados direto das fontes oficiais.
            </p>
          </header>

          <aside
            className="col-span-12 md:col-span-4 md:pl-8 md:border-l md:border-ink/15 rise-in"
            style={{ animationDelay: '140ms' }}
          >
            <dl className="space-y-7 text-sm">
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-muted mb-1.5">
                  Dados atualizados em
                </dt>
                <dd className="font-serif text-xl">{publishedAt ?? 'Atualização em revisão'}</dd>
              </div>
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-muted mb-1.5">
                  Fontes primárias
                </dt>
                <dd className="font-serif italic text-base text-ink-muted leading-snug">
                  TSE · Câmara dos Deputados · Senado Federal · Portal da Transparência
                </dd>
              </div>
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-muted mb-1.5">
                  Escopo
                </dt>
                <dd className="font-serif italic text-base text-ink-muted leading-snug">
                  Presidente · Governadores · Senadores
                </dd>
              </div>
              <div className="pt-4 border-t border-ink/20">
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-muted">
                  Coordenadas eleitorais
                </p>
                <p className="mt-2 font-serif text-sm text-ink-muted">
                  <span className="tabular-nums">04.10.2026</span> — 1º turno
                  <br />
                  <span className="tabular-nums">25.10.2026</span> — 2º turno
                  <span className="italic text-ink-soft"> (se houver)</span>
                </p>
              </div>
            </dl>
          </aside>
        </div>

        {/* Search — editorial, borders only */}
        <form
          action="/busca"
          method="get"
          className="mt-16 md:mt-20 border-y-2 border-ink flex items-stretch rise-in"
          style={{ animationDelay: '260ms' }}
        >
          <label
            htmlFor="q"
            className="hidden md:flex items-center font-mono text-[10px] uppercase tracking-[0.22em] text-ink-muted px-5 border-r border-ink/20 whitespace-nowrap"
          >
            § Buscar no arquivo
          </label>
          <input
            id="q"
            type="search"
            name="q"
            placeholder="nome, partido ou estado"
            aria-label="Buscar candidato por nome, partido ou estado"
            className="flex-1 min-w-0 bg-transparent py-5 md:py-6 px-4 md:px-5 font-serif text-lg md:text-xl placeholder:italic placeholder:text-ink-soft focus:outline-none focus:bg-paper-light/50 transition-colors"
          />
          <button
            type="submit"
            className="focus-editorial group bg-ink text-paper px-5 md:px-10 font-mono text-[11px] md:text-xs uppercase tracking-[0.22em] hover:bg-ember transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            <span>Consultar</span>
            <span aria-hidden className="transition-transform group-hover:translate-x-1">
              →
            </span>
          </button>
        </form>

        <div
          className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted rise-in"
          style={{ animationDelay: '360ms' }}
        >
          <span className="text-ink-muted">Atalhos</span>
          <span aria-hidden className="text-ink-soft">/</span>
          <Link
            href="/busca?position=PRESIDENTE"
            className="focus-editorial hover:text-ember border-b border-transparent hover:border-ember py-1 transition-colors"
          >
            Presidentes
          </Link>
          <Link
            href="/busca?position=GOVERNADOR"
            className="focus-editorial hover:text-ember border-b border-transparent hover:border-ember py-1 transition-colors"
          >
            Governadores
          </Link>
          <Link
            href="/busca?position=SENADOR"
            className="focus-editorial hover:text-ember border-b border-transparent hover:border-ember py-1 transition-colors"
          >
            Senadores
          </Link>
          <Link
            href="/comparar"
            className="focus-editorial md:ml-auto text-ember hover:underline underline-offset-4 decoration-2 decoration-ember/40 hover:decoration-ember py-1"
          >
            Comparar lado a lado →
          </Link>
        </div>
      </section>

      {/* ——— Stats strip — count-up on intersection ——— */}
      {statItems.length > 0 && (
        <section className="border-y-2 border-ink bg-paper-dark/40 cv-auto">
          <div className="container mx-auto px-6">
            <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-ink/15">
              {statItems.map((item, i) => (
                <StatTicker
                  key={item.label}
                  value={item.n}
                  label={item.label}
                  index={i}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ——— Seção I — Presidentes ——— */}
      <section className="container mx-auto px-6 pt-20 md:pt-28 pb-16 cv-auto">
        <div className="flex items-end justify-between mb-12 gap-6 flex-wrap">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-ember mb-4">
              <span className="inline-block w-8 h-px bg-ember align-middle mr-3" />
              Seção I
            </p>
            <h2 className="font-serif text-4xl md:text-[3.25rem] leading-[0.98] tracking-[-0.015em]">
              À Presidência da República
            </h2>
            <p className="mt-4 text-ink-muted max-w-md text-[15px] leading-relaxed">
              Os nomes monitorados para a disputa presidencial, com situação
              eleitoral identificada, biografia, propostas e histórico de votos.
            </p>
          </div>
          <Link
            href="/busca?position=PRESIDENTE"
            className="focus-editorial font-mono text-xs uppercase tracking-[0.22em] text-ink hover:text-ember border-b-2 border-ink hover:border-ember pb-1 transition-colors"
          >
            Ver todos os candidatos →
          </Link>
        </div>

        {presidents.length === 0 ? (
          <div className="border border-dashed border-ink/30 py-20 text-center">
            <p className="font-serif italic text-2xl text-ink-muted">
              Nenhum candidato catalogado.
            </p>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-soft mt-3">
              Aguardando ingestão inicial
            </p>
          </div>
        ) : (
          <PresidentialIndex candidates={presidents} />
        )}
      </section>

      {/* ——— Seção II — Como funciona ——— */}
      <section className="border-t border-ink/20 cv-auto">
        <div className="container mx-auto px-6 py-20 md:py-24">
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-ember mb-4">
            <span className="inline-block w-8 h-px bg-ember align-middle mr-3" />
            Seção II
          </p>
          <h2 className="font-serif text-4xl md:text-[3.25rem] leading-[0.98] tracking-[-0.015em] mb-14 max-w-2xl">
            Três passos para{' '}
            <em className="italic text-ember">consultar o arquivo</em>.
          </h2>

          <div className="grid md:grid-cols-3 gap-10 md:gap-14">
            {[
              {
                roman: 'I.',
                title: 'Encontre',
                body:
                  'Qualquer candidato por nome, partido ou estado. A busca aceita grafias acentuadas e variações.',
              },
              {
                roman: 'II.',
                title: 'Investigue',
                body:
                  'Leia propostas organizadas por tema, votações na Câmara e no Senado, declaração de bens e financiamento.',
              },
              {
                roman: 'III.',
                title: 'Compare',
                body:
                  'Coloque dois candidatos lado a lado. Resumos gerados por IA destacam contradições e pontos em comum.',
              },
            ].map(({ roman, title, body }) => (
              <article
                key={roman}
                className="relative pt-6 border-t-2 border-ink"
              >
                <p className="font-serif text-5xl md:text-6xl leading-none text-ember mb-5">
                  {roman}
                </p>
                <h3 className="font-serif text-2xl md:text-3xl mb-3 tracking-[-0.01em]">
                  {title}
                </h3>
                <p className="text-ink-muted text-[15px] leading-[1.7]">
                  {body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ——— Colofão — Fontes ——— */}
      <section className="border-t-2 border-ink bg-paper-dark/40 cv-auto">
        <div className="container mx-auto px-6 py-16">
          <div className="grid grid-cols-12 gap-8 mb-10">
            <div className="col-span-12 md:col-span-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-ember mb-4">
                Colofão
              </p>
              <h2 className="font-serif text-3xl md:text-4xl tracking-[-0.01em] mb-3">
                Fontes &amp; metodologia
              </h2>
            </div>
            <p className="col-span-12 md:col-span-8 md:pt-2 text-ink-muted text-[15px] leading-[1.7] max-w-2xl">
              Todos os dados são públicos, coletados diretamente das fontes
              oficiais do governo brasileiro. Atualizações diárias via jobs
              automatizados; enriquecimento manual via LLM quando o dado
              bruto exige síntese editorial.
            </p>
          </div>

          <ul className="border-t border-ink/25">
            {[
              {
                label: 'TSE',
                full: 'Tribunal Superior Eleitoral',
                desc: 'Registro de candidaturas, declaração de bens, financiamento de campanha',
                href: 'https://dadosabertos.tse.jus.br',
              },
              {
                label: 'Câmara',
                full: 'Câmara dos Deputados',
                desc: 'Votações nominais, projetos de lei e autoria, frentes parlamentares',
                href: 'https://dadosabertos.camara.leg.br',
              },
              {
                label: 'Senado',
                full: 'Senado Federal',
                desc: 'Matérias, orientações de bancada, histórico de senadores',
                href: 'https://legis.senado.leg.br/dadosabertos',
              },
              {
                label: 'Portal',
                full: 'Portal da Transparência',
                desc: 'Gastos públicos, convênios e benefícios assistenciais',
                href: 'https://portaldatransparencia.gov.br',
              },
            ].map(({ label, full, desc, href }, i) => (
              <li key={label} className="border-b border-ink/20">
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="focus-editorial group grid grid-cols-12 items-baseline gap-4 py-5 md:py-6 transition-colors hover:bg-paper-light/60"
                >
                  <span className="col-span-2 md:col-span-1 font-mono text-[11px] tracking-[0.12em] uppercase text-ink-soft tabular-nums">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="col-span-10 md:col-span-3 font-serif text-xl md:text-2xl group-hover:text-ember transition-colors">
                    {label}
                  </span>
                  <span className="col-span-12 md:col-span-3 font-mono text-[11px] uppercase tracking-[0.15em] text-ink-muted">
                    {full}
                  </span>
                  <span className="col-span-10 md:col-span-4 text-sm text-ink-muted leading-snug italic font-serif">
                    {desc}
                  </span>
                  <span className="col-span-2 md:col-span-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft text-right group-hover:text-ember transition-colors">
                    ↗
                  </span>
                </a>
              </li>
            ))}
          </ul>

          <p className="mt-10 font-serif italic text-sm text-ink-soft max-w-xl">
            Projeto independente, sem fins eleitorais. Todo o código é aberto;
            todas as fontes são atribuídas.
          </p>
        </div>
      </section>

      {/* Command palette — Cmd/Ctrl+K overlay + bottom-right button */}
      {paletteItems.length > 0 && <CommandPalette items={paletteItems} />}
    </div>
  )
}
