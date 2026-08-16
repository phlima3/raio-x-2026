interface NewsRecord {
  id: string
  headline: string
  summary: string
  url: string | null
  topic: string
  publishedAt: Date | null
  fetchedAt: Date
  hasContradiction: boolean
  contradictionNote: string | null
}

export function presentNewsItem(item: NewsRecord) {
  return {
    id: item.id,
    title: item.headline,
    summary: item.summary,
    sourceUrl: item.url,
    publishedAt: item.publishedAt ?? item.fetchedAt,
    topic: item.topic,
    hasContradiction: item.hasContradiction,
    contradictionNote: item.contradictionNote,
  }
}
