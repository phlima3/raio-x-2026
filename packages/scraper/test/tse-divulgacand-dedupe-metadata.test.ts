import { DocumentExtractionStatus, Position } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'

import { runDivulgaCandSync } from '../src/sources/tseDivulgaCand'
import type {
  DivulgaCandCandidate,
  DivulgaCandClient,
  DivulgaCandTarget,
} from '../src/sources/tse/divulgaCand'

// Achado 1: quando o PDF já foi importado pelo pacote do catálogo
// (`sync:documents`), o sync por candidatura cai no ramo de dedupe por
// SHA-256 e só refazia o vínculo (fetchedAt/sourceUrl/syncRunId/candidateId),
// sem gravar `metadata`. Isso apagava `candidatePage`, do qual
// `programCitationUrl` depende para não citar a URL de download como se
// fosse a página da candidatura. Este teste usa um duplo de Prisma (sem
// banco) para provar que o `update` do ramo de dedupe agora grava o mesmo
// `metadata` do ramo de documento novo.

const CANDIDATE_URL =
  'https://divulgacandcontas.tse.jus.br/divulga/#/candidato/BR/BR/20322002026/280002540694/2026/BR'
const TSE_ID = '280002540694'
const PROGRAM_PDF = Buffer.from('%PDF-1.4 programa de governo')
const PROGRAM_URL =
  'https://divulgacandcontas.tse.jus.br/candidaturas/oficial/2026/BR/BR/20322002026' +
  `/${TSE_ID}/proposta_governo1750000000000.pdf`

function detailFor(target: DivulgaCandTarget): DivulgaCandCandidate {
  return {
    target,
    apiUrl: `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/BR/${target.electionId}/candidato/${target.candidateId}`,
    publicUrl: CANDIDATE_URL,
    tseId: target.candidateId,
    ballotName: 'Fulano Presidente',
    fullName: 'Fulano de Tal',
    party: 'XYZ',
    positionLabel: 'Presidente',
    statusLabel: 'Deferido',
    // Site já preenchido no candidato: não é o que este teste cobre, e assim
    // fica provado que só o ramo do anexo está em jogo.
    sites: [],
    emails: [],
    files: [
      {
        id: '1',
        name: 'proposta_governo1750000000000.pdf',
        typeCode: '5',
        typeLabel: 'Proposta de governo',
        kind: 'CAMPAIGN_PROGRAM' as const,
        url: PROGRAM_URL,
      },
    ],
  }
}

function clientFor(): DivulgaCandClient {
  return {
    fetchCandidate: vi.fn(async (target: DivulgaCandTarget) => detailFor(target)),
    downloadFile: vi.fn().mockResolvedValue(PROGRAM_PDF),
  }
}

/** Duplo mínimo de Prisma: só os métodos que `runDivulgaCandSync` chama. */
function buildPrismaDouble() {
  const sourceDocumentUpdate = vi.fn().mockResolvedValue({})
  const prisma = {
    candidate: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'candidate-1',
          tseId: TSE_ID,
          name: 'Fulano de Tal',
          slug: 'fulano-de-tal-xyz-br',
          party: 'XYZ',
          state: 'BR',
          position: Position.PRESIDENTE,
          ballotNumber: null,
          siteUrl: 'https://ja-reconciliado.com.br',
          electionYear: 2026,
        },
      ]),
      update: vi.fn(),
    },
    sourceDocument: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'existing-doc-id',
        extractionStatus: DocumentExtractionStatus.EXTRACTED,
      }),
      update: sourceDocumentUpdate,
      upsert: vi.fn().mockResolvedValue({ id: 'snapshot-doc-id' }),
    },
    officialDatasetRecord: {
      upsert: vi.fn().mockResolvedValue({}),
    },
    dataSyncRun: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({ id: 'run-1' }),
      update: vi.fn().mockResolvedValue({}),
    },
  }
  return { prisma, sourceDocumentUpdate }
}

describe('runDivulgaCandSync — ramo de dedupe por SHA-256', () => {
  it('grava metadata (com candidatePage) ao relincar um PDF já importado pelo catálogo', async () => {
    const { prisma, sourceDocumentUpdate } = buildPrismaDouble()

    const result = await runDivulgaCandSync({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prisma: prisma as any,
      client: clientFor(),
      urls: [CANDIDATE_URL],
      extractText: vi.fn(),
    })

    expect(result.metrics).toMatchObject({ deduplicated: 1, created: 0 })
    expect(sourceDocumentUpdate).toHaveBeenCalledTimes(1)
    expect(sourceDocumentUpdate).toHaveBeenCalledWith({
      where: { id: 'existing-doc-id' },
      data: expect.objectContaining({
        candidateId: 'candidate-1',
        metadata: expect.objectContaining({
          candidatePage: CANDIDATE_URL,
        }),
      }),
    })
  })
})
