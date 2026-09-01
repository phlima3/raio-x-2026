import { describe, expect, it } from 'vitest'

import { candidacyPublicUrl } from '../src/sources/tse/divulgaCand'

const PRESIDENTE = {
  tseId: '280002540694',
  position: 'PRESIDENTE',
  state: 'DF',
  electionYear: 2026,
}

describe('candidacyPublicUrl', () => {
  it('builds the public candidacy page the TSE divulges', () => {
    expect(candidacyPublicUrl(PRESIDENTE)).toBe(
      'https://divulgacandcontas.tse.jus.br/divulga/#/candidato/BR/BR/20322002026/280002540694/2026/BR',
    )
  })

  it('addresses a national race by BR, ignoring the candidate domicile', () => {
    // O DivulgaCandContas indexa pela unidade eleitoral: na presidencial é BR,
    // e a UF do candidato não entra na URL.
    expect(candidacyPublicUrl({ ...PRESIDENTE, state: 'SP' })).toBe(
      candidacyPublicUrl({ ...PRESIDENTE, state: 'RJ' }),
    )
    expect(candidacyPublicUrl({ ...PRESIDENTE, position: 'VICE_PRESIDENTE' })).toContain(
      '/candidato/BR/BR/',
    )
  })

  it('addresses a state race by the UF', () => {
    expect(
      candidacyPublicUrl({
        tseId: '130001234567',
        position: 'GOVERNADOR',
        state: 'mg',
        electionYear: 2026,
      }),
    ).toBe(
      'https://divulgacandcontas.tse.jus.br/divulga/#/candidato/MG/MG/20322002026/130001234567/2026/MG',
    )
  })

  it('returns null instead of throwing when the candidacy cannot be addressed', () => {
    // `electoralUnitFor` lança com UF inválida numa disputa estadual. Uma linha
    // ruim do snapshot não pode derrubar a importação inteira: sem página, quem
    // cita cai no endereço do dataset.
    for (const state of [null, '', 'BRASIL', '??']) {
      expect(
        candidacyPublicUrl({ tseId: '1', position: 'GOVERNADOR', state, electionYear: 2026 }),
      ).toBeNull()
    }
  })

  it('returns null when there is no usable SQ_CANDIDATO', () => {
    for (const tseId of [null, '', 'abc', '12a34']) {
      expect(candidacyPublicUrl({ ...PRESIDENTE, tseId })).toBeNull()
    }
  })
})
