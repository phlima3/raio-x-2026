import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Navbar } from '@/components/Navbar'
import './globals.css'

const inter = Inter({ subsets: ['latin'], display: 'swap' })

export const metadata: Metadata = {
  title: {
    default: 'Raio-X 2026 — Transparência Eleitoral',
    template: '%s | Raio-X 2026',
  },
  description:
    'Compare candidatos, acompanhe propostas e acesse dados de transparência das eleições brasileiras de 2026.',
  keywords: ['eleições 2026', 'candidatos', 'propostas', 'transparência eleitoral', 'brasil'],
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: 'Raio-X 2026',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={inter.className}>
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased flex flex-col">
        <Navbar />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-gray-200 bg-white mt-12">
          <div className="container mx-auto px-4 py-6 text-center text-xs text-gray-400">
            Dados públicos: TSE · Câmara dos Deputados · Senado Federal.
            Projeto independente, sem fins eleitorais.
          </div>
        </footer>
      </body>
    </html>
  )
}
