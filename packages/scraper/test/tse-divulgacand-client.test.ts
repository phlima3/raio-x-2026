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
const RUNNING_MATE_URL =
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
    expect(parseDivulgaCandUrl(RUNNING_MATE_URL).candidateId).toBe('280002551547')
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

  it('normalizes sites, e-mails and the campaign program of one candidacy', async () => {
    const http: DivulgaCandHttpPort = {
      getJson: vi.fn().mockResolvedValue({
        nomeUrna: 'Fulano Presidente',
        nomeCompleto: 'Fulano de Tal',
        partido: { sigla: 'XYZ', numero: 99 },
        cargo: { nome: 'Presidente' },
        descricaoTotalizacao: 'Deferido',
        sites: [{ endereco: 'https://fulano.com.br' }, 'ftp://ignorado', 'https://blog.fulano.com.br'],
        emails: [{ email: 'contato@fulano.com.br' }],
        arquivos: [
          { idArquivo: '1', nomeArquivo: 'proposta_governo1750000000000.pdf', descricaoTipo: 'Proposta de governo' },
          { idArquivo: '2', nomeArquivo: 'certidao_criminal.pdf', descricaoTipo: 'Certidão' },
        ],
      }),
      getBytes: vi.fn().mockResolvedValue(Buffer.from('%PDF-1.4 programa')),
    }
    const client = createDivulgaCandClient({ http })

    const detail = await client.fetchCandidate(target)

    expect(http.getJson).toHaveBeenCalledWith(divulgaCandApiUrl(target))
    expect(detail.tseId).toBe('280002540694')
    expect(detail.party).toBe('XYZ')
    expect(detail.statusLabel).toBe('Deferido')
    // Só endereço navegável entra; o resto do que o candidato declarou fica de fora.
    expect(detail.sites).toEqual(['https://fulano.com.br', 'https://blog.fulano.com.br'])
    expect(detail.emails).toEqual(['contato@fulano.com.br'])
    expect(detail.files.map((file) => file.kind)).toEqual(['CAMPAIGN_PROGRAM', 'ATTACHMENT'])
    expect(detail.files[0].url).toBe(
      divulgaCandFileUrl(target, 'proposta_governo1750000000000.pdf'),
    )
    expect(detail.publicUrl).toBe(CANDIDATE_URL)

    expect(await client.downloadFile(detail.files[0])).toEqual(Buffer.from('%PDF-1.4 programa'))
    expect(http.getBytes).toHaveBeenCalledWith(detail.files[0].url)
  })

  it('accepts a payload whose sites and files arrive as plain strings', async () => {
    const http: DivulgaCandHttpPort = {
      getJson: vi.fn().mockResolvedValue({
        nomeUrna: 'Fulano Presidente',
        sites: ['https://fulano.com.br', 'https://fulano.com.br'],
        arquivos: [{ nomeArquivo: 'PROPOSTA_GOVERNO.pdf' }],
      }),
      getBytes: vi.fn(),
    }

    const detail = await createDivulgaCandClient({ http }).fetchCandidate(target)

    expect(detail.sites).toEqual(['https://fulano.com.br'])
    expect(detail.files).toHaveLength(1)
    expect(detail.files[0].kind).toBe('CAMPAIGN_PROGRAM')
    expect(detail.files[0].id).toBeNull()
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
      getJson: vi.fn().mockResolvedValue({ nomeUrna: 'Fulano' }),
      getBytes: vi.fn(),
    }

    await createDivulgaCandClient({ http, baseUrl: 'https://mirror.local/' })
      .fetchCandidate(target)

    expect(http.getJson).toHaveBeenCalledWith(
      'https://mirror.local/divulga/rest/v1/candidatura/buscar/2026/BR/20322002026/candidato/280002540694',
    )
  })
})
