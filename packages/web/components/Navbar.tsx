import Link from 'next/link'

const NAV_ITEMS: Array<{ href: string; label: string; external?: boolean }> = [
  { href: '/eleicoes-2026', label: 'Eleições' },
  { href: '/candidatos-presidente', label: 'Candidatos' },
  { href: '/comparar', label: 'Comparar' },
  { href: '/fontes', label: 'Fontes' },
]

export function Navbar() {
  return (
    <header
      role="banner"
      className="sticky top-0 z-40 border-b border-ink bg-paper/95 backdrop-blur-[2px]"
    >
      <div className="container mx-auto px-4 md:px-6 flex items-stretch">
        {/* Wordmark — compresses as page scrolls */}
        <Link
          href="/"
          aria-label="Raio-X 2026 — início"
          className="focus-editorial group flex items-baseline gap-2.5 py-3.5 md:py-4 pr-5 md:pr-8 border-r border-ink/20"
        >
          <span className="scroll-compress-wordmark font-serif text-2xl md:text-[1.75rem] leading-none tracking-[-0.02em] text-ink transition-colors group-hover:text-ember inline-flex items-baseline gap-2.5">
            <span>Raio-X</span>
            <span className="font-mono text-[10px] md:text-[11px] uppercase tracking-[0.22em] text-ember translate-y-[-2px]">
              2026
            </span>
          </span>
        </Link>

        {/* Nav — desktop */}
        <nav
          aria-label="Navegação principal"
          className="hidden md:flex items-stretch divide-x divide-ink/15 ml-auto"
        >
          {NAV_ITEMS.map(({ href, label, external }) =>
            external ? (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="focus-editorial group px-5 flex items-center font-mono text-[11px] uppercase tracking-[0.22em] text-ink-muted hover:text-ember transition-colors"
              >
                {label}
                <span aria-hidden className="ml-1.5 text-ink-soft group-hover:text-ember">
                  ↗
                </span>
              </a>
            ) : (
              <Link
                key={href}
                href={href}
                className="focus-editorial px-5 flex items-center font-mono text-[11px] uppercase tracking-[0.22em] text-ink-muted hover:text-ember transition-colors"
              >
                {label}
              </Link>
            )
          )}
        </nav>

        {/* Mobile menu trigger */}
        <MobileTrigger />
      </div>

      {/* Scroll progress bar — fills as page scrolls */}
      <div
        aria-hidden
        className="absolute left-0 right-0 bottom-[-1px] h-[2px] overflow-hidden pointer-events-none"
      >
        <div className="scroll-progress-bar h-full w-full bg-ember origin-left" />
      </div>
    </header>
  )
}

// ——————————————————————————————————————————————————
// Mobile drawer — native <details>/<summary> for zero JS
// ——————————————————————————————————————————————————

function MobileTrigger() {
  return (
    <details className="md:hidden ml-auto group">
      <summary
        className="focus-editorial list-none cursor-pointer h-full flex items-center px-4 border-l border-ink/20 font-mono text-[11px] uppercase tracking-[0.22em] text-ink-muted hover:text-ember hover:bg-paper-light transition-colors select-none"
      >
        <span className="group-open:hidden">§ Menu</span>
        <span className="hidden group-open:inline">× Fechar</span>
      </summary>

      <div className="absolute top-full left-0 right-0 max-h-[80dvh] overflow-y-auto overscroll-contain bg-paper border-y-2 border-ink shadow-[0_8px_0_rgba(26,22,20,0.25)]">
        <nav aria-label="Menu mobile" className="container mx-auto px-4">
          <ul className="divide-y divide-ink/15">
            {NAV_ITEMS.map(({ href, label, external }) => (
              <li key={href}>
                {external ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="focus-editorial flex items-baseline justify-between py-4 font-serif text-2xl tracking-[-0.01em] hover:text-ember transition-colors"
                  >
                    <span>{label}</span>
                    <span aria-hidden className="font-mono text-xs text-ink-soft">
                      ↗
                    </span>
                  </a>
                ) : (
                  <Link
                    href={href}
                    className="focus-editorial flex items-baseline justify-between py-4 font-serif text-2xl tracking-[-0.01em] hover:text-ember transition-colors"
                  >
                    <span>{label}</span>
                    <span aria-hidden className="font-mono text-xs text-ink-soft">
                      →
                    </span>
                  </Link>
                )}
              </li>
            ))}
          </ul>
          <p className="py-4 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
            § raio-x 2026 · transparência eleitoral
          </p>
        </nav>
      </div>
    </details>
  )
}
