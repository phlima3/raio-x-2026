import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { parseTseCandidateCsv } from '../src/sources/tse/candidateCsv'

const fixture = (name: string): Buffer =>
  readFileSync(fileURLToPath(new URL(`./fixtures/tse/${name}`, import.meta.url)))

describe('parseTseCandidateCsv', () => {
  it('reads a quoted semicolon-delimited UTF-8 candidate row through its public interface', () => {
    const result = parseTseCandidateCsv(
      fixture('consulta-cand-2026-utf8.csv'),
      { encoding: 'utf8' },
    )

    expect(result.records).toEqual([
      expect.objectContaining({
        tseId: '260000000001',
        electionYear: 2026,
        electionId: '999',
        state: 'BR',
        position: 'PRESIDENTE',
        name: 'MARIA DA SILVA',
        ballotName: 'MARIA; DO POVO',
        party: 'ABC',
        ballotNumber: 10,
        rawStatus: 'APTO',
        normalizedStatus: 'ELIGIBLE',
      }),
    ])
    expect(result.rejected).toEqual([])
    expect(result.records[0].raw).not.toHaveProperty('NR_CPF_CANDIDATO')
  })

  it('auto-detects Latin-1 and maps official null markers without corrupting names', () => {
    const latin1Csv = [
      'ANO_ELEICAO;CD_ELEICAO;SG_UF;DS_CARGO;SQ_CANDIDATO;NM_CANDIDATO;NM_URNA_CANDIDATO;SG_PARTIDO;NR_CANDIDATO;DS_SITUACAO_CANDIDATURA',
      '2026;999;SP;GOVERNADOR;260000000002;JOÃO AÇÃO;#NULO#;XYZ;-1;INDEFERIDO COM RECURSO',
    ].join('\r\n')

    const result = parseTseCandidateCsv(Buffer.from(latin1Csv, 'latin1'))

    expect(result.encoding).toBe('latin1')
    expect(result.records[0]).toEqual(expect.objectContaining({
      name: 'JOÃO AÇÃO',
      ballotName: null,
      ballotNumber: null,
      normalizedStatus: 'INELIGIBLE',
    }))
  })

  it('rejects an invalid UF while tolerating columns added by the TSE', () => {
    const csv = [
      'ANO_ELEICAO;CD_ELEICAO;SG_UF;DS_CARGO;SQ_CANDIDATO;NM_CANDIDATO;SG_PARTIDO;DS_SITUACAO_CANDIDATURA;CAMPO_FUTURO',
      '2026;999;XX;SENADOR;260000000003;NOME TESTE;XYZ;APTO;valor',
    ].join('\n')

    const result = parseTseCandidateCsv(Buffer.from(csv, 'utf8'))

    expect(result.records).toEqual([])
    expect(result.columns).toContain('CAMPO_FUTURO')
    expect(result.rejected).toEqual([
      expect.objectContaining({ row: 2, reason: 'SG_UF inválida' }),
    ])
  })
})
