export interface EditorialComparison {
  slug: string
  candidateA: string
  candidateB: string
  title: string
  description: string
  introduction: string
  differences: Array<{ theme: string; summary: string; sourceUrls: string[] }>
  author: string
  reviewer: string
  reviewedAt: string
  updatedAt: string
}

export function buildComparisonSlug(candidateA: string, candidateB: string): string {
  if (!candidateA || !candidateB || candidateA === candidateB) {
    throw new Error('A comparison requires two distinct candidate slugs')
  }
  return [...[candidateA, candidateB].sort()].join('-x-')
}

export function isEditorialComparisonReady(comparison: EditorialComparison): boolean {
  return (
    comparison.slug === buildComparisonSlug(comparison.candidateA, comparison.candidateB) &&
    comparison.title.trim().length >= 20 &&
    comparison.description.trim().length >= 80 &&
    comparison.introduction.trim().length >= 160 &&
    comparison.differences.length >= 3 &&
    comparison.differences.every(
      (difference) =>
        difference.theme.trim().length >= 3 &&
        difference.summary.trim().length >= 80 &&
        difference.sourceUrls.length >= 2 &&
        difference.sourceUrls.every((url) => url.startsWith('https://')),
    ) &&
    comparison.author.trim().length >= 3 &&
    comparison.reviewer.trim().length >= 3 &&
    Number.isFinite(Date.parse(comparison.reviewedAt)) &&
    Number.isFinite(Date.parse(comparison.updatedAt)) &&
    Date.parse(comparison.reviewedAt) >= Date.parse(comparison.updatedAt)
  )
}

// Publicações entram somente por decisão editorial explícita. O array vazio é
// deliberado até que um par tenha demanda comprovada, fontes e revisão humana.
export const EDITORIAL_COMPARISONS: EditorialComparison[] = []

export function findEditorialComparison(slug: string) {
  return EDITORIAL_COMPARISONS.find((comparison) => comparison.slug === slug)
}
