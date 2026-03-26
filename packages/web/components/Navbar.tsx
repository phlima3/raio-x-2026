import Link from 'next/link'

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-100 shadow-sm">
      <div className="container mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-lg font-bold text-brand-700 tracking-tight">
            Raio-X<span className="text-brand-500">2026</span>
          </span>
        </Link>

        <nav className="flex items-center gap-6 text-sm font-medium text-gray-600">
          <Link href="/" className="hover:text-brand-600 transition-colors">
            Candidatos
          </Link>
          <Link href="/comparar" className="hover:text-brand-600 transition-colors">
            Comparar
          </Link>
          <a
            href="https://dadosabertos.tse.jus.br"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-400 hover:text-brand-600 transition-colors"
          >
            Fontes ↗
          </a>
        </nav>
      </div>
    </header>
  )
}
