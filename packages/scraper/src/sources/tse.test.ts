import assert from 'node:assert/strict'
import test from 'node:test'
import {
  joinTseCandidateJudgments,
  mapTseCandidacyStatus,
  mapTseJudgmentStatus,
  parseTseCandidateComplementsCsv,
  parseTseCandidatesCsv,
  selectRunningMateForCandidate,
} from './tse'

test('maps only explicit TSE decisions beyond registro solicitado', () => {
  assert.equal(mapTseCandidacyStatus('#NE'), 'registro_solicitado')
  assert.equal(mapTseCandidacyStatus('APTO'), 'registro_solicitado')
  assert.equal(mapTseCandidacyStatus('INAPTO'), 'status_nao_mapeado')
  assert.equal(mapTseCandidacyStatus('DEFERIDO COM RECURSO'), 'deferido')
  assert.equal(mapTseCandidacyStatus('INDEFERIDO'), 'indeferido')
  assert.equal(mapTseCandidacyStatus('RENÚNCIA'), 'desistiu')
})

test('parses relevant 2026 records and ignores unsupported offices', () => {
  const csv = [
    '"ANO_ELEICAO";"DS_CARGO";"SQ_CANDIDATO";"NM_CANDIDATO";"NM_URNA_CANDIDATO";"NM_SOCIAL_CANDIDATO";"SG_PARTIDO";"SG_UF";"NR_CANDIDATO";"DS_SITUACAO_CANDIDATURA";"SQ_COLIGACAO";"NM_COLIGACAO";"DT_GERACAO";"HH_GERACAO"',
    '2026;"PRESIDENTE";280001;"ANA DA SILVA";"ANA NA URNA";"ANA SOCIAL";"ABC";"BR";10;"#NE";900;"ABC";"07/08/2026";"12:30:08"',
    '2026;"DEPUTADO FEDERAL";280002;"BRUNO LIMA";"BRUNO";"#NULO";"XYZ";"SP";1234;"#NE";901;"XYZ";"07/08/2026";"12:30:08"',
  ].join('\n')

  const records = parseTseCandidatesCsv(csv, 2026)
  assert.equal(records.length, 1)
  assert.equal(records[0].tseId, '280001')
  assert.equal(records[0].socialName, 'ANA SOCIAL')
  assert.equal(records[0].candidacyStatus, 'registro_solicitado')
})

test('maps judicial status from the complementary TSE dataset conservatively', () => {
  assert.equal(mapTseJudgmentStatus({ judgment: 'AGUARDANDO JULGAMENTO' }), 'registro_solicitado')
  assert.equal(mapTseJudgmentStatus({ judgment: 'INAPTO' }), 'status_nao_mapeado')
  assert.equal(mapTseJudgmentStatus({ judgment: 'DEFERIDO COM RECURSO' }), 'deferido')
  assert.equal(mapTseJudgmentStatus({ detail: 'INDEFERIDO' }), 'indeferido')
  assert.equal(mapTseJudgmentStatus({ detail: 'RENÚNCIA' }), 'desistiu')
  assert.equal(mapTseJudgmentStatus({ detail: 'CANCELADO' }), 'cancelado')
  assert.equal(mapTseJudgmentStatus({ detail: 'PEDIDO NÃO CONHECIDO' }), 'pedido_nao_conhecido')
  assert.equal(mapTseJudgmentStatus({ detail: 'CASSADO COM RECURSO' }), 'cassado')
  assert.equal(mapTseJudgmentStatus({ detail: 'FALECIMENTO' }), 'falecido')
  assert.equal(mapTseJudgmentStatus({ detail: 'RÓTULO FUTURO' }), 'status_nao_mapeado')
  assert.equal(
    mapTseJudgmentStatus({ judgment: 'AGUARDANDO JULGAMENTO', substituted: 'S' }),
    'substituido',
  )
})

test('joins complementary judgments by the stable SQ_CANDIDATO identifier', () => {
  const candidatesCsv = [
    '"ANO_ELEICAO";"DS_CARGO";"SQ_CANDIDATO";"NM_CANDIDATO";"NM_SOCIAL_CANDIDATO";"SG_PARTIDO";"SG_UF";"NR_CANDIDATO";"DS_SITUACAO_CANDIDATURA";"SQ_COLIGACAO";"NM_COLIGACAO";"DT_GERACAO";"HH_GERACAO"',
    '2026;"PRESIDENTE";280001;"ANA DA SILVA";"#NULO";"ABC";"BR";10;"APTO";900;"ABC";"07/08/2026";"12:30:08"',
  ].join('\n')
  const complementsCsv = [
    '"ANO_ELEICAO";"SQ_CANDIDATO";"DS_DETALHE_SITUACAO_CAND";"ST_SUBSTITUIDO";"DS_SITUACAO_JULGAMENTO"',
    '2026;280001;"DEFERIDO";"N";"DEFERIDO"',
  ].join('\n')

  const candidates = parseTseCandidatesCsv(candidatesCsv, 2026)
  const judgments = parseTseCandidateComplementsCsv(complementsCsv, 2026)
  const joined = joinTseCandidateJudgments(candidates, judgments)

  assert.equal(joined.length, 1)
  assert.equal(joined[0].candidacyStatus, 'deferido')
  assert.equal(judgments[0].judgmentLabel, 'DEFERIDO')
})

test('pairs only the current presidential candidate with the active vice endpoint', () => {
  const candidatesCsv = [
    '"ANO_ELEICAO";"DS_CARGO";"SQ_CANDIDATO";"NM_CANDIDATO";"NM_SOCIAL_CANDIDATO";"SG_PARTIDO";"SG_UF";"NR_CANDIDATO";"DS_SITUACAO_CANDIDATURA";"SQ_COLIGACAO";"NM_COLIGACAO";"DT_GERACAO";"HH_GERACAO"',
    '2026;"PRESIDENTE";pres-old;"PRESIDENTE ORIGINAL";"#NULO";"ABC";"BR";10;"INAPTO";coalition-1;"ABC";"07/08/2026";"12:30:08"',
    '2026;"VICE-PRESIDENTE";vice-old;"VICE ORIGINAL";"#NULO";"ABC";"BR";10;"INAPTO";coalition-1;"ABC";"07/08/2026";"12:30:08"',
    '2026;"PRESIDENTE";pres-new;"PRESIDENTE SUBSTITUTO";"#NULO";"ABC";"BR";10;"APTO";coalition-1;"ABC";"07/08/2026";"12:30:08"',
    '2026;"VICE-PRESIDENTE";vice-new;"VICE SUBSTITUTA";"#NULO";"ABC";"BR";10;"APTO";coalition-1;"ABC";"07/08/2026";"12:30:08"',
  ].join('\n')
  const complementsCsv = [
    '"ANO_ELEICAO";"SQ_CANDIDATO";"DS_DETALHE_SITUACAO_CAND";"ST_SUBSTITUIDO";"SQ_SUBSTITUIDO";"DS_SITUACAO_JULGAMENTO"',
    '2026;pres-old;"INDEFERIDO";"S";"-1";"#NE"',
    '2026;vice-old;"RENÚNCIA";"S";"-1";"#NE"',
    '2026;pres-new;"DEFERIDO";"N";pres-old;"#NE"',
    '2026;vice-new;"DEFERIDO";"N";vice-old;"#NE"',
  ].join('\n')
  const records = joinTseCandidateJudgments(
    parseTseCandidatesCsv(candidatesCsv, 2026),
    parseTseCandidateComplementsCsv(complementsCsv, 2026),
  )
  const oldPresident = records.find((record) => record.tseId === 'pres-old')!
  const newPresident = records.find((record) => record.tseId === 'pres-new')!

  assert.equal(selectRunningMateForCandidate(oldPresident, records), undefined)
  assert.equal(selectRunningMateForCandidate(newPresident, records)?.tseId, 'vice-new')
})

test('handles independent replacement of only the vice', () => {
  const candidatesCsv = [
    '"ANO_ELEICAO";"DS_CARGO";"SQ_CANDIDATO";"NM_CANDIDATO";"NM_SOCIAL_CANDIDATO";"SG_PARTIDO";"SG_UF";"NR_CANDIDATO";"DS_SITUACAO_CANDIDATURA";"SQ_COLIGACAO";"NM_COLIGACAO";"DT_GERACAO";"HH_GERACAO"',
    '2026;"PRESIDENTE";pres;"PRESIDENTE";"#NULO";"ABC";"BR";10;"APTO";coalition-2;"ABC";"07/08/2026";"12:30:08"',
    '2026;"VICE-PRESIDENTE";vice-old;"VICE ORIGINAL";"#NULO";"ABC";"BR";10;"INAPTO";coalition-2;"ABC";"07/08/2026";"12:30:08"',
    '2026;"VICE-PRESIDENTE";vice-new;"VICE SUBSTITUTA";"#NULO";"ABC";"BR";10;"APTO";coalition-2;"ABC";"07/08/2026";"12:30:08"',
  ].join('\n')
  const complementsCsv = [
    '"ANO_ELEICAO";"SQ_CANDIDATO";"DS_DETALHE_SITUACAO_CAND";"ST_SUBSTITUIDO";"SQ_SUBSTITUIDO";"DS_SITUACAO_JULGAMENTO"',
    '2026;pres;"DEFERIDO";"N";"-1";"#NE"',
    '2026;vice-old;"RENÚNCIA";"S";"-1";"#NE"',
    '2026;vice-new;"DEFERIDO";"N";vice-old;"#NE"',
  ].join('\n')
  const records = joinTseCandidateJudgments(
    parseTseCandidatesCsv(candidatesCsv, 2026),
    parseTseCandidateComplementsCsv(complementsCsv, 2026),
  )
  const president = records.find((record) => record.tseId === 'pres')!

  assert.equal(selectRunningMateForCandidate(president, records)?.tseId, 'vice-new')
})
