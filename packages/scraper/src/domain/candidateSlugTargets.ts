/**
 * Um slug pode resolver para mais de uma linha de `Candidate`: a coluna é
 * indexada mas não é exclusiva, de propósito, para expor colisão de identidade
 * em vez de fundir pessoas. Nem toda colisão é ambiguidade, porém — uma
 * pré-candidatura editorial que o snapshot do TSE não reconciliou é
 * despublicada e marcada `nao_registrado`, e continua guardando o slug da
 * pessoa. Essa linha é lápide, não concorrente.
 *
 * Ficar com o que está publicado é a mesma regra que a API aplica em
 * `publicCandidateWhere`. Quando não há nada publicado (todas as fichas
 * daquele slug já saíram do ar) devolvemos tudo, para o chamador continuar
 * decidindo como antes.
 */
export function candidateSlugTargets<T extends { isPublished: boolean }>(rows: T[]): T[] {
  const published = rows.filter((row) => row.isPublished)
  return published.length > 0 ? published : rows
}
