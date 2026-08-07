import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import {
  parseTseCandidateArchive,
  TseArchiveError,
} from '../src/sources/tse/candidateArchive'

const fixture = (name: string): Buffer =>
  readFileSync(fileURLToPath(new URL(`./fixtures/tse/${name}`, import.meta.url)))

describe('parseTseCandidateArchive', () => {
  it('selects the candidate CSV from a ZIP and validates the expected UF', () => {
    const archive = zipSync({
      'leiame.txt': strToU8('fixture sintética'),
      'consulta_cand_2026_BR.csv': strToU8(''),
      'consulta_cand_2026_BRASIL.csv': fixture('consulta-cand-2026-utf8.csv'),
    })

    const result = parseTseCandidateArchive(Buffer.from(archive), {
      expectedState: 'BR',
    })

    expect(result.fileName).toBe('consulta_cand_2026_BRASIL.csv')
    expect(result.records).toHaveLength(1)
    expect(result.rejected).toEqual([])
  })

  it('reports an invalid ZIP as a typed source error', () => {
    expect(() => parseTseCandidateArchive(Buffer.from('not-a-zip')))
      .toThrow(TseArchiveError)
  })
})
