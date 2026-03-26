import { Request, Response, NextFunction } from 'express'
import { ProposalFiltersSchema } from '../types/proposal'
import * as proposalService from '../services/proposalService'

export async function listProposalsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const filters = ProposalFiltersSchema.parse(req.query)
    const result = await proposalService.listProposals(filters)
    res.json({ success: true, ...result })
  } catch (err) {
    next(err)
  }
}

export async function getProposalHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params
    const proposal = await proposalService.getProposalById(id)
    if (!proposal) {
      res.status(404).json({ success: false, error: 'Proposta não encontrada' })
      return
    }
    res.json({ success: true, data: proposal })
  } catch (err) {
    next(err)
  }
}

export async function getProposalCategoriesHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const categories = await proposalService.getProposalCategories()
    res.json({ success: true, data: categories })
  } catch (err) {
    next(err)
  }
}
