import Image from 'next/image'
import Link from 'next/link'
import type { CSSProperties } from 'react'
import type { CandidateSummary } from '@/lib/types'

/**
 * As fotos oficiais do TSE, lado a lado, como na urna. Em telas largas cabem
 * todas numa linha só; abaixo disso a tira rola na horizontal, porque 13 é
 * primo e qualquer grade deixaria um nome sobrando sozinho na última linha.
 */
export function PresidentialStrip({ candidates }: { candidates: CandidateSummary[] }) {
  return (
    <ol
      className="mt-10 flex gap-3 overflow-x-auto pb-2 snap-x md:grid md:grid-cols-7 md:overflow-visible xl:grid-cols-[repeat(var(--n),minmax(0,1fr))] md:gap-4"
      style={{ '--n': candidates.length } as CSSProperties}
      aria-label="Candidatos à Presidência"
    >
      {candidates.map((c) => (
        <li key={c.id} className="snap-start shrink-0 w-24 md:w-auto">
          <Link
            href={`/candidatos/${c.slug}`}
            className="focus-editorial group block"
          >
            <span className="relative block aspect-[3/4] w-full overflow-hidden bg-paper-dark border border-ink/20">
              {c.photoUrl ? (
                <Image
                  src={c.photoUrl}
                  alt=""
                  fill
                  sizes="(min-width: 1280px) 8vw, (min-width: 768px) 14vw, 96px"
                  className="object-cover"
                  unoptimized
                  priority
                />
              ) : null}
            </span>
            <span className="mt-2 block font-serif text-sm leading-tight text-pretty group-hover:text-ember transition-colors">
              {c.name}
            </span>
            <span className="block text-xs text-ink-muted mt-0.5">{c.party}</span>
          </Link>
        </li>
      ))}
    </ol>
  )
}
