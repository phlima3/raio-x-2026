/**
 * O TSE publica `NM_CANDIDATO` em caixa alta ("ROMEU ZEMA NETO"), enquanto o
 * catálogo editorial guarda o nome como se escreve ("Simone Tebet"). Servir os
 * dois lados sem tratamento deixa a mesma lista com dois estilos de nome.
 *
 * A conversão é aplicada só na saída — nunca no valor que gera slug ou que
 * alimenta a comparação de identidade, que dependem do texto cru — e só quando
 * o nome está inteiramente em caixa alta. Um nome já escrito em caixa mista foi
 * digitado por uma pessoa e é preservado como está.
 */

// Preposições e artigos que ficam em minúscula no meio do nome.
const PARTICLES = new Set([
  'da', 'das', 'de', 'del', 'des', 'di', 'do', 'dos', 'du',
  'e', 'la', 'las', 'le', 'les', 'lo', 'los', 'van', 'von', 'y',
])

function capitalizeWord(word: string): string {
  if (word.length === 0) return word
  return word[0].toLocaleUpperCase('pt-BR') + word.slice(1).toLocaleLowerCase('pt-BR')
}

/** Capitaliza cada segmento separado por hífen ou apóstrofo ("D'ÁVILA"). */
function capitalizeCompound(word: string): string {
  return word
    .split(/([-'’])/)
    .map((part) => (/^[-'’]$/.test(part) ? part : capitalizeWord(part)))
    .join('')
}

function isAllUpperCase(value: string): boolean {
  const letters = value.replace(/[^\p{L}]/gu, '')
  if (letters.length === 0) return false
  return letters === letters.toLocaleUpperCase('pt-BR')
}

export function toDisplayName(value: string): string {
  if (!isAllUpperCase(value)) return value

  const words = value.trim().split(/\s+/)
  return words
    .map((word, index) => {
      const lower = word.toLocaleLowerCase('pt-BR')
      // A partícula só perde a maiúscula no meio: "DOS SANTOS" vira "dos
      // Santos", mas um nome que começa por ela mantém a inicial.
      if (index > 0 && PARTICLES.has(lower)) return lower
      return capitalizeCompound(word)
    })
    .join(' ')
}

/** Aplica a conversão a um campo opcional, preservando `null`. */
export function toDisplayNameOrNull(value: string | null): string | null {
  return value == null ? null : toDisplayName(value)
}
