import type { Metadata } from 'next'
import Link from 'next/link'
import { LandingPageFrame } from '@/components/LandingPage'
import { BRAZIL_STATES, LANDING_THEMES } from '@/lib/landing'

const CALENDAR_URL =
  'https://www.tse.jus.br/comunicacao/noticias/2026/Marco/eleicoes-2026-confira-as-principais-datas-do-calendario-eleitoral'

export const metadata: Metadata = {
  title: 'Eleições 2026: candidatos, datas e propostas',
  description:
    'Consulte o calendário das Eleições 2026, entenda a situação das candidaturas e encontre perfis por cargo, estado e tema.',
  alternates: { canonical: '/eleicoes-2026' },
  openGraph: { url: '/eleicoes-2026' },
}

export default function ElectionsPage() {
  return (
    <LandingPageFrame
      path="/eleicoes-2026"
      eyebrow="Guia eleitoral"
      title="Eleições 2026: candidatos, datas e propostas"
      description={metadata.description as string}
      intro="Um ponto de partida para acompanhar quem disputa cada cargo, o estágio formal das candidaturas e as propostas documentadas — sempre com fonte e data de verificação."
      dateModified="2026-08-07T15:00:00-03:00"
    >
      <section className="container mx-auto px-4 md:px-6 py-14 md:py-20">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-ember mb-4">Calendário oficial</p>
            <h2 className="font-serif text-3xl md:text-5xl tracking-[-0.015em]">Datas centrais</h2>
            <ol className="mt-8 border-t border-ink/25">
              {[
                ['20 jul. a 5 ago.', 'Convenções partidárias para escolha de candidaturas e coligações.'],
                ['15 de agosto', 'Prazo final para registro formal das candidaturas na Justiça Eleitoral.'],
                ['4 de outubro', 'Primeiro turno das Eleições Gerais de 2026.'],
                ['25 de outubro', 'Eventual segundo turno para Presidência e governos estaduais.'],
              ].map(([date, detail]) => (
                <li key={date} className="border-b border-ink/20 py-5 grid grid-cols-12 gap-4">
                  <strong className="col-span-4 font-mono text-[10px] uppercase tracking-[0.16em] text-ember">{date}</strong>
                  <span className="col-span-8 text-[15px] leading-relaxed text-ink-muted">{detail}</span>
                </li>
              ))}
            </ol>
            <a href={CALENDAR_URL} target="_blank" rel="noopener noreferrer" className="mt-5 inline-block font-mono text-[10px] uppercase tracking-[0.16em] text-ember hover:underline">
              Conferir calendário no TSE ↗
            </a>
          </div>
          <aside className="border-l border-ink/20 pl-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ember mb-4">Como ler os perfis</p>
            <p className="text-[15px] leading-[1.7] text-ink-muted">
              “Cotado”, “pré-candidato”, “escolhido em convenção” e “registro deferido” são situações diferentes. O perfil mostra a fonte e não presume oficialização.
            </p>
            <Link href="/metodologia#secao-2" className="mt-4 inline-block font-mono text-[10px] uppercase tracking-[0.16em] text-ember hover:underline">
              Ver vocabulário completo →
            </Link>
          </aside>
        </div>
      </section>

      <section className="border-t border-ink/25 bg-paper-dark/30">
        <div className="container mx-auto px-4 md:px-6 py-14 md:py-20">
          <h2 className="font-serif text-3xl md:text-5xl">Explore por disputa</h2>
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link href="/candidatos-presidente" className="border-2 border-ink p-6 font-serif text-2xl hover:bg-ink hover:text-paper transition-colors">Presidência →</Link>
            <a href="#disputas-por-uf" className="border border-ink/30 p-6 font-serif text-2xl hover:border-ember hover:text-ember transition-colors">Governos estaduais ↓</a>
            <a href="#disputas-por-uf" className="border border-ink/30 p-6 font-serif text-2xl hover:border-ember hover:text-ember transition-colors">Senado ↓</a>
          </div>
          <div id="disputas-por-uf" className="mt-10 border-t border-ink/20 pt-7 scroll-mt-24">
            <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ember">Disputas por UF</h3>
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {Object.entries(BRAZIL_STATES).map(([uf, name]) => (
                <div key={uf} className="border border-ink/20 px-3 py-3">
                  <p className="font-serif text-lg">{name}</p>
                  <div className="mt-2 flex gap-4 font-mono text-[9px] uppercase tracking-[0.12em]">
                    <Link href={`/governador/${uf.toLowerCase()}`} className="text-ember hover:underline">Governo →</Link>
                    <Link href={`/senador/${uf.toLowerCase()}`} className="text-ember hover:underline">Senado →</Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 md:px-6 py-14 md:py-20 border-t border-ink/25">
        <h2 className="font-serif text-3xl md:text-5xl">Propostas por tema</h2>
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {Object.entries(LANDING_THEMES).map(([slug, theme]) => (
            <Link key={slug} href={`/temas/${slug}`} className="border border-ink/25 p-5 hover:border-ember group">
              <h3 className="font-serif text-xl group-hover:text-ember">{theme.label}</h3>
              <p className="mt-2 text-xs leading-relaxed text-ink-muted">{theme.description}</p>
            </Link>
          ))}
        </div>
      </section>
    </LandingPageFrame>
  )
}
