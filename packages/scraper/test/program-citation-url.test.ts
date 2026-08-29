import { describe, expect, it } from 'vitest'

import { programCitationUrl } from '../src/jobs/extractProgramProposals'
import { nullableName } from '../src/sources/tse/candidateCsv'

const PAGINA =
  'https://divulgacandcontas.tse.jus.br/divulga/#/candidato/BR/BR/20322002026/280002540694/2026/BR'
const ANEXO =
  'https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/doc/280017002789'
const PACOTE =
  'https://cdn.tse.jus.br/estatistica/sead/odsele/proposta_governo/proposta_governo_2026_BR.zip#entry=x.pdf'

describe('programCitationUrl', () => {
  it('cites the candidacy page instead of the PDF that would just download', () => {
    expect(programCitationUrl({
      sourceUrl: ANEXO,
      metadata: { candidatePage: PAGINA, filename: 'plano.pdf' },
    })).toBe(PAGINA)
  })

  it('falls back to the source when the catalog package is the only address', () => {
    // O caminho do pacote não tem página equivalente: ali o recurso é o ZIP.
    expect(programCitationUrl({ sourceUrl: PACOTE, metadata: { datasetKind: 'X' } }))
      .toBe(PACOTE)
    expect(programCitationUrl({ sourceUrl: PACOTE })).toBe(PACOTE)
    expect(programCitationUrl({ sourceUrl: PACOTE, metadata: null })).toBe(PACOTE)
  })

  it('ignores a candidatePage that is not a navigable address', () => {
    // `metadata` é JSON livre no banco; um valor estranho não pode virar href.
    for (const page of ['', 'javascript:alert(1)', 'candidato/BR', 42, null]) {
      expect(programCitationUrl({ sourceUrl: ANEXO, metadata: { candidatePage: page } }))
        .toBe(ANEXO)
    }
  })

  it('survives metadata that is not an object', () => {
    expect(programCitationUrl({ sourceUrl: ANEXO, metadata: 'texto' })).toBe(ANEXO)
    expect(programCitationUrl({ sourceUrl: ANEXO, metadata: [PAGINA] })).toBe(ANEXO)
  })
})

describe('nullableName aplicado à coligação', () => {
  it('treats the TSE null markers as absence, with or without the trailing #', () => {
    // É o que estampava "Coligação #NULO" na ficha de quem concorre isolado.
    for (const marker of ['#NULO', '#NULO#', '#NE', '#NE#']) {
      expect(nullableName(marker)).toBeNull()
    }
  })

  it('keeps a real coalition name', () => {
    expect(nullableName('MISSÃO')).toBe('MISSÃO')
    expect(nullableName('PARA MUDAR O BRASIL')).toBe('PARA MUDAR O BRASIL')
  })
})
