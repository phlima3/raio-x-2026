import type { Metadata } from 'next'
import Link from 'next/link'
import { LandingPageFrame } from '@/components/LandingPage'
import { EDITORIAL_COMPARISONS, isEditorialComparisonReady } from '@/lib/comparisons'

export const metadata: Metadata = {
  title: 'Comparações editoriais de candidatos em 2026',
  description:
    'Comparações selecionadas de candidatos nas Eleições 2026, com diferenças por tema, fontes e revisão editorial.',
  alternates: { canonical: '/comparacoes' },
}

export default function ComparisonsIndexPage() {
  const published = EDITORIAL_COMPARISONS.filter(isEditorialComparisonReady)
  return (
    <LandingPageFrame
      path="/comparacoes"
      eyebrow="Comparações seletivas"
      title="Comparações editoriais de candidatos"
      description={metadata.description as string}
      intro="O comparador continua aberto como ferramenta. Uma comparação só recebe URL indexável quando há demanda, dados completos, síntese própria e fontes por tema."
      dateModified="2026-08-07T15:00:00-03:00"
    >
      <section className="container mx-auto px-4 md:px-6 py-14 md:py-20">
        {published.length > 0 ? (
          <ol className="border-t-2 border-ink">
            {published.map((comparison) => (
              <li key={comparison.slug} className="border-b border-ink/20 py-6">
                <Link href={`/comparacoes/${comparison.slug}`} className="font-serif text-2xl hover:text-ember">
                  {comparison.title} →
                </Link>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted max-w-3xl">{comparison.description}</p>
              </li>
            ))}
          </ol>
        ) : (
          <div className="border border-dashed border-ink/30 p-8">
            <p className="font-serif italic text-xl text-ink-muted">Nenhuma comparação foi aprovada para publicação editorial.</p>
            <p className="mt-3 text-sm text-ink-muted">Combinações automáticas não serão criadas apenas para ampliar o número de URLs.</p>
          </div>
        )}
        <Link href="/comparar" className="mt-8 inline-block bg-ink text-paper px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em] hover:bg-ember">
          Abrir comparador interativo →
        </Link>
      </section>
    </LandingPageFrame>
  )
}
