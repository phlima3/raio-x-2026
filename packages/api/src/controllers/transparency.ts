import { prisma } from '../lib/prisma'
import { Request, Response, NextFunction } from 'express'
import { Prisma, VoteType } from '@prisma/client'
import { z } from 'zod'
import {
  getCandidateReadModel,
  publicCandidateWhere,
} from '../services/candidateService'


async function publicCandidate(candidateId: string) {
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
  limit: z.coerce.number().int().min(1).max(200).default(50),
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
      ...identityWhere,
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
    }

    const [total, records] = await Promise.all([
      prisma.votingRecord.count({ where }),
      prisma.votingRecord.findMany({
        where,
        skip,
        take: limit,
        orderBy: { votedAt: 'desc' },
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
      where: { candidateId },
      orderBy: { year: 'desc' },
    })

    // Year-over-year variation
    const withVariation = declarations.map((d, i) => {
      const prev = declarations[i + 1]
      const variation = prev
        ? Number(d.totalValue) - Number(prev.totalValue)
        : null
      return { ...d, variation }
    })

    res.json({
      success: true,
      data: withVariation,
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
      where: { candidateId },
      orderBy: { year: 'desc' },
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
