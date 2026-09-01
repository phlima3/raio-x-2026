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

/** Cargos disputados dentro de uma UF; o mesmo recorte que a busca usa. */
const STATE_SCOPED = new Set(['GOVERNADOR', 'VICE_GOVERNADOR', 'SENADOR'])

export interface ComparableRace {
  position: string
  state: string
}

/** A disputa de uma candidatura: cargo, mais a UF quando o cargo é estadual. */
export function raceOf(candidate: ComparableRace): { position: string; state: string | null } {
  return {
    position: candidate.position,
    state: STATE_SCOPED.has(candidate.position) ? candidate.state : null,
  }
}

export function sameRace(a: ComparableRace, b: ComparableRace): boolean {
  const left = raceOf(a)
  const right = raceOf(b)
  return left.position === right.position && left.state === right.state
}

/**
 * Quem pode ser o segundo candidato de uma comparação.
 *
 * Comparar plano de governo de presidente com o de governador compara disputas
 * diferentes: o cargo define o que cada um promete governar. E cargo sozinho
 * não basta — governador de SP e governador do RJ não disputam a mesma coisa,
 * então a UF entra para os cargos estaduais.
 *
 * Sem conseguir resolver o primeiro escolhido a lista sai **vazia**, e não
 * inteira. Devolver tudo transformava "não achei quem você escolheu" em
 * "qualquer um serve": a página busca uma fatia dos 194 governadores, e quem
 * chegava pelo botão da ficha de um candidato fora da fatia via a disputa
 * presidencial oferecida como adversária.
 */
export function eligibleOpponents<T extends ComparableRace & { slug: string }>(
  candidates: T[],
  selected: string | ComparableRace | undefined,
): T[] {
  if (selected == null) return candidates
  const first = typeof selected === 'string'
    ? candidates.find((candidate) => candidate.slug === selected)
    : selected
  if (!first) return []
  return candidates.filter((candidate) => sameRace(candidate, first))
}
