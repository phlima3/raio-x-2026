import { describe, expect, it, vi } from 'vitest'

import {
  createDivulgaCandClient,
  divulgaCandApiUrl,
  divulgaCandFileUrl,
  DivulgaCandError,
  electoralUnitFor,
  parseDivulgaCandElectionId,
  parseDivulgaCandUrl,
  targetForCandidate,
  type DivulgaCandHttpPort,
} from '../src/sources/tse/divulgaCand'

const CANDIDATE_URL =
  'https://divulgacandcontas.tse.jus.br/divulga/#/candidato/BR/BR/20322002026/280002540694/2026/BR'
const OTHER_CANDIDATE_URL =
  'https://divulgacandcontas.tse.jus.br/divulga/#/candidato/BR/BR/20322002026/280002551547/2026/BR'
const ELECTION_URL = 'https://divulgacandcontas.tse.jus.br/divulga/#/candidato/BR/BR/20322002026'

describe('parseDivulgaCandUrl', () => {
  it('reads the 2026 route the TSE publishes for a presidential candidacy', () => {
    expect(parseDivulgaCandUrl(CANDIDATE_URL)).toEqual({
      year: 2026,
      uf: 'BR',
      electoralUnit: 'BR',
      electionId: '20322002026',
      candidateId: '280002540694',
    })
    expect(parseDivulgaCandUrl(OTHER_CANDIDATE_URL).candidateId).toBe('280002551547')
  })

  it('still reads the legacy route, where the year comes first', () => {
    expect(
      parseDivulgaCandUrl(
        'https://divulgacandcontas.tse.jus.br/divulga/#/candidato/2022/2040602022/BR/280001607829',
      ),
    ).toEqual({
      year: 2022,
      uf: 'BR',
      electoralUnit: 'BR',
      electionId: '2040602022',
      candidateId: '280001607829',
    })
  })

  it('says an election URL is not a candidacy instead of guessing a candidate id', () => {
    expect(() => parseDivulgaCandUrl(ELECTION_URL)).toThrow(DivulgaCandError)
    expect(() => parseDivulgaCandUrl(ELECTION_URL)).toThrow(/eleição 20322002026/)
    expect(parseDivulgaCandElectionId(ELECTION_URL)).toBe('20322002026')
    expect(parseDivulgaCandElectionId(CANDIDATE_URL)).toBe('20322002026')
  })

  it('rejects a route without the candidacy identifiers', () => {
    expect(() => parseDivulgaCandUrl('https://divulgacandcontas.tse.jus.br/divulga/#/home'))
      .toThrow(/sem rota \/candidato/)
    expect(() => parseDivulgaCandUrl(
      'https://divulgacandcontas.tse.jus.br/divulga/#/candidato/BR/BR/20322002026/abc/2026/BR',
    )).toThrow(/não numéricos/)
  })
})

describe('targetForCandidate', () => {
  it('addresses a presidential candidacy by the national electoral unit', () => {
    expect(targetForCandidate({
      tseId: '280002540694',
      position: 'PRESIDENTE',
      state: 'SP',
      electionYear: 2026,
      electionId: '20322002026',
    })).toEqual(parseDivulgaCandUrl(CANDIDATE_URL))
  })

  it('addresses a state race by its UF', () => {
    expect(electoralUnitFor('GOVERNADOR', 'mg')).toBe('MG')
    expect(() => electoralUnitFor('GOVERNADOR', null)).toThrow(/UF inválida/)
  })
})

describe('DivulgaCand client', () => {
  const target = parseDivulgaCandUrl(CANDIDATE_URL)

  // Recorte fiel da resposta de 2026-08-29 para a candidatura 280002540694
  // (Renan Santos), com os tipos que o TSE devolve de verdade: `idArquivo` é
  // número, `codTipo` é string e `tipo` traz a extensão do arquivo, não a
  // descrição do documento.
  const RENAN_PAYLOAD = {
    id: 280002540694,
    nomeUrna: 'RENAN SANTOS',
    nomeCompleto: 'RENAN ANTONIO FERREIRA DOS SANTOS',
    descricaoSituacao: 'Aguardando julgamento',
    descricaoTotalizacao: 'Concorrendo',
    emails: null,
    cargo: { codigo: 1, sigla: null, nome: 'Presidente', titular: true },
    partido: { numero: 14, sigla: 'MISSÃO', nome: 'PARTIDO MISSÃO', sqPrestadorConta: null },
    sites: [
      'https://www.youtube.com/@RenanSantosMBL',
      'https://RENANPRESIDENTE.COM.BR',
      'https://www.youtube.com/@RenanSantosMBL',
    ],
    arquivos: [
      {
        idArquivo: 280017002799,
        nome: 'ilovepdfmerged 1compressed.pdf',
        url: 'candidaturas/oficial/2026/BR/BR/6257/candidatos/151/',
        tipo: 'pdf',
        codTipo: '13',
        fullFilePath: null,
        anonimizado: 'S',
        fileInputStream: null,
        fileByteArray: null,
      },
      {
        idArquivo: 280017002789,
        nome: 'Plano de Governo Missao 2026  Finalcompressed.pdf',
        url: 'candidaturas/oficial/2026/BR/BR/6257/candidatos/151/',
        tipo: 'pdf',
        codTipo: '5',
        fullFilePath: null,
        anonimizado: 'S',
        fileInputStream: null,
        fileByteArray: null,
      },
    ],
  }

  it('normalizes sites and the campaign program of one candidacy', async () => {
    const http: DivulgaCandHttpPort = {
      getJson: vi.fn().mockResolvedValue(RENAN_PAYLOAD),
      getBytes: vi.fn().mockResolvedValue(Buffer.from('%PDF-1.7 programa')),
    }
    const client = createDivulgaCandClient({ http })

    const detail = await client.fetchCandidate(target)

    expect(http.getJson).toHaveBeenCalledWith(divulgaCandApiUrl(target))
    expect(detail.tseId).toBe('280002540694')
    expect(detail.ballotName).toBe('RENAN SANTOS')
    expect(detail.party).toBe('MISSÃO')
    expect(detail.positionLabel).toBe('Presidente')
    // `descricaoTotalizacao` é o que a página estampa no cartão do candidato;
    // `descricaoSituacao` ainda é 'Aguardando julgamento' e não vale como status.
    expect(detail.statusLabel).toBe('Concorrendo')
    // `sites` chega como lista de strings, com repetição.
    expect(detail.sites).toEqual([
      'https://www.youtube.com/@RenanSantosMBL',
      'https://RENANPRESIDENTE.COM.BR',
    ])
    // Nenhuma das candidaturas consultadas trouxe `emails` preenchido: o campo
    // existe e vem `null`, então a leitura tem de resultar em lista vazia.
    expect(detail.emails).toEqual([])
    expect(detail.publicUrl).toBe(CANDIDATE_URL)

    const program = detail.files.find((file) => file.kind === 'CAMPAIGN_PROGRAM')
    expect(program?.name).toBe('Plano de Governo Missao 2026  Finalcompressed.pdf')
    // `idArquivo` vem como número e é a chave do download.
    expect(program?.id).toBe('280017002789')
    expect(program?.url).toBe(divulgaCandFileUrl('280017002789'))
    expect(program?.url).toBe(
      'https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/doc/280017002789',
    )
    // A certidão não pode virar programa de governo.
    expect(detail.files.map((file) => file.kind)).toEqual(['ATTACHMENT', 'CAMPAIGN_PROGRAM'])

    expect(await client.downloadFile(program!)).toEqual(Buffer.from('%PDF-1.7 programa'))
    expect(http.getBytes).toHaveBeenCalledWith(program!.url)
  })

  it('classifies by codTipo, not by the free-form filename', async () => {
    // Augusto Cury (280002551547) protocolou duas versões do plano de governo,
    // uma com o nome grudado ("PLANO DE GOVERNOO BRASIL..."), e certidões cujo
    // `tipo` também é "pdf". Só o `codTipo` separa uma coisa da outra.
    const http: DivulgaCandHttpPort = {
      getJson: vi.fn().mockResolvedValue({
        nomeUrna: 'ESCRITOR AUGUSTO CURY',
        nomeCompleto: 'AUGUSTO JORGE CURY',
        cargo: { nome: 'Presidente' },
        partido: { sigla: 'AVANTE', nome: 'AVANTE' },
        descricaoTotalizacao: 'Concorrendo',
        sites: [],
        emails: null,
        arquivos: [
          {
            idArquivo: 280017125644,
            nome: 'pje-Certidão para fins eleitorais - regionalizada - TRF3 - Augusto Cury.pdf',
            tipo: 'pdf',
            codTipo: '11',
          },
          {
            idArquivo: 280017125643,
            nome: 'pje-Plano de Governo - O BRASIL DOS NOSSOS SONHOS .pdf',
            tipo: 'pdf',
            codTipo: '5',
          },
          {
            idArquivo: 280017104778,
            nome: 'PLANO DE GOVERNOO BRASIL DOS NOSSOS SONHOS.pdf',
            tipo: 'pdf',
            codTipo: '5',
          },
          { idArquivo: 280017104771, nome: 'TJSP 2.pdf', tipo: 'pdf', codTipo: '14' },
        ],
      }),
      getBytes: vi.fn(),
    }

    const detail = await createDivulgaCandClient({ http }).fetchCandidate(target)

    expect(detail.files.map((file) => file.kind)).toEqual([
      'ATTACHMENT',
      'CAMPAIGN_PROGRAM',
      'CAMPAIGN_PROGRAM',
      'ATTACHMENT',
    ])
    // O rótulo sai do mapa de tipos do TSE; `tipo` ("pdf") é só a extensão.
    expect(detail.files[1].typeLabel).toBe('Proposta de Governo')
    expect(detail.files[3].typeLabel).toBe('Certidão criminal da Justiça Estadual de 2º grau')
    // Duas versões distintas do plano continuam sendo dois anexos.
    expect(detail.files.filter((file) => file.kind === 'CAMPAIGN_PROGRAM')).toHaveLength(2)
  })

  it('falls back to the filename when the type code is unknown', async () => {
    const http: DivulgaCandHttpPort = {
      getJson: vi.fn().mockResolvedValue({
        nomeUrna: 'Fulano Presidente',
        arquivos: [
          { idArquivo: 9, nome: 'PROPOSTA_GOVERNO.pdf', tipo: 'pdf', codTipo: '99' },
          { idArquivo: 10, nome: 'foto.pdf', tipo: 'pdf' },
        ],
      }),
      getBytes: vi.fn(),
    }

    const detail = await createDivulgaCandClient({ http }).fetchCandidate(target)

    expect(detail.files.map((file) => file.kind)).toEqual(['CAMPAIGN_PROGRAM', 'ATTACHMENT'])
    expect(detail.files[0].typeLabel).toBeNull()
  })

  it('drops an attachment with no idArquivo, which has no download address', async () => {
    const http: DivulgaCandHttpPort = {
      getJson: vi.fn().mockResolvedValue({
        nomeUrna: 'Fulano Presidente',
        arquivos: [
          { nome: 'sem_id.pdf', tipo: 'pdf', codTipo: '5' },
          { idArquivo: 280017002789, nome: 'com_id.pdf', tipo: 'pdf', codTipo: '5' },
        ],
      }),
      getBytes: vi.fn(),
    }

    const detail = await createDivulgaCandClient({ http }).fetchCandidate(target)

    expect(detail.files).toHaveLength(1)
    expect(detail.files[0].id).toBe('280017002789')
  })

  it('treats a 200 without a name as a candidacy that does not exist', async () => {
    const http: DivulgaCandHttpPort = {
      getJson: vi.fn().mockResolvedValue({ mensagem: 'Candidato não encontrado' }),
      getBytes: vi.fn(),
    }

    await expect(createDivulgaCandClient({ http }).fetchCandidate(target))
      .rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('honours a base URL override so a mirror can be pointed at in staging', async () => {
    const http: DivulgaCandHttpPort = {
      getJson: vi.fn().mockResolvedValue({
        nomeUrna: 'Fulano',
        arquivos: [{ idArquivo: 7, nome: 'plano.pdf', codTipo: '5' }],
      }),
      getBytes: vi.fn(),
    }

    const detail = await createDivulgaCandClient({ http, baseUrl: 'https://mirror.local/' })
      .fetchCandidate(target)

    expect(http.getJson).toHaveBeenCalledWith(
      'https://mirror.local/divulga/rest/v1/candidatura/buscar/2026/BR/20322002026/candidato/280002540694',
    )
    expect(detail.files[0].url).toBe('https://mirror.local/divulga/rest/arquivo/doc/7')
  })
})
