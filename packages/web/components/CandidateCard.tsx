import Image from 'next/image'
import Link from 'next/link'

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
  slug: string
}

export function CandidateCard({
  name,
  party,
  state,
  position,
  photoUrl,
  ballotNumber,
  isIncumbent,
  slug,
}: CandidateCardProps) {
  const initials = name
    .split(' ')
    .filter((w) => w.length > 2)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

  return (
    <Link href={`/candidatos/${slug}`} className="group block">
      <article className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md hover:border-brand-200 transition-all h-full flex flex-col">
        {/* Photo / Avatar */}
        <div className="flex items-start gap-4 mb-3">
          <div className="relative w-14 h-14 rounded-full overflow-hidden bg-brand-100 flex-shrink-0 flex items-center justify-center">
            {photoUrl ? (
              <Image
                src={photoUrl}
                alt={name}
                fill
                sizes="56px"
                className="object-cover"
                unoptimized
              />
            ) : (
              <span className="text-lg font-bold text-brand-600">{initials}</span>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 leading-tight truncate group-hover:text-brand-700 transition-colors">
              {name}
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">
              <span className="font-medium text-gray-700">{party}</span>
              {' · '}
              {state}
            </p>
          </div>
        </div>

        {/* Position + badges */}
        <div className="flex flex-wrap items-center gap-2 mt-auto pt-3 border-t border-gray-50">
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
            {POSITION_LABELS[position] ?? position}
          </span>
          {isIncumbent && (
            <span className="text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full font-medium">
              Incumbente
            </span>
          )}
          {ballotNumber && (
            <span className="text-xs text-gray-400 ml-auto">
              Nº {ballotNumber}
            </span>
          )}
        </div>
      </article>
    </Link>
  )
}
