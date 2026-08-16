import assert from 'node:assert/strict'
import test from 'node:test'
import { OfficialCandidacyStatus } from '@prisma/client'

import { parseTseCandidateCsv } from './tse/candidateCsv'
import {
  mapTseJudgmentStatus,
  resolveTseCandidateJudgments,
} from './tse/candidacyStatus'

function parseStatus(rawStatus: string) {
  const csv = [
    'ANO_ELEICAO;CD_ELEICAO;SG_UF;DS_CARGO;SQ_CANDIDATO;NM_CANDIDATO;SG_PARTIDO;DS_SITUACAO_CANDIDATURA',
    `2026;999;BR;PRESIDENTE;280001;ANA DA SILVA;ABC;${rawStatus}`,
  ].join('\n')
  return parseTseCandidateCsv(Buffer.from(csv, 'utf8')).records[0]?.normalizedStatus
}

test('normalizes official TSE candidacy statuses through the modular parser', () => {
  assert.equal(parseStatus('APTO'), 'ELIGIBLE')
  assert.equal(parseStatus('AGUARDANDO JULGAMENTO'), 'PENDING')
  assert.equal(parseStatus('INDEFERIDO COM RECURSO'), 'INELIGIBLE')
  assert.equal(parseStatus('RENÚNCIA'), 'CANCELLED')
  assert.equal(parseStatus('RÓTULO FUTURO'), 'UNKNOWN')
})

test('keeps unsupported offices parseable so publication policy can hide them', () => {
  const csv = [
    'ANO_ELEICAO;CD_ELEICAO;SG_UF;DS_CARGO;SQ_CANDIDATO;NM_CANDIDATO;SG_PARTIDO;DS_SITUACAO_CANDIDATURA',
    '2026;999;SP;DEPUTADO FEDERAL;280002;BRUNO LIMA;XYZ;APTO',
  ].join('\n')
  const result = parseTseCandidateCsv(Buffer.from(csv, 'utf8'))

  assert.equal(result.records.length, 1)
  assert.equal(result.records[0].position, 'DEPUTADO_FEDERAL')
})

test('fails closed for generic INAPTO and conflicting undated judgments', () => {
  assert.equal(mapTseJudgmentStatus({
    SQ_CANDIDATO: '1',
    DS_SITUACAO_CANDIDATO_TOT: 'INAPTO',
  }), 'status_nao_mapeado')

  const judgment = resolveTseCandidateJudgments([
    { SQ_CANDIDATO: '1', DS_SITUACAO_JULGAMENTO: 'DEFERIDO' },
    { SQ_CANDIDATO: '1', DS_SITUACAO_JULGAMENTO: 'INDEFERIDO' },
  ]).get('1')
  assert.equal(judgment?.ambiguous, true)
  assert.equal(judgment?.officialStatus, OfficialCandidacyStatus.UNKNOWN)
})

test('uses the newest timestamp and exposes the replacement chain', () => {
  const judgments = resolveTseCandidateJudgments([
    {
      SQ_CANDIDATO: 'new',
      SQ_SUBSTITUIDO: 'old',
      DS_SITUACAO_JULGAMENTO: 'INDEFERIDO',
      DT_GERACAO: '01/08/2026',
      HH_GERACAO: '08:00:00',
    },
    {
      SQ_CANDIDATO: 'new',
      SQ_SUBSTITUIDO: 'old',
      DS_SITUACAO_JULGAMENTO: 'DEFERIDO',
      DT_GERACAO: '02/08/2026',
      HH_GERACAO: '08:00:00',
    },
  ])

  assert.equal(judgments.get('new')?.candidacyStatus, 'deferido')
  assert.equal(judgments.get('new')?.officialStatus, OfficialCandidacyStatus.ELIGIBLE)
  assert.equal(judgments.get('new')?.replacesCandidateId, 'old')
})
