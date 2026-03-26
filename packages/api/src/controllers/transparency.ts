import { Request, Response, NextFunction } from 'express'
import { PrismaClient, VoteType } from '@prisma/client'
import { z } from 'zod'

const prisma = new PrismaClient()

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

    const where = {
      candidateId,
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
