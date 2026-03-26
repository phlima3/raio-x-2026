import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import { fetchCandidate, fetchCandidates } from '@/lib/api'
import { ProposalBlock } from '@/components/ProposalBlock'
import { TransparencyPanel } from '@/components/TransparencyPanel'
import { ConsistencyPanel } from '@/components/ConsistencyPanel'

interface Props {
  params: { slug: string }
}

const POSITION_LABELS: Record<string, string> = {
  PRESIDENTE: 'Presidente da República',
  SENADOR: 'Senador(a) Federal',
  DEPUTADO_FEDERAL: 'Deputado(a) Federal',
  GOVERNADOR: 'Governador(a)',
}

// ISR: pre-render popular candidates (presidents + governors) at build time.
// Falls back to empty array if API is unavailable — pages are then rendered on-demand.
export async function generateStaticParams() {
  try {
    const [presidentsRes, governorsRes] = await Promise.allSettled([
      fetchCandidates({ position: 'PRESIDENTE', limit: '20' }),
      fetchCandidates({ position: 'GOVERNADOR', limit: '50' }),
    ])
    const presidents = presidentsRes.status === 'fulfilled' ? presidentsRes.value.data : []
    const governors = governorsRes.status === 'fulfilled' ? governorsRes.value.data : []
    return [...presidents, ...governors].map((c) => ({ slug: c.slug }))
  } catch {
    return []
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const res = await fetchCandidate(params.slug)
    const c = res.data
    return {
      title: `${c.name} (${c.party}-${c.state})`,
      description: c.bioSummary ?? c.bio ?? `Perfil completo de ${c.name} nas eleições de 2026.`,
      openGraph: {
        title: `${c.name} — Raio-X 2026`,
        description: c.bioSummary ?? `Propostas, votações e transparência de ${c.name}.`,
        ...(c.photoUrl && { images: [{ url: c.photoUrl }] }),
      },
    }
  } catch {
    return {
      title: `Candidato — ${params.slug}`,
      description: 'Perfil completo, propostas e dados de transparência.',
    }
  }
}

export default async function CandidatePage({ params }: Props) {
  let candidate
  try {
    const res = await fetchCandidate(params.slug)
    candidate = res.data
  } catch {
    notFound()
  }

  const initials = candidate.name
    .split(' ')
    .filter((w: string) => w.length > 2)
    .slice(0, 2)
    .map((w: string) => w[0])
    .join('')
    .toUpperCase()

  // Group proposals by category (from the included proposals array)
  const proposalsByCategory: Record<string, typeof candidate.proposals> = {}
  for (const p of candidate.proposals ?? []) {
    const key = p.category ?? 'Outros'
    if (!proposalsByCategory[key]) proposalsByCategory[key] = []
    proposalsByCategory[key].push(p)
  }

  const hasProposals = Object.keys(proposalsByCategory).length > 0

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Breadcrumb */}
      <nav className="text-xs text-gray-400 mb-6 flex items-center gap-2">
        <Link href="/" className="hover:text-brand-600">Candidatos</Link>
        <span>›</span>
        <span className="text-gray-600">{candidate.name}</span>
      </nav>

      {/* Header card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-8">
        <div className="flex flex-col sm:flex-row gap-5">
          {/* Photo */}
          <div className="relative w-24 h-24 rounded-2xl overflow-hidden bg-brand-100 flex-shrink-0 flex items-center justify-center self-start">
            {candidate.photoUrl ? (
              <Image
                src={candidate.photoUrl}
                alt={candidate.name}
                fill
                sizes="96px"
                className="object-cover"
                priority
              />
            ) : (
              <span className="text-2xl font-bold text-brand-600">{initials}</span>
            )}
          </div>

          {/* Info */}
          <div className="flex-1">
            <div className="flex flex-wrap items-start gap-2 mb-1">
              <h1 className="text-2xl font-bold text-gray-900 leading-tight">
                {candidate.name}
              </h1>
              {candidate.isIncumbent && (
                <span className="text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full font-medium self-center">
                  Incumbente
                </span>
              )}
            </div>

            <p className="text-gray-600 mb-3">
              <span className="font-semibold">{candidate.party}</span>
              {' · '}
              {candidate.state}
              {' · '}
              <span className="text-gray-500">
                {POSITION_LABELS[candidate.position] ?? candidate.position}
              </span>
            </p>

            {candidate.coalitionName && (
              <p className="text-sm text-gray-500 mb-3">
                Coligação: <span className="font-medium">{candidate.coalitionName}</span>
              </p>
            )}

            {/* Quick links */}
            <div className="flex flex-wrap gap-2">
              {candidate.siteUrl && (
                <a
                  href={candidate.siteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-brand-50 hover:text-brand-700 rounded-full text-gray-600 transition-colors"
                >
                  Site oficial ↗
                </a>
              )}
              <Link
                href={`/comparar?a=${candidate.slug}`}
                className="text-xs px-3 py-1.5 bg-brand-50 hover:bg-brand-100 text-brand-700 rounded-full font-medium transition-colors"
              >
                ⚖ Comparar
              </Link>
            </div>
          </div>
        </div>

        {/* Bio */}
        {(candidate.bioSummary || candidate.bio) && (
          <div className="mt-5 pt-5 border-t border-gray-100">
            {candidate.bioSummary ? (
              <>
                <p className="text-sm text-gray-700 leading-relaxed">{candidate.bioSummary}</p>
                {candidate.bio && (
                  <details className="mt-2 group">
                    <summary className="text-xs text-brand-600 cursor-pointer hover:text-brand-800 list-none font-medium">
                      <span className="group-open:hidden">▸ Biografia completa</span>
                      <span className="hidden group-open:inline">▾ Ocultar</span>
                    </summary>
                    <p className="text-sm text-gray-600 mt-2 leading-relaxed">{candidate.bio}</p>
                  </details>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-700 leading-relaxed">{candidate.bio}</p>
            )}
          </div>
        )}
      </div>

      {/* Proposals */}
      <section className="mb-10">
        <h2 className="text-xl font-bold text-gray-900 mb-5">
          Propostas
          {hasProposals && (
            <span className="text-sm font-normal text-gray-400 ml-2">
              ({candidate.proposals.length})
            </span>
          )}
        </h2>

        {!hasProposals ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-200 p-8 text-center text-gray-400 text-sm">
            Nenhuma proposta registrada ainda.
            <br />
            <span className="text-xs mt-1 block">Os dados são coletados semanalmente dos sites dos candidatos.</span>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(proposalsByCategory).map(([category, proposals]) => (
              <div key={category}>
                <h3 className="text-base font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <span className="inline-block w-1 h-4 bg-brand-500 rounded-full" />
                  {category}
                  <span className="text-xs text-gray-400 font-normal">({proposals.length})</span>
                </h3>
                {proposals.map((p) => (
                  <ProposalBlock key={p.id} {...p} />
                ))}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Consistency scores */}
      <section className="mb-10">
        <h2 className="text-xl font-bold text-gray-900 mb-2">Consistência</h2>
        <p className="text-sm text-gray-500 mb-5">
          Comparação entre as propostas declaradas e o histórico de votações no Congresso.
        </p>
        <ConsistencyPanel candidateSlug={params.slug} />
      </section>

      {/* Transparency */}
      <section>
        <h2 className="text-xl font-bold text-gray-900 mb-5">Transparência</h2>
        <TransparencyPanel candidateId={candidate.id} />
      </section>
    </div>
  )
}
