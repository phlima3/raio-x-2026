import Link from 'next/link'
import type { Metadata } from 'next'
import {
  fetchCandidates,
  fetchCandidateSeoReport,
  fetchCandidateStats,
} from '@/lib/api'
import { PresidentialIndex } from '@/components/PresidentialIndex'
import { PresidentialSheet } from '@/components/PresidentialSheet'
import { SobreOsDados } from '@/components/SobreOsDados'
import { CommandPalette } from '@/components/CommandPalette'
import type { CandidateSummary } from '@/lib/types'

export const revalidate = 900

export const metadata: Metadata = {
  alternates: { canonical: '/' },
  openGraph: { url: '/' },
}

const ELECTION_DATE = new Date('2026-10-04T00:00:00-03:00')

/** Rótulo curto da disputa, para a lista estadual da home. */
const STATE_RACE_LABELS: Record<string, string> = {
  GOVERNADOR: 'Governo',
  SENADOR: 'Senado',
  DEPUTADO_FEDERAL: 'Câmara',
}

function daysUntilElection(): number {
  const diff = ELECTION_DATE.getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / 86_400_000))
}

function formatLongDate(d: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d)
}

function latestDate(values: Array<string | null | undefined>): Date | null {
  return values.reduce<Date | null>((latest, value) => {
    if (!value) return latest
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return latest
    return !latest || date > latest ? date : latest
  }, null)
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

  const presidents: CandidateSummary[] =
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
          position: candidate.position,
        }))
      : []

  const daysLeft = daysUntilElection()
  const seoReport = qualityReport.status === 'fulfilled' ? qualityReport.value.data : []
  const publishedAt = latestDate(seoReport.map((c) => c.materialUpdatedAt))
  const accountsAt = latestDate(presidents.map((c) => c.accountsUpdatedAt))

  /**
   * As fichas estaduais mais recentes, linkadas direto da home.
   *
   * Todo caminho da home para as 500 fichas de governo e Senado passava por
   * `/busca`, que é `noindex` de propósito. O corte é por data de atualização,
   * não por relevância eleitoral: o site não escolhe candidato em destaque, e
   * a ordem por atualização gira sozinha conforme o arquivo é trabalhado.
   */
  const recentesNosEstados = seoReport
    .filter((candidate) => candidate.indexable && candidate.position !== 'PRESIDENTE')
    .map((candidate) => ({
      ...candidate,
      atualizadoEm: candidate.materialUpdatedAt
        ? Date.parse(candidate.materialUpdatedAt)
        : Number.NEGATIVE_INFINITY,
    }))
    .filter((candidate) => Number.isFinite(candidate.atualizadoEm))
    .sort((a, b) => b.atualizadoEm - a.atualizadoEm)
    .slice(0, 12)

  return (
    <div className="paper-grain text-ink">
      {/* Hero: o título à esquerda, o painel da urna à direita */}
      <section className="container mx-auto px-4 md:px-6 pt-12 md:pt-16 pb-14 grid grid-cols-12 gap-y-10 md:gap-x-10 lg:gap-x-14 items-start">
        <div className="col-span-12 md:col-span-5">
          <h1 className="font-serif font-normal text-[2.5rem] sm:text-5xl lg:text-[4.25rem] leading-[1] tracking-[-0.02em]">
            Quem são,
            <br className="hidden md:block" /> o que propõem,
            <br className="hidden md:block" /> como votaram.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-ink-muted max-w-[60ch]">
            {presidents.length > 0
              ? `${presidents.length} nomes registrados no TSE para a Presidência. `
              : 'Presidência, governos estaduais e Senado. '}
            1º turno em{' '}
            <strong className="font-medium text-ember tabular-nums">{daysLeft} dias</strong>.
          </p>

          <form action="/busca" method="get" className="mt-10">
            <label htmlFor="q" className="block text-sm text-ink-muted mb-2">
              Buscar candidato por nome, partido ou estado
            </label>
            <div className="flex items-stretch border-2 border-ink">
              <input
                id="q"
                type="search"
                name="q"
                className="flex-1 min-w-0 bg-transparent py-3.5 px-4 font-serif text-lg md:text-xl focus:outline-none focus:bg-paper-light"
              />
              <button
                type="submit"
                className="focus-editorial bg-ink text-paper px-6 md:px-8 text-base hover:bg-ember transition-colors whitespace-nowrap"
              >
                Buscar
              </button>
            </div>
          </form>
        </div>

        {presidents.length > 0 && (
          <div className="col-span-12 md:col-span-7">
            <PresidentialSheet candidates={presidents} />
          </div>
        )}
      </section>

      {/* Sobre os dados: uma frase que acende no scroll */}
      <SobreOsDados
        total={stats?.total ?? null}
        updatedAt={publishedAt ? formatLongDate(publishedAt) : null}
        presidents={presidents}
      />

      {/* Presidência */}
      <section className="border-t border-ink/20 cv-auto">
        <div className="container mx-auto px-4 md:px-6 py-16 md:py-20">
          <div className="flex items-end justify-between mb-10 gap-6 flex-wrap">
            <div>
              <h2 className="font-serif text-3xl md:text-4xl tracking-[-0.015em]">
                Candidatos à Presidência
              </h2>
              <p className="mt-3 text-ink-muted max-w-[60ch] text-base leading-relaxed">
                Situação no TSE, propostas, histórico de votos e quanto cada campanha
                recebeu do fundo eleitoral, o dinheiro público de campanha
                {accountsAt ? `, segundo as contas entregues até ${formatLongDate(accountsAt)}` : ''}.
              </p>
            </div>
            <Link
              href="/candidatos-presidente"
              className="focus-editorial text-base text-ember underline underline-offset-4"
            >
              Todos os candidatos
            </Link>
          </div>

          {presidents.length === 0 ? (
            <p className="border border-dashed border-ink/30 py-16 text-center text-lg text-ink-muted">
              Nenhum candidato catalogado ainda.
            </p>
          ) : (
            <PresidentialIndex candidates={presidents} />
          )}
        </div>
      </section>

      {/* Governos e Senado */}
      {recentesNosEstados.length > 0 && (
        <section className="border-t border-ink/20 cv-auto">
          <div className="container mx-auto px-4 md:px-6 py-16 md:py-20">
            <div className="flex items-end justify-between mb-10 gap-6 flex-wrap">
              <div>
                <h2 className="font-serif text-3xl md:text-4xl tracking-[-0.015em]">
                  Governos estaduais e Senado
                </h2>
                <p className="mt-3 text-ink-muted max-w-[60ch] text-base leading-relaxed">
                  As fichas estaduais trabalhadas mais recentemente. Só entram
                  perfis com situação eleitoral documentada e conteúdo apoiado
                  por fontes citadas.
                </p>
              </div>
              <Link
                href="/eleicoes-2026#disputas-por-uf"
                className="focus-editorial text-base text-ember underline underline-offset-4"
              >
                Todas as disputas por estado
              </Link>
            </div>

            <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8">
              {recentesNosEstados.map((candidate) => (
                <li key={candidate.slug} className="border-b border-ink/20">
                  <Link
                    href={`/candidatos/${candidate.slug}`}
                    className="focus-editorial group flex flex-col gap-1 py-5 transition-colors hover:bg-paper-light/60"
                  >
                    <span className="text-sm text-ink-muted">
                      {STATE_RACE_LABELS[candidate.position] ?? candidate.position}{' '}
                      {candidate.state}
                    </span>
                    <span className="font-serif text-xl leading-snug text-pretty transition-colors group-hover:text-ember">
                      {candidate.name}
                    </span>
                    <span className="text-sm text-ink-muted">{candidate.party}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Command palette — Cmd/Ctrl+K overlay + bottom-right button */}
      {paletteItems.length > 0 && <CommandPalette items={paletteItems} />}
    </div>
  )
}
