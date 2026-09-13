import Image from 'next/image'
import Link from 'next/link'
import type { CandidateSummary } from '@/lib/types'

/** Ordem crescente do número de urna; quem ainda não tem número vai ao fim. */
export function byBallotNumber(a: CandidateSummary, b: CandidateSummary): number {
  return (
    (a.ballotNumber ?? Infinity) - (b.ballotNumber ?? Infinity) ||
    a.name.localeCompare(b.name, 'pt-BR')
  )
}

/**
 * O painel da urna: as fotos oficiais do TSE coladas, como folha de contato,
 * com o número de urna em cada uma. O nome aparece no foco e no hover, e está
 * na lista logo abaixo. É flex, não grid, para a nota final ocupar o que sobra
 * da última linha: 13 é primo e qualquer grade deixaria buraco.
 */
export function PresidentialSheet({ candidates }: { candidates: CandidateSummary[] }) {
  const sorted = [...candidates].sort(byBallotNumber)
  const cell = 'basis-[calc((100%-6px)/4)] md:basis-[calc((100%-8px)/5)]'

  return (
    <ol
      className="flex flex-wrap gap-[2px] bg-ink border-2 border-ink"
      aria-label="Candidatos à Presidência, em ordem de número de urna"
    >
      {sorted.map((c) => (
        <li key={c.id} className={`${cell} shrink-0 grow-0`}>
          <Link
            href={`/candidatos/${c.slug}`}
            className="focus-editorial group relative block aspect-[3/4] overflow-hidden bg-paper-dark"
          >
            {c.photoUrl ? (
              <Image
                src={c.photoUrl}
                alt=""
                fill
                sizes="(min-width: 768px) 12vw, 25vw"
                className="object-cover"
                unoptimized
                priority
              />
            ) : null}
            {c.ballotNumber ? (
              <span className="absolute left-0 bottom-0 z-10 bg-ink text-paper text-[13px] font-semibold tabular-nums px-2 py-0.5">
                {c.ballotNumber}
              </span>
            ) : null}
            <span className="absolute inset-x-0 bottom-0 bg-ink/85 text-paper text-xs leading-snug pl-10 pr-2 py-1.5 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
              {c.name}, {c.party}
            </span>
          </Link>
        </li>
      ))}
      <li className="flex-1 min-w-[40%] md:min-w-0 bg-paper p-3 md:p-4 flex items-end text-[13px] leading-snug text-ink-muted">
        O número em cada foto é o da urna.
      </li>
    </ol>
  )
}
