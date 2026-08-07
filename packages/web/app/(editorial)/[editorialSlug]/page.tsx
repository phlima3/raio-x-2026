import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { EditorialDocument } from '@/components/EditorialDocument'
import { EDITORIAL_PAGES, findEditorialPage } from '@/lib/editorial-pages'

interface Props {
  params: { editorialSlug: string }
}

export const dynamicParams = false

export function generateStaticParams() {
  return EDITORIAL_PAGES.map((page) => ({ editorialSlug: page.slug }))
}

export function generateMetadata({ params }: Props): Metadata {
  const page = findEditorialPage(params.editorialSlug)
  if (!page) return { robots: { index: false, follow: false } }
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: `/${page.slug}` },
    openGraph: {
      title: `${page.title} — Raio-X 2026`,
      description: page.description,
      url: `/${page.slug}`,
    },
  }
}

export default function EditorialPage({ params }: Props) {
  const page = findEditorialPage(params.editorialSlug)
  if (!page) notFound()
  return <EditorialDocument page={page} />
}
