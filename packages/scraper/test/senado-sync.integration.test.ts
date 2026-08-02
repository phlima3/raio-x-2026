import { PrismaClient, SyncRunStatus } from '@prisma/client'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { runSenadoSync, type SenadoHttpPort } from '../src/sources/senado'

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

function makeClient(): SenadoHttpPort {
  const get = vi.fn(async (url: string) => {
    if (url === '/senador/lista/atual') {
      return {
        data: {
          ListaParlamentarEmExercicio: {
            Parlamentares: {
              Parlamentar: [{
                IdentificacaoParlamentar: {
                  CodigoParlamentar: '5672',
                  NomeParlamentar: 'Alan Rick',
                  SiglaPartidoParlamentar: 'REPUBLICANOS',
                  UfParlamentar: 'AC',
                },
              }],
            },
          },
        },
      }
    }
    if (url === '/senador/5672') {
      return {
        data: {
          DetalheParlamentar: {
            Parlamentar: {
              IdentificacaoParlamentar: {
                CodigoParlamentar: '5672',
                NomeParlamentar: 'Alan Rick',
                NomeCompletoParlamentar: 'Alan Rick Miranda',
                SiglaPartidoParlamentar: 'REPUBLICANOS',
                UfParlamentar: 'AC',
                UrlPaginaParlamentar: 'https://www25.senado.leg.br/web/senadores/senador/-/perfil/5672',
              },
            },
          },
        },
      }
    }
    if (url === '/senador/5672/mandatos') {
      return {
        data: {
          MandatoParlamentar: {
            Parlamentar: {
              Mandatos: {
                Mandato: {
                  CodigoMandato: '596',
                  UfParlamentar: 'AC',
                  PrimeiraLegislaturaDoMandato: {
                    NumeroLegislatura: '57',
                    DataInicio: '2023-02-01',
                    DataFim: '2027-01-31',
                  },
                },
              },
            },
          },
        },
      }
    }
    if (url === '/processo') {
      return {
        data: {
          dados: [{
            id: 8828166,
            codigoMateria: 168484,
            identificacao: 'PEC 22/2025',
            ementa: 'Texto da PEC.',
            dataApresentacao: '2025-05-08',
            situacaoAtual: 'APROVADA',
          }],
          links: [{ rel: 'next', href: '/processo?pagina=2' }],
        },
      }
    }
    if (url === '/processo?pagina=2') {
      return { data: { dados: [], links: [] } }
    }
    if (url === '/votacao') {
      return {
        data: {
          dados: [{
            idProcesso: 8828166,
            codigoMateria: 168484,
            codigoSessao: 550469,
            codigoSessaoVotacao: 7047,
            dataSessao: '2026-02-24',
            descricaoVotacao: 'Votação nominal da PEC.',
            identificacao: 'PEC 22/2025',
            votos: [{ codigoParlamentar: 5672, siglaVotoParlamentar: 'Sim' }],
          }],
          links: [{ rel: 'next', href: '/votacao?pagina=2' }],
        },
      }
    }
    if (url === '/votacao?pagina=2') {
      return { data: { dados: [], links: [] } }
    }
    throw new Error(`Unexpected Senado URL: ${url}`)
  })
  return { get }
}

describe('runSenadoSync', () => {
  beforeEach(clearData)

  afterAll(async () => {
    await clearData()
    await prisma.$disconnect()
  })

  it('traverses all pages, stores Person/Mandate/bills/votes and is idempotent', async () => {
    const client = makeClient()

    const first = await runSenadoSync({
      prisma,
      client,
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
      pauseMs: 0,
    })
    const second = await runSenadoSync({
      prisma,
      client,
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
      pauseMs: 0,
    })

    expect(first.status).toBe(SyncRunStatus.SUCCESS)
    expect(second.status).toBe(SyncRunStatus.SUCCESS)
    expect(await prisma.person.count()).toBe(1)
    expect(await prisma.mandate.count()).toBe(1)
    expect(await prisma.legislativeBill.count()).toBe(1)
    expect(await prisma.legislativeBillAuthor.count()).toBe(1)
    expect(await prisma.votingRecord.count()).toBe(1)
    expect(await prisma.candidate.count()).toBe(0)
    expect((client.get as ReturnType<typeof vi.fn>).mock.calls.filter(([url]) => url === '/processo?pagina=2')).toHaveLength(2)
    expect((client.get as ReturnType<typeof vi.fn>).mock.calls.filter(([url]) => url === '/votacao?pagina=2')).toHaveLength(2)
  })
})
