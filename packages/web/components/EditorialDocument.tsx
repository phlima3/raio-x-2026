import Link from 'next/link'
import type { EditorialPageDefinition } from '@/lib/editorial-pages'
import { JsonLd } from './JsonLd'
import {
  buildBreadcrumbList,
  buildEditorialWebPageSchema,
} from '@/lib/structured-data'

function SmartLink({ href, children }: { href: string; children: React.ReactNode }) {
  const className = 'font-medium text-ember underline decoration-ember/30 underline-offset-4 hover:decoration-ember'
  if (href.startsWith('/')) return <Link href={href} className={className}>{children}</Link>
  return <a href={href} target="_blank" rel="noopener noreferrer" className={className}>{children} ↗</a>
}

export function EditorialDocument({ page }: { page: EditorialPageDefinition }) {
  const path = `/${page.slug}`
  const formattedDate = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(page.updatedAt))

  return (
    <article className="paper-grain text-ink">
      <JsonLd data={buildBreadcrumbList([
        { name: 'Início', path: '/' },
        { name: page.title, path },
      ])} />
      <JsonLd data={buildEditorialWebPageSchema({
        path,
        name: page.title,
        description: page.description,
        dateModified: page.updatedAt,
      })} />

      <div className="border-y border-ink/25 bg-paper-light/60">
        <nav aria-label="Você está em" className="container mx-auto px-4 md:px-6 py-2.5 flex gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted">
          <Link href="/" className="hover:text-ember">§ Início</Link>
          <span aria-hidden>/</span>
          <span className="text-ink">{page.title}</span>
        </nav>
      </div>

      <header className="container mx-auto px-4 md:px-6 pt-16 md:pt-24 pb-14 border-b border-ink/25">
        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-ember mb-5">
          <span className="inline-block w-8 h-px bg-ember align-middle mr-3" />
          {page.eyebrow}
        </p>
        <h1 className="font-serif text-4xl sm:text-6xl md:text-7xl leading-[0.96] tracking-[-0.02em] max-w-4xl text-balance">
          {page.title}
        </h1>
        <p className="mt-8 font-serif italic text-xl md:text-2xl leading-[1.55] text-ink-muted max-w-3xl text-pretty">
          {page.intro}
        </p>
        <p className="mt-6 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-soft">
          Atualização material: <time dateTime={page.updatedAt}>{formattedDate}</time>
        </p>
      </header>

      <div className="container mx-auto px-4 md:px-6 py-14 md:py-20 grid grid-cols-12 gap-x-10 gap-y-12">
        <aside className="col-span-12 md:col-span-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ember mb-4">Nesta página</p>
          <ol className="space-y-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted">
            {page.sections.map((section, index) => (
              <li key={section.title}>
                <a href={`#secao-${index + 1}`} className="hover:text-ember">
                  {String(index + 1).padStart(2, '0')} · {section.title}
                </a>
              </li>
            ))}
          </ol>
        </aside>

        <div className="col-span-12 md:col-span-8 md:col-start-5 space-y-16">
          {page.sections.map((section, index) => (
            <section key={section.title} id={`secao-${index + 1}`} className="scroll-mt-24">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ember mb-3">
                {String(index + 1).padStart(2, '0')}
              </p>
              <h2 className="font-serif text-3xl md:text-4xl tracking-[-0.015em] leading-tight border-b border-ink/20 pb-4">
                {section.title}
              </h2>
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph} className="mt-5 text-[16px] md:text-[17px] leading-[1.78] text-ink-muted text-pretty">
                  {paragraph}
                </p>
              ))}
              {section.items && (
                <ul className="mt-6 border-t border-ink/20">
                  {section.items.map((item) => (
                    <li key={`${item.label}-${item.href ?? ''}`} className="border-b border-ink/15 py-4 text-[15px] leading-relaxed text-ink-muted">
                      {item.href ? <SmartLink href={item.href}>{item.label}</SmartLink> : <strong className="font-medium text-ink">{item.label}</strong>}
                      {item.detail ? <span> — {item.detail}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </div>
    </article>
  )
}
