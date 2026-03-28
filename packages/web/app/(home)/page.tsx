import Link from 'next/link'
import { CandidateCard } from '@/components/CandidateCard'
import { fetchCandidates, fetchCandidateStats } from '@/lib/api'

export const revalidate = 3600 // ISR: revalidate every 1h

export default async function HomePage() {
  // Fetch presidents and stats in parallel
  const [presidentsRes, statsRes] = await Promise.allSettled([
    fetchCandidates({ position: 'PRESIDENTE', limit: '8' }),
    fetchCandidateStats(),
  ])

  const presidents =
    presidentsRes.status === 'fulfilled' ? presidentsRes.value.data : []
  const stats =
    statsRes.status === 'fulfilled' ? statsRes.value.data : null

  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-b from-brand-900 to-brand-700 text-white py-20 px-4">
        <div className="container mx-auto text-center max-w-3xl">
          <span className="inline-block text-brand-200 text-sm font-medium tracking-widest uppercase mb-4">
            Eleições 2026
          </span>
          <h1 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
            Conheça os candidatos.
            <br />
            Decida com informação.
          </h1>
          <p className="text-brand-100 text-lg mb-10 leading-relaxed">
            Propostas, histórico de votações e dados de transparência dos candidatos a
            presidente e governador nas eleições de outubro de 2026.
          </p>

          {/* Search bar (server-side redirect) */}
          <form action="/busca" method="get" className="flex max-w-xl mx-auto gap-2">
            <input
              type="search"
              name="q"
              placeholder="Buscar candidato por nome ou partido…"
              className="flex-1 px-4 py-3 rounded-xl text-gray-900 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-300"
            />
            <button
              type="submit"
              className="px-6 py-3 bg-brand-500 hover:bg-brand-400 text-white font-semibold rounded-xl text-sm transition-colors"
            >
              Buscar
            </button>
          </form>

          {/* Quick filters */}
          <div className="flex flex-wrap justify-center gap-3 mt-6">
            {['PRESIDENTE', 'GOVERNADOR', 'SENADOR'].map((pos) => (
              <Link
                key={pos}
                href={`/busca?position=${pos}`}
                className="text-sm px-4 py-1.5 bg-white/10 hover:bg-white/20 rounded-full text-brand-100 transition-colors"
              >
                {pos === 'PRESIDENTE' ? 'Presidentes' : pos === 'GOVERNADOR' ? 'Governadores' : 'Senadores'}
              </Link>
            ))}
            <Link
              href="/comparar"
              className="text-sm px-4 py-1.5 bg-brand-500 hover:bg-brand-400 rounded-full text-white font-medium transition-colors"
            >
              ⚖ Comparar candidatos
            </Link>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      {stats && (
        <section className="bg-white border-b border-gray-100">
          <div className="container mx-auto px-4 py-5 flex flex-wrap justify-center gap-8 text-center">
            <div>
              <p className="text-2xl font-bold text-brand-700">{stats.total}</p>
              <p className="text-xs text-gray-500 mt-0.5">Candidatos</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-brand-700">
                {Object.keys(stats.byParty).length}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">Partidos</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-brand-700">
                {Object.keys(stats.byState).length}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">Estados</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-brand-700">
                {stats.byPosition['PRESIDENTE'] ?? 0}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">Presidenciáveis</p>
            </div>
          </div>
        </section>
      )}

      <div className="container mx-auto px-4 py-12">
        {/* Candidates à presidência */}
        <section className="mb-14">
          <div className="flex items-baseline justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Candidatos à Presidência</h2>
            <Link
              href="/busca?position=PRESIDENTE"
              className="text-sm text-brand-600 hover:text-brand-800 font-medium"
            >
              Ver todos →
            </Link>
          </div>

          {presidents.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p>Nenhum candidato encontrado.</p>
              <p className="text-sm mt-1">Execute o seed para popular o banco de dados.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {presidents.map((c) => (
                <CandidateCard key={c.id} {...c} />
              ))}
            </div>
          )}
        </section>

        {/* How it works */}
        <section className="mb-14">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">
            Como funciona
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                step: '1',
                title: 'Busque o candidato',
                desc: 'Encontre qualquer candidato a presidente ou governador pelo nome, partido ou estado.',
              },
              {
                step: '2',
                title: 'Explore o perfil',
                desc: 'Veja propostas organizadas por tema, histórico de votações na Câmara ou Senado e declaração de bens.',
              },
              {
                step: '3',
                title: 'Compare e decida',
                desc: 'Use o comparador para ver dois candidatos lado a lado com resumos gerados por IA.',
              },
            ].map(({ step, title, desc }) => (
              <div key={step} className="bg-white rounded-xl border border-gray-100 p-6 text-center shadow-sm">
                <div className="w-10 h-10 rounded-full bg-brand-600 text-white font-bold text-lg flex items-center justify-center mx-auto mb-4">
                  {step}
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">{title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Data sources */}
        <section className="bg-gray-100 rounded-2xl px-8 py-8 text-center">
          <h2 className="text-lg font-semibold text-gray-700 mb-3">Fontes de dados</h2>
          <p className="text-sm text-gray-500 mb-5">
            Todos os dados são públicos e coletados diretamente das fontes oficiais do governo brasileiro.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            {[
              { label: 'TSE', href: 'https://dadosabertos.tse.jus.br' },
              { label: 'Câmara dos Deputados', href: 'https://dadosabertos.camara.leg.br' },
              { label: 'Senado Federal', href: 'https://legis.senado.leg.br/dadosabertos' },
              { label: 'Portal da Transparência', href: 'https://portaldatransparencia.gov.br' },
            ].map(({ label, href }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm bg-white text-gray-700 px-4 py-2 rounded-full border border-gray-200 hover:border-brand-300 hover:text-brand-700 transition-colors"
              >
                {label} ↗
              </a>
            ))}
          </div>
        </section>
      </div>
    </>
  )
}
