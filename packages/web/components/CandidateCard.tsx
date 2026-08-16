import Image from 'next/image'
import { ViewTransitionLink } from './ViewTransitionLink'
import { absoluteImageUrl } from '@/lib/seo'

const POSITION_LABELS: Record<string, string> = {
  PRESIDENTE: 'Presidente',
  VICE_PRESIDENTE: 'Vice-Presidente',
  SENADOR: 'Senador(a)',
  DEPUTADO_FEDERAL: 'Dep. Federal',
  DEPUTADO_ESTADUAL: 'Dep. Estadual',
  GOVERNADOR: 'Governador(a)',
  VICE_GOVERNADOR: 'Vice-Governador(a)',
  PREFEITO: 'Prefeito(a)',
  VEREADOR: 'Vereador(a)',
}

interface CandidateCardProps {
  id: string
  name: string
  party: string
  state: string
  position: string
  photoUrl?: string | null
  ballotNumber?: number | null
  isIncumbent?: boolean
  approvalRate?: number | null
  firstProposalTitle?: string | null
  slug: string
  index?: number
}

function approvalTone(rate: number): string {
  if (rate >= 50) return 'text-civic-green'
  if (rate >= 35) return 'text-ink-muted'
  return 'text-ember'
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

export function CandidateCard({
  name,
  party,
  state,
  position,
  photoUrl,
  ballotNumber,
  isIncumbent,
  approvalRate,
  firstProposalTitle,
  slug,
  index,
}: CandidateCardProps) {
  const initials = initialsFor(name)
  const safePhotoUrl = absoluteImageUrl(photoUrl)

  return (
    <ViewTransitionLink
      href={`/candidatos/${slug}`}
      className="focus-editorial group block"
    >
      <article className="flex flex-col h-full border-b border-ink/15 pb-5 pt-4 hover:bg-paper-light/50 transition-colors px-2">
        {index != null && (
          <span className="font-mono text-[10px] tracking-[0.18em] text-ink-soft tabular-nums mb-2">
            {String(index).padStart(2, '0')}
          </span>
        )}

        <div className="flex items-start gap-3">
          <div
            className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-full overflow-hidden bg-ember/10 border border-ink/15 shrink-0"
            style={{ viewTransitionName: `photo-${slug}` }}
          >
            {safePhotoUrl ? (
              <Image
                src={safePhotoUrl}
                alt={name}
                fill
                sizes="56px"
                className="object-cover grayscale contrast-110 group-hover:grayscale-0 transition-all duration-700"
                unoptimized
              />
            ) : (
              <span className="flex items-center justify-center w-full h-full font-serif text-base text-ember">
                {initials}
              </span>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h3
              className="font-serif text-lg sm:text-xl leading-tight tracking-[-0.01em] group-hover:text-ember transition-colors line-clamp-2"
              style={{ viewTransitionName: `name-${slug}` }}
            >
              {name}
            </h3>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
              {party} · {state}
              {ballotNumber ? (
                <>
                  <span className="mx-1.5 text-ink-soft">·</span>Nº{' '}
                  <span className="tabular-nums">{ballotNumber}</span>
                </>
              ) : null}
            </p>
          </div>
        </div>

        {firstProposalTitle && (
          <p className="mt-2.5 font-serif italic text-[13px] text-ink-muted line-clamp-2 leading-snug pl-[60px] sm:pl-[68px]">
            <span className="text-ember not-italic mr-0.5">&ldquo;</span>
            {firstProposalTitle}
            <span className="text-ember not-italic ml-0.5">&rdquo;</span>
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 mt-auto pt-3 pl-[60px] sm:pl-[68px]">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft border border-ink/15 px-2 py-0.5">
            {POSITION_LABELS[position] ?? position}
          </span>
          {isIncumbent && (
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ember border border-ember/30 px-2 py-0.5">
              Incumbente
            </span>
          )}
          {approvalRate != null && (
            <span className={`font-mono text-[10px] uppercase tracking-[0.14em] tabular-nums ml-auto ${approvalTone(approvalRate)}`}>
              {approvalRate}% aprov.
            </span>
          )}
        </div>
      </article>
    </ViewTransitionLink>
  )
}

export function CandidateCardSkeleton() {
  return (
    <div className="border-b border-ink/10 pb-5 pt-4 px-2 animate-pulse">
      <div className="h-3 w-6 bg-ink/10 mb-2" />
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-ink/10 shrink-0" />
        <div className="flex-1 min-w-0 space-y-2 pt-1">
          <div className="h-5 bg-ink/10 w-3/4" />
          <div className="h-3 bg-ink/[0.06] w-1/2" />
        </div>
      </div>
      <div className="mt-3 pl-[60px] sm:pl-[68px] flex gap-2">
        <div className="h-4 bg-ink/[0.06] w-20" />
        <div className="h-4 bg-ink/[0.06] w-14" />
      </div>
    </div>
  )
}
