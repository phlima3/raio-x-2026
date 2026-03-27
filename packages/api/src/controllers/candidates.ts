import { Request, Response, NextFunction } from 'express'
import { PrismaClient } from '@prisma/client'
import { CandidateFiltersSchema } from '../types/candidate'
import * as candidateService from '../services/candidateService'
import * as consistencyService from '../services/consistencyService'
import { withCache, TTL } from '../services/cacheService'

const prisma = new PrismaClient()

export async function listCandidatesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const filters = CandidateFiltersSchema.parse(req.query)
    const result = await candidateService.listCandidates(filters)
    res.json({ success: true, ...result })
  } catch (err) {
    next(err)
  }
}

export async function getCandidateHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { slug } = req.params
    const candidate = await candidateService.getCandidateBySlug(slug)
    if (!candidate) {
      res.status(404).json({ success: false, error: 'Candidato não encontrado' })
      return
    }
    res.json({ success: true, data: candidate })
  } catch (err) {
    next(err)
  }
}

export async function getCandidateProposalsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { slug } = req.params
    const candidate = await candidateService.getCandidateBySlug(slug)
    if (!candidate) {
      res.status(404).json({ success: false, error: 'Candidato não encontrado' })
      return
    }
    const { getProposalsByCandidate } = await import('../services/proposalService')
    const grouped = await getProposalsByCandidate(candidate.id)
    res.json({ success: true, data: grouped })
  } catch (err) {
    next(err)
  }
}

export async function getCandidateStatsHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const stats = await candidateService.getCandidateStats()
    res.json({ success: true, data: stats })
  } catch (err) {
    next(err)
  }
}

export async function getCandidateConsistencyHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { slug } = req.params
    const candidate = await candidateService.getCandidateBySlug(slug)
    if (!candidate) {
      res.status(404).json({ success: false, error: 'Candidato não encontrado' })
      return
    }

    // Try cached scores first; compute on-demand if none exist
    let scores = await consistencyService.getConsistencyScores(candidate.id)
    if (scores.length === 0 && req.query.compute !== 'false') {
      scores = await consistencyService.computeConsistencyScores(candidate.id)
    }

    res.json({ success: true, data: scores })
  } catch (err) {
    next(err)
  }
}

export async function getCandidateTransparencyHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { slug } = req.params
    const candidate = await candidateService.getCandidateBySlug(slug)
    if (!candidate) {
      res.status(404).json({ success: false, error: 'Candidato não encontrado' })
      return
    }
    res.json({
      success: true,
      data: {
        voting: candidate.votingRecords,
        assets: candidate.assetDeclarations,
        financing: candidate.campaignFinancings[0] ?? null,
      },
    })
  } catch (err) {
    next(err)
  }
}

export async function getCandidateNewsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { slug } = req.params
    const candidate = await candidateService.getCandidateBySlug(slug)
    if (!candidate) {
      res.status(404).json({ success: false, error: 'Candidato não encontrado' })
      return
    }

    const topic = typeof req.query.topic === 'string' ? req.query.topic : undefined

    const news = await withCache(
      `candidates:news:${slug}${topic ? `:${topic}` : ''}`,
      TTL.CANDIDATE_DETAIL,
      () =>
        prisma.newsItem.findMany({
          where: {
            candidateId: candidate.id,
            ...(topic ? { topic } : {}),
          },
          orderBy: [{ publishedAt: 'desc' }, { fetchedAt: 'desc' }],
        }),
    )

    res.json({ success: true, data: news })
  } catch (err) {
    next(err)
  }
}
