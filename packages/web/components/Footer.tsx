import Link from 'next/link'

const SECTIONS: Array<{ href: string; label: string }> = [
  { href: '/eleicoes-2026', label: 'Eleições 2026' },
  { href: '/candidatos-presidente', label: 'Presidência' },
  { href: '/comparar', label: 'Comparar' },
  { href: '/busca', label: 'Buscar' },
]

const TRUST_LINKS: Array<{ href: string; label: string }> = [
  { href: '/metodologia', label: 'Metodologia' },
  { href: '/fontes', label: 'Fontes' },
  { href: '/politica-editorial', label: 'Política editorial' },
  { href: '/correcoes', label: 'Correções' },
  { href: '/changelog', label: 'Histórico de atualizações' },
]

const LINK =
  'focus-editorial font-serif text-lg md:text-xl hover:text-ember transition-colors'

export function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer
      role="contentinfo"
      className="paper-grain border-t-2 border-ink text-ink mt-auto"
    >
      <div className="container mx-auto px-4 md:px-6 py-14 md:py-20">
        <div className="grid grid-cols-12 gap-y-12 gap-x-0 md:gap-x-8">
          <div className="col-span-12 md:col-span-5">
            <Link
              href="/"
              className="focus-editorial inline-flex items-baseline gap-2 group"
              aria-label="Raio-X 2026, início"
            >
              <span className="font-serif text-4xl md:text-5xl leading-none tracking-[-0.02em] group-hover:text-ember transition-colors">
                Raio-X
              </span>
              <span className="font-serif text-xl text-ember">2026</span>
            </Link>
            <p className="mt-6 text-[17px] leading-[1.6] text-ink-muted max-w-md text-pretty">
              Arquivo público dos candidatos à Presidência, aos governos
              estaduais e ao Senado nas eleições de 2026. Projeto independente,
              sem fins eleitorais, compilado de fontes oficiais.
            </p>
          </div>

          <nav
            aria-label="Mapa do site"
            className="col-span-6 md:col-span-3 md:col-start-7"
          >
            <p className="text-sm text-ink-muted mb-4">Seções</p>
            <ul className="space-y-3">
              {SECTIONS.map(({ href, label }) => (
                <li key={href}>
                  <Link href={href} className={LINK}>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="col-span-6 md:col-span-3 md:col-start-10">
            <p className="text-sm text-ink-muted mb-4">Projeto</p>
            <ul className="space-y-3">
              {TRUST_LINKS.map(({ href, label }) => (
                <li key={href}>
                  <Link href={href} className={LINK}>
                    {label}
                  </Link>
                </li>
              ))}
              <li>
                <a
                  href="https://github.com/phlima3/raio-x-2026"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={LINK}
                >
                  Código aberto no GitHub
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-ink/25 bg-paper-dark/40">
        <p className="container mx-auto px-4 md:px-6 py-4 text-sm text-ink-muted">
          © {year} Raio-X 2026. Dados públicos, não partidários.
        </p>
      </div>
    </footer>
  )
}
