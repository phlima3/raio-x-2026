import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import * as candidateService from '../services/candidateService'
import { getProposalsByCandidate, getProposalCategories } from '../services/proposalService'
import { compareProposals as llmCompare } from '../services/geminiService'
import { withCache, cacheKey, TTL } from '../services/cacheService'

const ComparisonQuerySchema = z.object({
  candidateA: z.string().min(1),
  candidateB: z.string().min(1),
  topic: z.string().optional(),
})

export async function compareHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { candidateA: slugA, candidateB: slugB, topic } = ComparisonQuerySchema.parse(req.query)

    const [candidateA, candidateB] = await Promise.all([
      candidateService.getCandidateBySlug(slugA),
      candidateService.getCandidateBySlug(slugB),
    ])

    if (!candidateA) {
      res.status(404).json({ success: false, error: `Candidato "${slugA}" não encontrado` })
      return
    }
    if (!candidateB) {
      res.status(404).json({ success: false, error: `Candidato "${slugB}" não encontrado` })
      return
    }

    const compKey = cacheKey.comparison(
      candidateService.getCandidateReadModel(),
      slugA,
      slugB,
      topic ?? 'all',
    )
    const comparisons = await withCache(compKey, TTL.COMPARISON, async () => {
      const [proposalsA, proposalsB] = await Promise.all([
        getProposalsByCandidate(candidateA.id),
        getProposalsByCandidate(candidateB.id),
      ])

      const themes = topic
        ? [topic]
        : [...new Set([...Object.keys(proposalsA), ...Object.keys(proposalsB)])]

      return Promise.all(
        themes.map(async (theme) => {
          const textsA = (proposalsA[theme] ?? []).map((p) => p.description ?? p.title)
          const textsB = (proposalsB[theme] ?? []).map((p) => p.description ?? p.title)

          const aiSummary = await llmCompare(
            theme,
            textsA,
            textsB,
            candidateA.name,
            candidateB.name,
          )

          return {
            theme,
            proposalsA: proposalsA[theme] ?? [],
            proposalsB: proposalsB[theme] ?? [],
            aiSummary,
          }
        }),
      )
    })

    res.json({
      success: true,
      data: {
        candidateA: {
          id: candidateA.id,
          name: candidateA.name,
          party: candidateA.party,
          state: candidateA.state,
          photoUrl: candidateA.photoUrl,
          slug: slugA,
        },
        candidateB: {
          id: candidateB.id,
          name: candidateB.name,
          party: candidateB.party,
          state: candidateB.state,
          photoUrl: candidateB.photoUrl,
          slug: slugB,
        },
        comparisons,
      },
    })
  } catch (err) {
    next(err)
  }
}

export async function getComparisonTopicsHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const categories = await getProposalCategories()
    res.json({ success: true, data: categories })
  } catch (err) {
    next(err)
  }
}
