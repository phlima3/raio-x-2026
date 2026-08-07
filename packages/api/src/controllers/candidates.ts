import { Request, Response, NextFunction } from 'express'
import { PrismaClient } from '@prisma/client'
import { CandidateFiltersSchema } from '../types/candidate'
import * as candidateService from '../services/candidateService'
import * as consistencyService from '../services/consistencyService'
import { withCache, TTL } from '../services/cacheService'
import { getCandidateSeoReport } from '../services/seoQualityService'
import { presentNewsItem } from '../domain/newsPresentation'
import {
  PUBLIC_NEWS_LIMIT,
  PUBLIC_NEWS_ORDER_BY,
  PUBLIC_NEWS_WHERE,
} from '../domain/publicationPolicy'

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

export async function getCandidateSeoReportHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await getCandidateSeoReport()
    res.json({
      success: true,
      data,
      meta: {
        total: data.length,
        indexable: data.filter((candidate) => candidate.indexable).length,
      },
    })
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
    const contradictionsOnly = req.query.contradictionsOnly === 'true'

    const cacheKeySuffix = [topic, contradictionsOnly ? 'contradictions' : '']
      .filter(Boolean)
      .join(':')

    const news = await withCache(
      `candidates:news:${slug}${cacheKeySuffix ? `:${cacheKeySuffix}` : ''}`,
      TTL.CANDIDATE_DETAIL,
      () =>
        prisma.newsItem.findMany({
          where: {
            AND: [
              PUBLIC_NEWS_WHERE,
              {
                candidateId: candidate.id,
                ...(topic ? { topic } : {}),
                ...(contradictionsOnly ? { hasContradiction: true } : {}),
              },
            ],
          },
          orderBy: PUBLIC_NEWS_ORDER_BY,
          take: PUBLIC_NEWS_LIMIT,
        }),
    )

    res.json({ success: true, data: news.map(presentNewsItem) })
  } catch (err) {
    next(err)
  }
}
