import {
  DataSource,
  MandateHouse,
  OfficialCandidacyStatus,
  Position,
  PrismaClient,
} from '@prisma/client'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { importTseCandidates } from '../src/sources/tse/importCandidates'
import type { TseCandidateRecord } from '../src/sources/tse/candidateCsv'

const databaseUrl = process.env.DATABASE_URL ?? ''
if (!databaseUrl.includes('_test')) {
  throw new Error('Integration tests require a DATABASE_URL whose database name contains _test')
}

const prisma = new PrismaClient()

function officialCandidate(overrides: Partial<TseCandidateRecord> = {}): TseCandidateRecord {
  return {
    tseId: '260000000100',
    electionYear: 2026,
    electionId: '999',
    state: 'SP',
    position: 'PRESIDENTE',
    rawPosition: 'PRESIDENTE',
    name: 'MARIA DA SILVA',
    ballotName: 'MARIA',
    socialName: null,
    party: 'ABC',
    ballotNumber: 10,
    rawStatus: 'APTO',
    rawStatusDetail: null,
    normalizedStatus: 'ELIGIBLE',
    isPendingJudgement: false,
    raw: {},
    ...overrides,
  }
}

describe('importTseCandidates', () => {
  beforeEach(async () => {
    await prisma.reviewItem.deleteMany()
    await prisma.candidate.deleteMany()
    await prisma.mandate.deleteMany()
    await prisma.person.deleteMany()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('reconciles the ballot name when the editorial profile records it', async () => {
    // O nome de urna do Zema é apenas "ZEMA": nenhum token do nome civil
    // alcança "Romeu Zema", então sem o nome de urna na ficha editorial a
    // candidatura oficial entraria como uma segunda ficha do mesmo candidato.
    await prisma.candidate.create({
      data: {
        id: 'editorial-zema',
        slug: 'romeu-zema-novo-mg',
        name: 'Romeu Zema',
        socialName: 'Zema',
        party: 'Novo',
        state: 'MG',
        position: Position.PRESIDENTE,
        partyHistory: [],
        dataSource: DataSource.EDITORIAL,
        isPublished: true,
      },
    })

    const metrics = await importTseCandidates(prisma, {
      records: [officialCandidate({
        tseId: '260000000900',
        name: 'ROMEU ZEMA NETO',
        ballotName: 'ZEMA',
        party: 'NOVO',
        state: 'BR',
        ballotNumber: 30,
      })],
      sourceUrl: 'https://cdn.tse.jus.br/consulta_cand_2026.zip',
      checksum: 'snapshot-sha',
    })

    expect(metrics).toEqual(expect.objectContaining({ matched: 1, created: 0 }))
    await expect(prisma.candidate.count()).resolves.toBe(1)
    const candidate = await prisma.candidate.findUniqueOrThrow({
      where: { tseId: '260000000900' },
    })
    expect(candidate).toEqual(expect.objectContaining({
      id: 'editorial-zema',
      slug: 'romeu-zema-novo-mg',
      ballotNumber: 30,
      isOfficial: true,
      isPublished: true,
    }))
  })

  it('publishes an official candidacy whose only homonym changed party', async () => {
    // Caiado registrou pelo PSD depois de o seed gravar União Brasil. Um único
    // homônimo deixa em aberto qual ficha é a mesma pessoa, mas não se a
    // candidatura existe — ela veio do TSE e precisa aparecer.
    await prisma.candidate.create({
      data: {
        id: 'editorial-caiado',
        slug: 'ronaldo-caiado-uniao-brasil-go',
        name: 'Ronaldo Caiado',
        party: 'União Brasil',
        state: 'GO',
        position: Position.PRESIDENTE,
        partyHistory: [],
        dataSource: DataSource.EDITORIAL,
        isPublished: true,
      },
    })

    const metrics = await importTseCandidates(prisma, {
      records: [officialCandidate({
        tseId: '260000000901',
        name: 'RONALDO RAMOS CAIADO',
        ballotName: 'RONALDO CAIADO',
        party: 'PSD',
        state: 'BR',
        ballotNumber: 55,
      })],
      sourceUrl: 'https://cdn.tse.jus.br/consulta_cand_2026.zip',
      checksum: 'snapshot-sha',
    })

    // A ficha oficial vai ao ar; a editorial homônima sai, sem ser apagada; e
    // o item de revisão permanece para a reconciliação manual de ID e slug.
    expect(metrics).toEqual(expect.objectContaining({ created: 1, reviewItems: 1 }))
    const official = await prisma.candidate.findUniqueOrThrow({
      where: { tseId: '260000000901' },
    })
    expect(official).toEqual(expect.objectContaining({ isOfficial: true, isPublished: true }))
    const editorial = await prisma.candidate.findUniqueOrThrow({
      where: { id: 'editorial-caiado' },
    })
    expect(editorial).toEqual(expect.objectContaining({
      isPublished: false,
      candidacyStatus: 'nao_registrado',
    }))
  })

  it('unpublishes an editorial pre-candidate absent from the snapshot', async () => {
    await prisma.candidate.create({
      data: {
        id: 'editorial-nao-registrou',
        slug: 'simone-tebet-mdb-ms',
        name: 'Simone Tebet',
        party: 'MDB',
        state: 'MS',
        position: Position.PRESIDENTE,
        partyHistory: [],
        dataSource: DataSource.EDITORIAL,
        isPublished: true,
      },
    })

    const metrics = await importTseCandidates(prisma, {
      records: [officialCandidate()],
      sourceUrl: 'https://cdn.tse.jus.br/consulta_cand_2026.zip',
      checksum: 'snapshot-sha',
    })

    expect(metrics.unregistered).toBe(1)
    const editorial = await prisma.candidate.findUniqueOrThrow({
      where: { id: 'editorial-nao-registrou' },
    })
    // Despublicada, nunca removida: o histórico editorial continua auditável.
    expect(editorial).toEqual(expect.objectContaining({
      isPublished: false,
      candidacyStatus: 'nao_registrado',
    }))
  })

  it('leaves offices the snapshot never covered untouched', async () => {
    await prisma.candidate.create({
      data: {
        id: 'editorial-governador',
        slug: 'candidato-governador-abc-sp',
        name: 'Candidato Governador',
        party: 'ABC',
        state: 'SP',
        position: Position.GOVERNADOR,
        partyHistory: [],
        dataSource: DataSource.EDITORIAL,
        isPublished: true,
      },
    })

    const metrics = await importTseCandidates(prisma, {
      records: [officialCandidate()],
      sourceUrl: 'https://cdn.tse.jus.br/consulta_cand_2026.zip',
      checksum: 'snapshot-sha',
    })

    // O snapshot só trouxe PRESIDENTE; um recorte parcial não pode despublicar
    // um cargo que ele nunca cobriu.
    expect(metrics.unregistered).toBe(0)
    await expect(
      prisma.candidate.findUniqueOrThrow({ where: { id: 'editorial-governador' } }),
    ).resolves.toEqual(expect.objectContaining({ isPublished: true }))
  })

  it('never unpublishes editorial pre-candidates on a dry run', async () => {
    await prisma.candidate.create({
      data: {
        id: 'editorial-dry-run',
        slug: 'candidato-dry-run-abc-ms',
        name: 'Candidato Dry Run',
        party: 'ABC',
        state: 'MS',
        position: Position.PRESIDENTE,
        partyHistory: [],
        dataSource: DataSource.EDITORIAL,
        isPublished: true,
      },
    })

    const metrics = await importTseCandidates(prisma, {
      records: [officialCandidate()],
      sourceUrl: 'https://cdn.tse.jus.br/consulta_cand_2026.zip',
      checksum: 'snapshot-sha',
      dryRun: true,
    })

    expect(metrics.unregistered).toBe(0)
    await expect(
      prisma.candidate.findUniqueOrThrow({ where: { id: 'editorial-dry-run' } }),
    ).resolves.toEqual(expect.objectContaining({ isPublished: true }))
  })

  it('reconciles an unequivocal editorial candidate and preserves its ID and slug', async () => {
    await prisma.candidate.create({
      data: {
        id: 'editorial-maria',
        slug: 'maria-da-silva-abc-sp',
        name: 'Maria da Silva',
        party: 'ABC',
        state: 'SP',
        position: Position.PRESIDENTE,
        partyHistory: [],
        dataSource: DataSource.EDITORIAL,
        isPublished: true,
      },
    })

    const first = await importTseCandidates(prisma, {
      records: [officialCandidate()],
      sourceUrl: 'https://cdn.tse.jus.br/consulta_cand_2026.zip',
      checksum: 'snapshot-sha',
    })
    const second = await importTseCandidates(prisma, {
      records: [officialCandidate()],
      sourceUrl: 'https://cdn.tse.jus.br/consulta_cand_2026.zip',
      checksum: 'snapshot-sha',
    })
    const candidate = await prisma.candidate.findUniqueOrThrow({
      where: { tseId: '260000000100' },
    })

    expect(candidate).toEqual(expect.objectContaining({
      id: 'editorial-maria',
      slug: 'maria-da-silva-abc-sp',
      isOfficial: true,
      officialStatus: OfficialCandidacyStatus.ELIGIBLE,
      isPublished: true,
      dataSource: DataSource.TSE,
    }))
    expect(candidate.personId).not.toBeNull()
    expect(first).toEqual(expect.objectContaining({ matched: 1, created: 0 }))
    expect(second.created).toBe(0)
    await expect(prisma.candidate.count()).resolves.toBe(1)
    await expect(prisma.person.count()).resolves.toBe(1)
  })

  it('reconciles a presidential pre-candidate registered under BR with a civil name', async () => {
    await prisma.candidate.create({
      data: {
        id: 'editorial-presidenciavel',
        slug: 'flavio-bolsonaro-pl-rj',
        name: 'Flávio Bolsonaro',
        party: 'PL',
        state: 'RJ',
        position: Position.PRESIDENTE,
        partyHistory: [],
        isPublished: true,
      },
    })

    const metrics = await importTseCandidates(prisma, {
      records: [officialCandidate({
        tseId: '260000000300',
        name: 'FLÁVIO NANTES BOLSONARO',
        ballotName: 'FLÁVIO BOLSONARO',
        party: 'PL',
        state: 'BR',
      })],
      sourceUrl: 'https://cdn.tse.jus.br/consulta_cand_2026.zip',
      checksum: 'presidential-snapshot',
    })

    const candidate = await prisma.candidate.findUniqueOrThrow({
      where: { tseId: '260000000300' },
    })
    expect(candidate).toEqual(expect.objectContaining({
      id: 'editorial-presidenciavel',
      slug: 'flavio-bolsonaro-pl-rj',
      state: 'BR',
      isOfficial: true,
      isPublished: true,
    }))
    expect(metrics).toEqual(expect.objectContaining({ matched: 1, created: 0, conflicts: 0 }))
    await expect(prisma.candidate.count()).resolves.toBe(1)
    await expect(prisma.reviewItem.count()).resolves.toBe(0)
  })

  it('reconciles an editorial party label with the sigla registered at the TSE', async () => {
    await prisma.candidate.create({
      data: {
        id: 'editorial-caiado',
        slug: 'ronaldo-caiado-uniao-brasil-go',
        name: 'Ronaldo Caiado',
        party: 'União Brasil',
        state: 'GO',
        position: Position.PRESIDENTE,
        partyHistory: [],
        isPublished: true,
      },
    })

    const metrics = await importTseCandidates(prisma, {
      records: [officialCandidate({
        tseId: '260000000301',
        name: 'RONALDO RAMOS CAIADO',
        ballotName: 'RONALDO CAIADO',
        party: 'UNIÃO',
        state: 'BR',
      })],
      sourceUrl: 'https://cdn.tse.jus.br/consulta_cand_2026.zip',
      checksum: 'presidential-snapshot',
    })

    expect(metrics).toEqual(expect.objectContaining({ matched: 1, created: 0 }))
    await expect(prisma.candidate.count()).resolves.toBe(1)
  })

  it('publishes a registered candidacy that is still awaiting judgement', async () => {
    const metrics = await importTseCandidates(prisma, {
      records: [
        officialCandidate({
          tseId: '260000000310',
          name: 'AGUARDANDO JULGAMENTO',
          state: 'BR',
          rawStatus: 'APTO',
          rawStatusDetail: 'AGUARDANDO JULGAMENTO',
          normalizedStatus: 'PENDING',
          isPendingJudgement: true,
        }),
        officialCandidate({
          tseId: '260000000311',
          name: 'REGISTRO INDEFERIDO',
          state: 'BR',
          rawStatus: 'INAPTO',
          rawStatusDetail: 'INDEFERIDO',
          normalizedStatus: 'INELIGIBLE',
        }),
      ],
      sourceUrl: 'https://cdn.tse.jus.br/consulta_cand_2026.zip',
      checksum: 'pending-snapshot',
    })

    expect(metrics).toEqual(expect.objectContaining({ published: 1, hidden: 1 }))
    await expect(prisma.candidate.findUniqueOrThrow({
      where: { tseId: '260000000310' },
      select: { isPublished: true, officialStatusRaw: true },
    })).resolves.toEqual({
      isPublished: true,
      officialStatusRaw: 'APTO / AGUARDANDO JULGAMENTO',
    })
    await expect(prisma.candidate.findUniqueOrThrow({
      where: { tseId: '260000000311' },
      select: { isPublished: true },
    })).resolves.toEqual({ isPublished: false })
  })

  it('creates a hidden official candidacy and review item for an ambiguous match', async () => {
    await prisma.candidate.createMany({
      data: [
        {
          id: 'editorial-maria-a',
          slug: 'maria-da-silva-a',
          name: 'Maria da Silva',
          party: 'ABC',
          state: 'SP',
          position: Position.PRESIDENTE,
          partyHistory: [],
        },
        {
          id: 'editorial-maria-b',
          slug: 'maria-da-silva-b',
          name: 'Maria da Silva',
          party: 'ABC',
          state: 'SP',
          position: Position.PRESIDENTE,
          partyHistory: [],
        },
      ],
    })

    const metrics = await importTseCandidates(prisma, {
      records: [officialCandidate()],
      sourceUrl: 'https://cdn.tse.jus.br/consulta_cand_2026.zip',
      checksum: 'snapshot-sha',
    })
    await importTseCandidates(prisma, {
      records: [officialCandidate()],
      sourceUrl: 'https://cdn.tse.jus.br/consulta_cand_2026.zip',
      checksum: 'snapshot-sha',
    })
    const official = await prisma.candidate.findUniqueOrThrow({
      where: { tseId: '260000000100' },
    })

    expect(official.isPublished).toBe(false)
    expect(metrics).toEqual(expect.objectContaining({
      created: 1,
      matched: 0,
      ambiguous: 1,
      reviewItems: 1,
    }))
    await expect(prisma.candidate.count()).resolves.toBe(3)
    await expect(prisma.reviewItem.count()).resolves.toBe(1)
  })

  it('does not delete or unpublish editorial candidates when a snapshot is empty', async () => {
    await prisma.candidate.create({
      data: {
        id: 'editorial-pre-candidate',
        slug: 'pre-candidate-abc-br',
        name: 'Pré Candidato',
        party: 'ABC',
        state: 'BR',
        position: Position.PRESIDENTE,
        partyHistory: [],
        isPublished: true,
      },
    })

    const metrics = await importTseCandidates(prisma, {
      records: [],
      sourceUrl: 'https://cdn.tse.jus.br/consulta_cand_2026.zip',
      checksum: 'empty-snapshot',
    })

    expect(metrics.parsed).toBe(0)
    await expect(prisma.candidate.findUniqueOrThrow({
      where: { id: 'editorial-pre-candidate' },
      select: { isPublished: true },
    })).resolves.toEqual({ isPublished: true })
  })

  it('stores every supported TSE office but publishes only enabled offices', async () => {
    const positions = [
      'PRESIDENTE',
      'VICE_PRESIDENTE',
      'GOVERNADOR',
      'VICE_GOVERNADOR',
      'SENADOR',
      '1_SUPLENTE',
      '2_SUPLENTE',
      'DEPUTADO_FEDERAL',
      'DEPUTADO_ESTADUAL',
      'DEPUTADO_DISTRITAL',
      'PREFEITO',
      'VICE_PREFEITO',
      'VEREADOR',
    ]
    const records = positions.map((position, index) => officialCandidate({
      tseId: `2600000002${String(index).padStart(2, '0')}`,
      name: `CANDIDATO ${index}`,
      ballotName: `CAND ${index}`,
      position,
      rawPosition: position,
    }))

    const metrics = await importTseCandidates(prisma, {
      records,
      sourceUrl: 'https://cdn.tse.jus.br/consulta_cand_2026.zip',
      checksum: 'all-offices',
      batchSize: 3,
    })

    expect(metrics).toEqual(expect.objectContaining({ created: 13, published: 3, hidden: 10 }))
    await expect(prisma.candidate.count()).resolves.toBe(13)
    await expect(prisma.candidate.count({ where: { isPublished: true } })).resolves.toBe(3)
  })

  it('reuses an unequivocal legislative Person when TSE runs after Senado', async () => {
    const person = await prisma.person.create({
      data: {
        name: 'Senadora Integrada',
        normalizedName: 'SENADORA INTEGRADA',
        senadoId: 'senado-integrated',
        dataSource: DataSource.SENADO,
      },
    })
    await prisma.mandate.create({
      data: {
        personId: person.id,
        source: DataSource.SENADO,
        externalId: 'senado-integrated',
        legislatureId: '57',
        house: MandateHouse.SENADO,
        role: 'SENADOR',
        state: 'SP',
        party: 'PX',
      },
    })

    await importTseCandidates(prisma, {
      records: [officialCandidate({
        tseId: 'tse-integrated',
        name: 'Senadora Integrada',
        ballotName: 'Senadora Integrada',
        party: 'PX',
        state: 'SP',
        position: 'SENADOR',
        rawPosition: 'SENADOR',
      })],
      sourceUrl: 'https://cdn.tse.jus.br/consulta_cand_2026.zip',
      checksum: 'snapshot-sha',
    })

    const candidate = await prisma.candidate.findUniqueOrThrow({ where: { tseId: 'tse-integrated' } })
    expect(candidate.personId).toBe(person.id)
    await expect(prisma.person.count()).resolves.toBe(1)
    await expect(prisma.reviewItem.count()).resolves.toBe(0)
  })

  it('keeps ambiguous legislative identities separate when TSE runs after Senado', async () => {
    for (const suffix of ['a', 'b']) {
      const person = await prisma.person.create({
        data: {
          name: 'Senador Homônimo',
          normalizedName: 'SENADOR HOMONIMO',
          senadoId: `senado-${suffix}`,
          dataSource: DataSource.SENADO,
        },
      })
      await prisma.mandate.create({
        data: {
          personId: person.id,
          source: DataSource.SENADO,
          externalId: `senado-${suffix}`,
          legislatureId: '57',
          house: MandateHouse.SENADO,
          role: 'SENADOR',
          state: 'SP',
          party: 'PX',
        },
      })
    }

    const metrics = await importTseCandidates(prisma, {
      records: [officialCandidate({
        tseId: 'tse-ambiguous-legislative',
        name: 'Senador Homônimo',
        ballotName: 'Senador Homônimo',
        party: 'PX',
        state: 'SP',
        position: 'SENADOR',
        rawPosition: 'SENADOR',
      })],
      sourceUrl: 'https://cdn.tse.jus.br/consulta_cand_2026.zip',
      checksum: 'snapshot-sha',
    })

    const candidate = await prisma.candidate.findUniqueOrThrow({
      where: { tseId: 'tse-ambiguous-legislative' },
    })
    expect(candidate.isPublished).toBe(false)
    expect(metrics).toEqual(expect.objectContaining({ ambiguous: 1, reviewItems: 1 }))
    await expect(prisma.person.count()).resolves.toBe(3)
    await expect(prisma.reviewItem.count({ where: { candidateId: candidate.id } })).resolves.toBe(1)
  })

  it('reopens editorial review when an existing official identity field changes', async () => {
    const oldMaterialDate = new Date('2026-07-01T00:00:00.000Z')
    const syncedAt = new Date('2026-08-04T00:00:00.000Z')
    await prisma.candidate.create({
      data: {
        tseId: '260000000100',
        slug: 'maria-oficial-antiga-sp',
        name: 'MARIA ANTIGA',
        party: 'OLD',
        state: 'SP',
        position: Position.PRESIDENTE,
        partyHistory: [],
        electionYear: 2026,
        isOfficial: true,
        isPublished: true,
        dataSource: DataSource.TSE,
        materialUpdatedAt: oldMaterialDate,
      },
    })

    await importTseCandidates(prisma, {
      records: [officialCandidate()],
      sourceUrl: 'https://cdn.tse.jus.br/consulta_cand_2026.zip',
      checksum: 'identity-change',
      syncedAt,
    })

    const candidate = await prisma.candidate.findUniqueOrThrow({
      where: { tseId: '260000000100' },
    })
    expect(candidate.name).toBe('MARIA DA SILVA')
    expect(candidate.party).toBe('ABC')
    expect(candidate.materialUpdatedAt).toEqual(syncedAt)
  })

  it('keeps an official row hidden when its mandatory judgment is absent', async () => {
    const metrics = await importTseCandidates(prisma, {
      records: [officialCandidate()],
      sourceUrl: 'https://cdn.tse.jus.br/consulta_cand_2026.zip',
      complementSourceUrl: 'https://cdn.tse.jus.br/consulta_cand_complementar_2026.zip',
      complementRows: [],
      requireComplementJudgment: true,
      checksum: 'missing-judgment',
    })

    const candidate = await prisma.candidate.findUniqueOrThrow({
      where: { tseId: '260000000100' },
    })
    expect(candidate.officialStatus).toBe(OfficialCandidacyStatus.UNKNOWN)
    expect(candidate.candidacyStatus).toBe('status_nao_mapeado')
    expect(candidate.isPublished).toBe(false)
    expect(metrics).toEqual(expect.objectContaining({ conflicts: 1, reviewItems: 1, hidden: 1 }))
  })

  it('does not derive a running mate without the mandatory complementary judgment', async () => {
    const president = officialCandidate({
      tseId: 'president-with-judgment',
      raw: { SQ_COLIGACAO: 'coalition-with-missing-vice-judgment' },
    })
    const vice = officialCandidate({
      tseId: 'vice-without-judgment',
      name: 'VICE SEM JULGAMENTO',
      position: 'VICE_PRESIDENTE',
      rawPosition: 'VICE-PRESIDENTE',
      raw: { SQ_COLIGACAO: 'coalition-with-missing-vice-judgment' },
    })

    await importTseCandidates(prisma, {
      records: [president, vice],
      sourceUrl: 'https://cdn.tse.jus.br/consulta_cand_2026.zip',
      complementSourceUrl: 'https://cdn.tse.jus.br/consulta_cand_complementar_2026.zip',
      complementRows: [
        {
          SQ_CANDIDATO: president.tseId,
          DS_SITUACAO_JULGAMENTO: 'DEFERIDO',
        },
      ],
      requireComplementJudgment: true,
      checksum: 'missing-running-mate-judgment',
    })

    const stored = await prisma.candidate.findUniqueOrThrow({
      where: { tseId: president.tseId },
    })
    expect(stored.runningMateName).toBeNull()
    expect(stored.runningMateParty).toBeNull()
    expect(stored.runningMateSourceUrl).toBeNull()
  })

  it('selects the active vice through the official replacement chain', async () => {
    const president = officialCandidate({
      tseId: 'president-1',
      name: 'PRESIDENTE OFICIAL',
      ballotName: 'PRESIDENTE NA URNA',
      socialName: 'NOME SOCIAL OFICIAL',
      raw: { SQ_COLIGACAO: 'coalition-1' },
    })
    const oldVice = officialCandidate({
      tseId: 'vice-old',
      name: 'VICE ANTIGO',
      ballotName: 'VICE ANTIGO',
      position: 'VICE_PRESIDENTE',
      rawPosition: 'VICE-PRESIDENTE',
      raw: { SQ_COLIGACAO: 'coalition-1' },
    })
    const newVice = officialCandidate({
      tseId: 'vice-new',
      name: 'VICE ATUAL',
      ballotName: 'VICE ATUAL',
      party: 'XYZ',
      position: 'VICE_PRESIDENTE',
      rawPosition: 'VICE-PRESIDENTE',
      raw: { SQ_COLIGACAO: 'coalition-1' },
    })

    await importTseCandidates(prisma, {
      records: [president, oldVice, newVice],
      sourceUrl: 'https://cdn.tse.jus.br/consulta_cand_2026.zip',
      complementSourceUrl: 'https://cdn.tse.jus.br/consulta_cand_complementar_2026.zip',
      complementRows: [
        { SQ_CANDIDATO: 'president-1', DS_SITUACAO_JULGAMENTO: 'DEFERIDO' },
        {
          SQ_CANDIDATO: 'vice-old',
          ST_SUBSTITUIDO: 'S',
          DS_SITUACAO_JULGAMENTO: 'SUBSTITUÍDO',
        },
        {
          SQ_CANDIDATO: 'vice-new',
          SQ_SUBSTITUIDO: 'vice-old',
          DS_SITUACAO_JULGAMENTO: 'DEFERIDO',
        },
      ],
      checksum: 'replacement-chain',
    })

    const stored = await prisma.candidate.findUniqueOrThrow({
      where: { tseId: 'president-1' },
    })
    expect(stored.socialName).toBe('NOME SOCIAL OFICIAL')
    expect(stored.runningMateName).toBe('VICE ATUAL')
    expect(stored.runningMateParty).toBe('XYZ')
    expect(stored.runningMateSourceUrl)
      .toBe('https://cdn.tse.jus.br/consulta_cand_complementar_2026.zip')

    await importTseCandidates(prisma, {
      records: [president, oldVice, newVice],
      sourceUrl: 'https://cdn.tse.jus.br/consulta_cand_2026.zip',
      complementSourceUrl: 'https://cdn.tse.jus.br/consulta_cand_complementar_2026.zip',
      complementRows: [
        { SQ_CANDIDATO: 'president-1', DS_SITUACAO_JULGAMENTO: 'DEFERIDO' },
        {
          SQ_CANDIDATO: 'vice-old',
          ST_SUBSTITUIDO: 'S',
          DS_SITUACAO_JULGAMENTO: 'SUBSTITUÍDO',
        },
        {
          SQ_CANDIDATO: 'vice-new',
          SQ_SUBSTITUIDO: 'vice-old',
          DS_SITUACAO_JULGAMENTO: 'INDEFERIDO',
        },
      ],
      checksum: 'replacement-chain-updated',
    })

    const withoutActiveVice = await prisma.candidate.findUniqueOrThrow({
      where: { tseId: 'president-1' },
    })
    expect(withoutActiveVice.runningMateName).toBeNull()
    expect(withoutActiveVice.runningMateParty).toBeNull()
    expect(withoutActiveVice.runningMateSourceUrl).toBeNull()
  })
})
