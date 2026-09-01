import { Request, Response, NextFunction } from 'express'
import type { CampaignFinancing } from '@prisma/client'
import { z } from 'zod'
import * as candidateService from '../services/candidateService'
import { getProposalsByCandidate, getProposalCategories } from '../services/proposalService'
import { withCache, cacheKey, TTL } from '../services/cacheService'

const ComparisonQuerySchema = z.object({
  candidateA: z.string().min(1),
  candidateB: z.string().min(1),
  topic: z.string().optional(),
})

/**
 * Prestação de contas mais recente já publicada, reduzida ao que a comparação
 * mostra. `getCandidateBySlug` traz a relação com a política de publicação
 * aplicada e ordenada por ano desc, então a primeira linha é a do ano corrente.
 *
 * `donors` e `suppliers` ficam de fora de propósito: o bloco não os exibe, e
 * não se abre um endpoint novo para dados de doador pessoa física.
 *
 * Devolver `null` quando não há linha é o que permite à tela separar quem não
 * entregou contas de quem entregou declarando zero.
 */
function publicFinancing(candidate: { campaignFinancings: CampaignFinancing[] }) {
  const financing = candidate.campaignFinancings[0]
  if (!financing) return null

  return {
    year: financing.year,
    totalReceived: financing.totalReceived,
    totalSpent: financing.totalSpent,
    fefcReceived: financing.fefcReceived,
    partyFundReceived: financing.partyFundReceived,
    crowdfundingReceived: financing.crowdfundingReceived,
    individualsReceived: financing.individualsReceived,
    companiesReceived: financing.companiesReceived,
    ownResourcesReceived: financing.ownResourcesReceived,
    otherReceived: financing.otherReceived,
    sourceUrl: financing.sourceUrl,
    accountsUpdatedAt: financing.accountsUpdatedAt,
  }
}

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

    // O cargo define o que cada um promete governar e de que porte é a campanha.
    // O seletor da tela já só oferece quem disputa o mesmo cargo, mas a regra
    // precisa valer também para URL montada à mão: sem isto, compara-se plano
    // de presidente com o de governador — e, desde a comparação financeira,
    // R$ 42 mi de campanha nacional com R$ 2 mi de estadual, lado a lado.
    if (candidateA.position !== candidateB.position) {
      res.status(400).json({
        success: false,
        error: 'Só é possível comparar candidatos ao mesmo cargo',
      })
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
        themes.map((theme) => {
          return {
            theme,
            proposalsA: proposalsA[theme] ?? [],
            proposalsB: proposalsB[theme] ?? [],
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
        financingA: publicFinancing(candidateA),
        financingB: publicFinancing(candidateB),
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
