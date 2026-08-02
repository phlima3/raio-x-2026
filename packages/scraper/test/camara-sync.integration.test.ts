import { PrismaClient, SyncRunStatus } from '@prisma/client'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { runCamaraSync, type CamaraHttpPort } from '../src/sources/camara'

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
})
