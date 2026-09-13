import Image from 'next/image'
import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { BRAZIL_UF_PATHS, BRAZIL_VIEWBOX } from '@/lib/brazilMap'
import type { CandidateSummary } from '@/lib/types'

/**
 * Rostos que aparecem dentro da frase. Escolha editorial do dono do site
 * (2026-09-13), nesta ordem; quem sair do arquivo some do chip sem quebrar.
 */
const FACES = [
  'luiz-inacio-lula-da-silva-pt-sp',
  'renan-santos-missao-sp',
  'flavio-bolsonaro-pl-rj',
  'augusto-jorge-cury-avante-br-presidente-2026',
]

type Props = {
  total: number | null
  updatedAt: string | null
  presidents: CandidateSummary[]
}

/**
 * "Sobre os dados" em uma frase que acende palavra a palavra conforme a página
 * rola (CSS scroll-driven animation, em `globals.css`; sem JS). O bloco tem
 * 200vh de altura e o texto fica preso no meio dele durante a rolagem.
 */
export function SobreOsDados({ total, updatedAt, presidents }: Props) {
  const faces = FACES.map((slug) => presidents.find((c) => c.slug === slug)).filter(
    (c): c is CandidateSummary => Boolean(c?.photoUrl),
  )

  const tokens: ReactNode[] = [
    ...`O que é público sobre ${total ?? 'as'} candidaturas`.split(' '),
    faces.length > 0 ? <FacesChip key="faces" faces={faces} /> : null,
    ...'em todo o país'.split(' '),
    <MapChip key="map" />,
    ...'direto do TSE, da Câmara e do Senado. Cada dado com a fonte ao lado.'.split(' '),
  ].filter(Boolean)

  return (
    <section className="reveal-scroll border-t border-ink/20 h-[200vh]">
      <div className="sticky top-[12vh] container mx-auto px-4 md:px-6 py-12">
        <h2 className="sr-only">Sobre os dados</h2>
        <p className="font-serif text-[2rem] sm:text-5xl lg:text-[3.6rem] leading-[1.18] tracking-[-0.015em] max-w-[22ch]">
          {tokens.map((token, i) => (
            <span
              key={i}
              className="reveal-word"
              style={{ '--i': i, '--n': tokens.length } as CSSProperties}
            >
              {token}{' '}
            </span>
          ))}
        </p>
        <p className="mt-10 text-[15px] text-ink-muted max-w-[70ch] leading-relaxed">
          Resumos feitos por inteligência artificial são marcados na ficha.
          {updatedAt ? ` Atualizado em ${updatedAt}.` : ''}{' '}
          <Link href="/metodologia" className="focus-editorial text-ember underline underline-offset-4">
            Como os dados são coletados
          </Link>
        </p>
      </div>
    </section>
  )
}

function FacesChip({ faces }: { faces: CandidateSummary[] }) {
  return (
    <span className="inline-flex align-middle mx-[0.1em]" aria-hidden>
      {faces.map((c, i) => (
        <span
          key={c.id}
          className={`relative inline-block w-[0.95em] h-[0.95em] rounded-full overflow-hidden border-2 border-paper ${i > 0 ? '-ml-[0.35em]' : ''}`}
        >
          <Image src={c.photoUrl!} alt="" fill sizes="64px" className="object-cover" unoptimized />
        </span>
      ))}
    </span>
  )
}

function MapChip() {
  return (
    <svg
      viewBox={BRAZIL_VIEWBOX}
      className="inline-block h-[1em] w-auto align-middle mx-[0.1em] fill-current"
      aria-hidden
    >
      {Object.entries(BRAZIL_UF_PATHS).map(([uf, d]) => (
        <path key={uf} d={d} />
      ))}
    </svg>
  )
}
