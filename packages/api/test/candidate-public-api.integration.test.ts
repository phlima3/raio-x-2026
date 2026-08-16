import {
  DataSource,
  Position,
  PrismaClient,
  ProposalOrigin,
  ProposalStatus,
  VoteType,
} from '@prisma/client'
import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { createApp } from '../src/app'

const databaseUrl = process.env.DATABASE_URL ?? ''
if (!databaseUrl.includes('_test')) {
  throw new Error('Integration tests require a DATABASE_URL whose database name contains _test')
}

process.env.CACHE_DISABLED = 'true'

const prisma = new PrismaClient()
const app = createApp()

describe('public candidate API', () => {
  beforeEach(async () => {
    process.env.CANDIDATE_READ_MODEL = 'legacy'
    await prisma.reviewItem.deleteMany()
    await prisma.candidate.deleteMany()
    await prisma.mandate.deleteMany()
    await prisma.person.deleteMany()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('returns only published candidates in enabled offices across lists, stats and details', async () => {
    const person = await prisma.person.create({
      data: { name: 'Identidade Oficial', normalizedName: 'IDENTIDADE OFICIAL' },
    })
    await prisma.candidate.createMany({
      data: [
        {
          id: 'published-president',
          slug: 'presidente-publicado-abc-br',
          name: 'Presidente Publicado',
          party: 'ABC',
          state: 'BR',
          position: Position.PRESIDENTE,
          partyHistory: [],
          personId: person.id,
          electionId: 'official-election-id',
          isOfficial: true,
          officialStatusRaw: 'APTO',
          sourceUrl: 'https://tse.example/candidate',
          isPublished: true,
        },
        {
          id: 'published-deputy',
          slug: 'deputado-nao-publicavel-abc-sp',
          name: 'Deputado Não Publicável',
          party: 'ABC',
          state: 'SP',
          position: Position.DEPUTADO_FEDERAL,
          partyHistory: [],
          isPublished: true,
        },
        {
          id: 'hidden-governor',
          slug: 'governador-oculto-xyz-rj',
          name: 'Governador Oculto',
          party: 'XYZ',
          state: 'RJ',
          position: Position.GOVERNADOR,
          partyHistory: [],
          isPublished: false,
        },
      ],
    })
    await prisma.proposal.createMany({
      data: [
        {
          externalId: 'editorial-visible',
          source: 'editorial',
          title: 'Proposta editorial publicada',
          tags: [],
          candidateId: 'published-president',
          isPublished: true,
          origin: ProposalOrigin.EDITORIAL,
          status: ProposalStatus.SUBMITTED,
          url: 'https://example.org/programa-oficial',
        },
        {
          externalId: 'ai-hidden',
          source: 'candidate_site',
          title: 'Extração IA aguardando revisão',
          tags: [],
          candidateId: 'published-president',
          isPublished: false,
          origin: ProposalOrigin.AI_EXTRACTION,
        },
      ],
    })
    await prisma.votingRecord.createMany({
      data: [
        {
          source: 'camara',
          proposalName: 'Votação com fonte pública',
          proposalUrl: 'https://camara.example/votacao',
          voteType: VoteType.YES,
          votedAt: new Date('2026-08-01T00:00:00Z'),
          candidateId: 'published-president',
        },
        {
          source: 'camara',
          proposalName: 'Votação sem fonte pública',
          proposalUrl: 'http://camara.example/inseguro',
          voteType: VoteType.NO,
          votedAt: new Date('2026-08-02T00:00:00Z'),
          candidateId: 'published-president',
        },
      ],
    })
    await prisma.assetDeclaration.createMany({
      data: [
        {
          candidateId: 'published-president',
          year: 2026,
          totalValue: 100,
          sourceUrl: 'https://tse.example/bens',
        },
        {
          candidateId: 'published-president',
          year: 2022,
          totalValue: 50,
          sourceUrl: null,
        },
      ],
    })
    await prisma.campaignFinancing.createMany({
      data: [
        {
          candidateId: 'published-president',
          year: 2026,
          totalReceived: 100,
          totalSpent: 80,
          sourceUrl: 'https://tse.example/financiamento',
        },
        {
          candidateId: 'published-president',
          year: 2022,
          totalReceived: 50,
          totalSpent: 45,
          sourceUrl: 'http://tse.example/inseguro',
        },
      ],
    })

    const list = await request(app).get('/api/candidates').expect(200)
    const stats = await request(app).get('/api/candidates/stats').expect(200)
    const detail = await request(app).get('/api/candidates/presidente-publicado-abc-br').expect(200)
    const proposals = await request(app)
      .get('/api/candidates/presidente-publicado-abc-br/proposals')
      .expect(200)
    await request(app).get('/api/candidates/deputado-nao-publicavel-abc-sp').expect(404)
    await request(app).get('/api/transparency/hidden-governor/assets').expect(404)
    await request(app).get('/api/transparency/published-deputy/voting').expect(404)
    const voting = await request(app)
      .get('/api/transparency/published-president/voting')
      .expect(200)
    const assets = await request(app)
      .get('/api/transparency/published-president/assets')
      .expect(200)
    const financing = await request(app)
      .get('/api/transparency/published-president/financing')
      .expect(200)

    expect(list.body.data.map((candidate: { id: string }) => candidate.id)).toEqual([
      'published-president',
    ])
    expect(list.body.meta.total).toBe(1)
    expect(stats.body.data).toEqual(expect.objectContaining({
      total: 1,
      byPosition: { PRESIDENTE: 1 },
    }))
    expect(detail.body.data.proposals.map((proposal: { externalId: string }) => proposal.externalId))
      .toEqual(['editorial-visible'])
    expect(detail.body.data).toEqual(expect.objectContaining({
      id: 'published-president',
      isOfficial: true,
      officialStatus: null,
      dataSource: DataSource.EDITORIAL,
    }))
    for (const internalField of [
      'person',
      'personId',
      'electionId',
      'officialStatusRaw',
      'isPublished',
      'sourceUrl',
      'syncRunId',
    ]) {
      expect(detail.body.data).not.toHaveProperty(internalField)
    }
    expect(JSON.stringify(proposals.body.data)).not.toContain('ai-hidden')
    expect(voting.body.data.map((record: { proposalName: string }) => record.proposalName))
      .toEqual(['Votação com fonte pública'])
    expect(assets.body.data.map((declaration: { year: number }) => declaration.year))
      .toEqual([2026])
    expect(financing.body.data.map((record: { year: number }) => record.year))
      .toEqual([2026])
  })

  it('resolves a legacy name-party-state slug and still returns the full detail payload', async () => {
    await prisma.candidate.createMany({
      data: [
        {
          id: 'legacy-slugless-president',
          name: 'Candidato Sem Slug',
          party: 'ABC',
          state: 'BR',
          position: Position.PRESIDENTE,
          partyHistory: [],
          isPublished: true,
        },
        {
          id: 'legacy-decoy-governor',
          name: 'Candidato Sem Slug',
          party: 'XYZ',
          state: 'RJ',
          position: Position.GOVERNADOR,
          partyHistory: [],
          isPublished: true,
        },
      ],
    })
    await prisma.proposal.create({
      data: {
        externalId: 'legacy-slug-proposal',
        source: 'editorial',
        title: 'Proposta do candidato sem slug',
        tags: [],
        candidateId: 'legacy-slugless-president',
        origin: ProposalOrigin.EDITORIAL,
        status: ProposalStatus.SUBMITTED,
        url: 'https://example.org/proposta-sem-slug',
        isPublished: true,
      },
    })

    const response = await request(app)
      .get('/api/candidates/candidato-sem-slug-abc-br')
      .expect(200)

    expect(response.body.data).toEqual(expect.objectContaining({
      id: 'legacy-slugless-president',
      slug: 'candidato-sem-slug-abc-br',
    }))
    expect(response.body.data.proposals).toEqual([
      expect.objectContaining({ title: 'Proposta do candidato sem slug' }),
    ])
    await request(app).get('/api/candidates/candidato-inexistente-abc-br').expect(404)
  })

  it('keeps the legacy ID and slug while normalized reads use Person identity', async () => {
    const person = await prisma.person.create({
      data: {
        id: 'person-senator',
        name: 'Nome Oficial do Senado',
        normalizedName: 'NOME OFICIAL DO SENADO',
        dataSource: DataSource.SENADO,
      },
    })
    await prisma.candidate.create({
      data: {
        id: 'legacy-senator-id',
        slug: 'slug-estavel-senador',
        name: 'Nome Editorial Antigo',
        party: 'ABC',
        state: 'SP',
        position: Position.SENADOR,
        partyHistory: [],
        isPublished: true,
        personId: person.id,
      },
    })
    process.env.CANDIDATE_READ_MODEL = 'normalized'

    const response = await request(app)
      .get('/api/candidates/slug-estavel-senador')
      .expect(200)

    expect(response.body.data).toEqual(expect.objectContaining({
      id: 'legacy-senator-id',
      slug: 'slug-estavel-senador',
      name: 'Nome Oficial do Senado',
    }))
  })
})
