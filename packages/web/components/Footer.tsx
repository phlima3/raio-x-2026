import Link from 'next/link'
import { LastUpdated } from './LastUpdated'

const ELECTION_DATE = new Date('2026-10-04T00:00:00-03:00')

function daysUntilElection(): number {
  const diff = ELECTION_DATE.getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / 86_400_000))
}

const SECTIONS: Array<{ href: string; label: string }> = [
  { href: '/', label: 'Candidatos' },
  { href: '/comparar', label: 'Comparar' },
  { href: '/busca', label: 'Buscar' },
]

const SOURCES: Array<{ href: string; label: string }> = [
  { href: 'https://dadosabertos.tse.jus.br', label: 'TSE' },
  { href: 'https://dadosabertos.camara.leg.br', label: 'Câmara' },
  { href: 'https://legis.senado.leg.br/dadosabertos', label: 'Senado' },
  { href: 'https://portaldatransparencia.gov.br', label: 'Portal da Transparência' },
]

export function Footer() {
  const daysLeft = daysUntilElection()
  const now = new Date()
  const year = now.getFullYear()
  const builtAt = now.toISOString()

  return (
    <footer
      role="contentinfo"
      className="paper-grain border-t-2 border-ink text-ink mt-auto"
    >
      {/* Top ornament row */}
      <div className="border-b border-ink/20">
        <div className="container mx-auto px-4 md:px-6 py-3 flex items-center justify-between font-mono text-[10px] md:text-[11px] uppercase tracking-[0.22em] text-ink-muted">
          <span>§ Fim da edição</span>
          <span className="hidden sm:flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block w-1.5 h-1.5 rounded-full bg-ember"
            />
            1º turno em{' '}
            <strong className="text-ember tabular-nums">{daysLeft}</strong>{' '}
            dias
          </span>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="focus-editorial hover:text-ember transition-colors"
          >
            Código aberto ↗
          </a>
        </div>
      </div>

      {/* Main colophon */}
      <div className="container mx-auto px-4 md:px-6 py-14 md:py-20">
        <div className="grid grid-cols-12 gap-y-12 gap-x-8">
          {/* Wordmark + mission */}
          <div className="col-span-12 md:col-span-5">
            <Link
              href="/"
              className="focus-editorial inline-flex items-baseline gap-2.5 group"
              aria-label="Raio-X 2026 — início"
            >
              <span className="font-serif text-4xl md:text-5xl leading-none tracking-[-0.02em] group-hover:text-ember transition-colors">
                Raio-X
              </span>
              <span className="font-mono text-xs uppercase tracking-[0.22em] text-ember translate-y-[-3px]">
                2026
              </span>
            </Link>
            <p className="mt-6 font-serif text-[19px] md:text-xl leading-[1.55] text-ink-muted max-w-md text-pretty">
              Arquivo público dos candidatos à{' '}
              <em className="italic text-ink">Presidência</em> e aos{' '}
              <em className="italic text-ink">governos estaduais</em> nas
              Eleições Gerais de 2026.
            </p>
            <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
              Compilado de fontes oficiais —
              <br className="md:hidden" /> projeto independente, sem fins
              eleitorais.
            </p>
          </div>

          {/* Sections */}
          <nav
            aria-label="Mapa do site"
            className="col-span-6 md:col-span-3 md:col-start-7"
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-ember mb-5">
              <span className="inline-block w-6 h-px bg-ember align-middle mr-2" />
              Seções
            </p>
            <ul className="space-y-3">
              {SECTIONS.map(({ href, label }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="focus-editorial font-serif text-lg md:text-xl hover:text-ember transition-colors border-b border-transparent hover:border-ember pb-0.5"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Sources */}
          <div className="col-span-6 md:col-span-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-ember mb-5">
              <span className="inline-block w-6 h-px bg-ember align-middle mr-2" />
              Fontes
            </p>
            <ul className="space-y-3">
              {SOURCES.map(({ href, label }) => (
                <li key={href}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="focus-editorial font-serif text-lg md:text-xl hover:text-ember transition-colors border-b border-transparent hover:border-ember pb-0.5 inline-flex items-baseline gap-1.5"
                  >
                    <span>{label}</span>
                    <span
                      aria-hidden
                      className="font-mono text-[10px] text-ink-soft"
                    >
                      ↗
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom strip — dateline / signature */}
      <div className="border-t border-ink/25 bg-paper-dark/40">
        <div className="container mx-auto px-4 md:px-6 py-4 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[10px] md:text-[11px] uppercase tracking-[0.22em] text-ink-muted">
          <span className="tabular-nums">©&nbsp;{year}</span>
          <span aria-hidden className="text-ink-soft">
            ·
          </span>
          <span>Raio-X 2026</span>
          <span aria-hidden className="text-ink-soft">
            ·
          </span>
          <span className="italic font-serif text-sm normal-case tracking-normal text-ink-muted">
            “dados públicos, não partidários.”
          </span>
          <span className="ml-auto text-ink-soft flex items-center gap-2">
            <span>Compilado</span>
            <LastUpdated isoDate={builtAt} />
          </span>
        </div>
      </div>
    </footer>
  )
}
