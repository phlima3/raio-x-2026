import { PrismaClient, SyncRunStatus } from '@prisma/client'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { runCamaraSync, type CamaraHttpPort } from '../src/sources/camara'

const databaseUrl = process.env.DATABASE_URL ?? ''
if (!databaseUrl.includes('_test')) {
  throw new Error('Integration tests require a DATABASE_URL whose database name contains _test')
}

const prisma = new PrismaClient()

async function clearData() {
  await prisma.reviewItem.deleteMany()
  await prisma.votingRecord.deleteMany()
  await prisma.legislativeBillAuthor.deleteMany()
  await prisma.legislativeBill.deleteMany()
  await prisma.candidate.deleteMany()
  await prisma.mandate.deleteMany()
  await prisma.person.deleteMany()
  await prisma.dataSyncRun.deleteMany()
}

describe('runCamaraSync', () => {
  beforeEach(clearData)

  afterAll(async () => {
    await clearData()
    await prisma.$disconnect()
  })

  it('persists a deputy as Person/Mandate without creating a candidacy', async () => {
    const get = vi.fn(async (url: string) => {
      if (url === '/deputados') {
        return { data: { dados: [{ id: 10, nome: 'Deputada Teste' }], links: [] } }
      }
      if (url === '/deputados/10') {
        return {
          data: {
            dados: {
              id: 10,
              uri: 'https://dadosabertos.camara.leg.br/api/v2/deputados/10',
              nomeCivil: 'Deputada Teste da Silva',
              ultimoStatus: {
                nome: 'Deputada Teste',
                nomeEleitoral: 'Deputada Teste',
                siglaPartido: 'PX',
                siglaUf: 'SP',
                idLegislatura: 57,
                situacao: 'Exercício',
              },
            },
            links: [],
          },
        }
      }
      if (url === '/votacoes' || url === '/proposicoes') {
        return { data: { dados: [], links: [] } }
      }
      throw new Error(`Unexpected Câmara URL: ${url}`)
    })
    const result = await runCamaraSync({
      prisma,
      client: { get } as CamaraHttpPort,
      pauseMs: 0,
    })

    expect(result.status).toBe(SyncRunStatus.SUCCESS)
    expect(await prisma.person.count()).toBe(1)
    expect(await prisma.mandate.count()).toBe(1)
    expect(await prisma.candidate.count()).toBe(0)
  })

  it('persists proposal summaries without per-bill detail requests and preserves richer status', async () => {
    let summary = 'Ementa original'
    const get = vi.fn(async (url: string) => {
      if (url === '/deputados') {
        return { data: { dados: [{ id: 10, nome: 'Deputada Teste' }], links: [] } }
      }
      if (url === '/deputados/10') {
        return {
          data: {
            dados: {
              id: 10,
              uri: 'https://dadosabertos.camara.leg.br/api/v2/deputados/10',
              nomeCivil: 'Deputada Teste da Silva',
              ultimoStatus: {
                nome: 'Deputada Teste',
                nomeEleitoral: 'Deputada Teste',
                siglaPartido: 'PX',
                siglaUf: 'SP',
                idLegislatura: 57,
                situacao: 'Exercício',
              },
            },
            links: [],
          },
        }
      }
      if (url === '/votacoes') return { data: { dados: [], links: [] } }
      if (url === '/proposicoes') {
        return {
          data: {
            dados: [{
              id: 501,
              uri: 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/501',
              siglaTipo: 'PL',
              codTipo: 139,
              numero: 1,
              ano: 2026,
              ementa: summary,
              dataApresentacao: '2026-02-01T12:00:00Z',
            }],
            links: [],
          },
        }
      }
      if (url === '/proposicoes/501') {
        return {
          data: {
            dados: {
              id: 501,
              siglaTipo: 'PL',
              numero: 1,
              ano: 2026,
              ementa: summary,
              ementaDetalhada: `${summary} detalhada`,
              statusProposicao: { descricaoSituacao: 'Rejeitada' },
            },
            links: [],
          },
        }
      }
      throw new Error(`Unexpected Câmara URL: ${url}`)
    })
    const options = {
      prisma,
      client: { get } as CamaraHttpPort,
      pauseMs: 0,
      syncDate: new Date('2026-08-03T12:00:00Z'),
    }

    await runCamaraSync(options)
    expect(get.mock.calls.some(([url]) => url === '/proposicoes/501')).toBe(false)

    await prisma.legislativeBill.update({
      where: { source_externalId: { source: 'CAMARA', externalId: '501' } },
      data: { status: 'APPROVED' },
    })
    summary = 'Ementa oficial atualizada'
    await runCamaraSync(options)

    expect(await prisma.legislativeBill.count()).toBe(1)
    expect(await prisma.legislativeBillAuthor.count()).toBe(1)
    expect(await prisma.legislativeBill.findUnique({
      where: { source_externalId: { source: 'CAMARA', externalId: '501' } },
      select: { description: true, status: true },
    })).toEqual({ description: summary, status: 'APPROVED' })
  })

  it('uses a rolling window and loads each voting session once for all deputies', async () => {
    const deputies = [
      { id: 10, nome: 'Deputada Um' },
      { id: 20, nome: 'Deputado Dois' },
    ]
    const get = vi.fn(async (url: string, config?: { params?: Record<string, unknown> }) => {
      if (url === '/deputados') {
        return { data: { dados: deputies, links: [] } }
      }
      if (url === '/deputados/10' || url === '/deputados/20') {
        const id = Number(url.split('/').at(-1))
        const summary = deputies.find((deputy) => deputy.id === id)!
        return {
          data: {
            dados: {
              id,
              uri: `https://dadosabertos.camara.leg.br/api/v2/deputados/${id}`,
              nomeCivil: `${summary.nome} da Silva`,
              ultimoStatus: {
                nome: summary.nome,
                nomeEleitoral: summary.nome,
                siglaPartido: 'PX',
                siglaUf: id === 10 ? 'SP' : 'RJ',
                idLegislatura: 57,
                situacao: 'Exercício',
              },
            },
            links: [],
          },
        }
      }
      if (url === '/votacoes') {
        return {
          data: {
            dados: [{
              id: 'session-1',
              data: '2026-08-02',
              dataHoraRegistro: '2026-08-02T12:00:00Z',
              siglaOrgao: 'PLEN',
              proposicaoObjeto: 'PL 1/2026',
              uriProposicaoObjeto: null,
              descricao: 'Votação nominal',
            }],
            links: [],
          },
        }
      }
      if (url === '/votacoes/session-1/votos') {
        return {
          data: {
            dados: deputies.map((deputy) => ({
              tipoVoto: deputy.id === 10 ? 'Sim' : 'Não',
              dataRegistroVoto: '2026-08-02T12:00:00Z',
              deputado_: { id: deputy.id },
            })),
            links: [],
          },
        }
      }
      if (url === '/proposicoes') {
        return { data: { dados: [], links: [] } }
      }
      throw new Error(`Unexpected Câmara URL: ${url}`)
    })
    const options = {
      prisma,
      client: { get } as CamaraHttpPort,
      pauseMs: 0,
      syncDate: new Date('2026-08-03T12:00:00Z'),
    }

    const result = await runCamaraSync(options)

    expect(result.status).toBe(SyncRunStatus.SUCCESS)
    const sessionCalls = get.mock.calls.filter(([url]) => url === '/votacoes')
    expect(sessionCalls).toHaveLength(1)
    expect(sessionCalls[0]?.[1]?.params).toMatchObject({
      dataInicio: '2026-07-27',
      dataFim: '2026-08-03',
    })
    const proposalCalls = get.mock.calls.filter(([url]) => url === '/proposicoes')
    expect(proposalCalls).toHaveLength(2)
    expect(proposalCalls.every(([, config]) => config?.params?.ano === 2026)).toBe(true)
    expect(await prisma.votingRecord.count()).toBe(2)
  })

  it('records a failed source run before propagating the error', async () => {
    const client: CamaraHttpPort = {
      get: vi.fn().mockRejectedValue(new Error('Câmara unavailable')),
    }

    await expect(runCamaraSync({ prisma, client, pauseMs: 0 }))
      .rejects.toThrow('Câmara unavailable')

    const failed = await prisma.dataSyncRun.findFirst({ orderBy: { startedAt: 'desc' } })
    expect(failed?.status).toBe(SyncRunStatus.FAILED)
    expect(failed?.error).toContain('Câmara unavailable')
  })

  it('fails the source run when a shared voting session remains unavailable', async () => {
    const get = vi.fn(async (url: string) => {
      if (url === '/deputados') {
        return { data: { dados: [{ id: 10, nome: 'Deputada Teste' }], links: [] } }
      }
      if (url === '/votacoes') {
        return {
          data: {
            dados: [{
              id: 'unavailable-session',
              data: '2026-08-02',
              dataHoraRegistro: '2026-08-02T12:00:00Z',
              siglaOrgao: 'PLEN',
              proposicaoObjeto: 'PL 1/2026',
              uriProposicaoObjeto: null,
              descricao: 'Votação nominal',
            }],
            links: [],
          },
        }
      }
      if (url === '/votacoes/unavailable-session/votos') {
        throw new Error('session votes unavailable')
      }
      if (url === '/deputados/10') {
        return {
          data: {
            dados: {
              id: 10,
              uri: 'https://dadosabertos.camara.leg.br/api/v2/deputados/10',
              nomeCivil: 'Deputada Teste da Silva',
              ultimoStatus: {
                nome: 'Deputada Teste',
                nomeEleitoral: 'Deputada Teste',
                siglaPartido: 'PX',
                siglaUf: 'SP',
                idLegislatura: 57,
                situacao: 'Exercício',
              },
            },
            links: [],
          },
        }
      }
      if (url === '/proposicoes') return { data: { dados: [], links: [] } }
      throw new Error(`Unexpected Câmara URL: ${url}`)
    })

    await expect(runCamaraSync({
      prisma,
      client: { get } as CamaraHttpPort,
      pauseMs: 0,
      syncDate: new Date('2026-08-03T12:00:00Z'),
    })).rejects.toThrow('1 of 1 voting sessions failed')

    const failed = await prisma.dataSyncRun.findFirst({ orderBy: { startedAt: 'desc' } })
    expect(failed?.status).toBe(SyncRunStatus.FAILED)
    expect(failed?.error).toContain('voting sessions failed')
  })
})
