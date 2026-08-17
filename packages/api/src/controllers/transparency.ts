import { prisma } from '../lib/prisma'
import { Request, Response, NextFunction } from 'express'
import { Prisma, VoteType } from '@prisma/client'
import { z } from 'zod'
import {
  PUBLIC_ASSET_DECLARATION_LIMIT,
  PUBLIC_ASSET_DECLARATION_ORDER_BY,
  PUBLIC_ASSET_DECLARATION_WHERE,
  PUBLIC_CAMPAIGN_FINANCING_LIMIT,
  PUBLIC_CAMPAIGN_FINANCING_ORDER_BY,
  PUBLIC_CAMPAIGN_FINANCING_WHERE,
  PUBLIC_VOTING_RECORD_LIMIT,
  PUBLIC_VOTING_RECORD_ORDER_BY,
  PUBLIC_VOTING_RECORD_WHERE,
  withAssetVariation,
} from '../domain/publicationPolicy'
import {
  getCandidateReadModel,
  publicCandidateWhere,
} from '../services/candidateService'


async function publicCandidate(
  candidateId: string,
): Promise<{ id: string; personId: string | null } | null> {
  return prisma.candidate.findFirst({
    where: { id: candidateId, ...publicCandidateWhere() },
    select: { id: true, personId: true },
  })
}

const VotingFiltersSchema = z.object({
  source: z.enum(['camara', 'senado']).optional(),
  voteType: z.nativeEnum(VoteType).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(PUBLIC_VOTING_RECORD_LIMIT).default(50),
})

export async function getVotingRecordsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { candidateId } = req.params
    const { source, voteType, from, to, page, limit } = VotingFiltersSchema.parse(req.query)
    const skip = (page - 1) * limit

    const candidate = await publicCandidate(candidateId)
    if (!candidate) {
      res.status(404).json({ success: false, error: 'Candidato não encontrado' })
      return
    }
    const identityWhere: Prisma.VotingRecordWhereInput =
      getCandidateReadModel() === 'normalized' && candidate.personId
        ? {
            OR: [
              { candidateId },
              { personId: candidate.personId },
              { mandate: { personId: candidate.personId } },
            ],
          }
        : { candidateId }
    const where: Prisma.VotingRecordWhereInput = {
      AND: [
        identityWhere,
        PUBLIC_VOTING_RECORD_WHERE,
        {
          ...(source && { source }),
          ...(voteType && { voteType }),
          ...(from || to
            ? {
                votedAt: {
                  ...(from && { gte: new Date(from) }),
                  ...(to && { lte: new Date(to) }),
                },
              }
            : {}),
        },
      ],
    }

    const [total, records] = await Promise.all([
      prisma.votingRecord.count({ where }),
      prisma.votingRecord.findMany({
        where,
        skip,
        take: limit,
        orderBy: PUBLIC_VOTING_RECORD_ORDER_BY,
      }),
    ])

    res.json({
      success: true,
      data: records,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit), candidateId },
    })
  } catch (err) {
    next(err)
  }
}

export async function getAssetDeclarationsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { candidateId } = req.params
    if (!(await publicCandidate(candidateId))) {
      res.status(404).json({ success: false, error: 'Candidato não encontrado' })
      return
    }

    const declarations = await prisma.assetDeclaration.findMany({
      where: { AND: [{ candidateId }, PUBLIC_ASSET_DECLARATION_WHERE] },
      orderBy: PUBLIC_ASSET_DECLARATION_ORDER_BY,
      take: PUBLIC_ASSET_DECLARATION_LIMIT,
    })

    res.json({
      success: true,
      data: withAssetVariation(declarations),
      meta: { candidateId, count: declarations.length },
    })
  } catch (err) {
    next(err)
  }
}

export async function getCampaignFinancingHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { candidateId } = req.params
    if (!(await publicCandidate(candidateId))) {
      res.status(404).json({ success: false, error: 'Candidato não encontrado' })
      return
    }

    const financings = await prisma.campaignFinancing.findMany({
      where: { AND: [{ candidateId }, PUBLIC_CAMPAIGN_FINANCING_WHERE] },
      orderBy: PUBLIC_CAMPAIGN_FINANCING_ORDER_BY,
      take: PUBLIC_CAMPAIGN_FINANCING_LIMIT,
    })

    res.json({
      success: true,
      data: financings,
      meta: { candidateId },
    })
  } catch (err) {
    next(err)
  }
}
