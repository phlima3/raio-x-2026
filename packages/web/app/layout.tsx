import type { Metadata } from 'next'
import { Inter, Bodoni_Moda, JetBrains_Mono } from 'next/font/google'
import { Navbar } from '@/components/Navbar'
import { Footer } from '@/components/Footer'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})
const bodoni = Bodoni_Moda({
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
  style: ['normal', 'italic'],
  weight: ['400', '500', '600', '700', '800'],
})
const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})

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
    <html lang="pt-BR" className={`${inter.variable} ${bodoni.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-paper-light text-ink antialiased flex flex-col font-sans">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  )
}
