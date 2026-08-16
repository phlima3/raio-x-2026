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

  it('concatenates every candidate CSV so no electoral unit is silently dropped', () => {
    const header = [
      'ANO_ELEICAO', 'CD_ELEICAO', 'SG_UF', 'DS_CARGO', 'SQ_CANDIDATO',
      'NM_CANDIDATO', 'NM_URNA_CANDIDATO', 'SG_PARTIDO', 'NR_CANDIDATO',
      'DS_SITUACAO_CANDIDATURA',
    ].join(';')
    const row = (uf: string, position: string, tseId: string, name: string): string =>
      [2026, 999, uf, position, tseId, name, name, 'ABC', 10, 'APTO'].join(';')

    const archive = zipSync({
      'consulta_cand_2026_BR.csv': strToU8(
        [header, row('BR', 'PRESIDENTE', '2600001', 'PRESIDENCIAVEL')].join('\n'),
      ),
      'consulta_cand_2026_SP.csv': strToU8(
        [header, row('SP', 'GOVERNADOR', '2600002', 'GOVERNADOR SP')].join('\n'),
      ),
      'consulta_cand_2026_MG.csv': strToU8(
        [header, row('MG', 'SENADOR', '2600003', 'SENADOR MG')].join('\n'),
      ),
    })

    const result = parseTseCandidateArchive(Buffer.from(archive))

    expect(result.fileNames).toHaveLength(3)
    expect(result.records.map((record) => record.tseId).sort())
      .toEqual(['2600001', '2600002', '2600003'])
    expect(result.duplicates).toBe(0)
  })

  it('deduplicates by SQ_CANDIDATO when a consolidated CSV repeats the per-UF files', () => {
    const header = [
      'ANO_ELEICAO', 'CD_ELEICAO', 'SG_UF', 'DS_CARGO', 'SQ_CANDIDATO',
      'NM_CANDIDATO', 'SG_PARTIDO', 'DS_SITUACAO_CANDIDATURA',
    ].join(';')
    const row = (uf: string, tseId: string): string =>
      [2026, 999, uf, 'GOVERNADOR', tseId, 'NOME TESTE', 'ABC', 'APTO'].join(';')

    const archive = zipSync({
      'consulta_cand_2026_BRASIL.csv': strToU8(
        [header, row('SP', '2600010'), row('MG', '2600011')].join('\n'),
      ),
      'consulta_cand_2026_SP.csv': strToU8([header, row('SP', '2600010')].join('\n')),
    })

    const result = parseTseCandidateArchive(Buffer.from(archive))

    expect(result.records.map((record) => record.tseId)).toEqual(['2600010', '2600011'])
    expect(result.duplicates).toBe(1)
  })

  it('reports an invalid ZIP as a typed source error', () => {
    expect(() => parseTseCandidateArchive(Buffer.from('not-a-zip')))
      .toThrow(TseArchiveError)
  })
})
