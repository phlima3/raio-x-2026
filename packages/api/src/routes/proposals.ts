import { Router, type Router as RouterType } from 'express'
import {
  listProposalsHandler,
  getProposalHandler,
  getProposalCategoriesHandler,
} from '../controllers/proposals'

const router: RouterType = Router()

// GET /api/proposals — list with filters (candidateId, category, status, source)
router.get('/', listProposalsHandler)

// GET /api/proposals/categories — distinct categories for filter UI
router.get('/categories', getProposalCategoriesHandler)

// GET /api/proposals/:id — single proposal detail with Gemini summary
router.get('/:id', getProposalHandler)

export default router
