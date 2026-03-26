import { Router } from 'express'
import {
  listCandidatesHandler,
  getCandidateHandler,
  getCandidateProposalsHandler,
  getCandidateTransparencyHandler,
  getCandidateConsistencyHandler,
  getCandidateStatsHandler,
} from '../controllers/candidates'

const router = Router()

// GET /api/candidates — list with filters & pagination
router.get('/', listCandidatesHandler)

// GET /api/candidates/stats — aggregate counts by position/party/state
router.get('/stats', getCandidateStatsHandler)

// GET /api/candidates/:slug — full candidate profile
router.get('/:slug', getCandidateHandler)

// GET /api/candidates/:slug/proposals — candidate's proposals grouped by category
router.get('/:slug/proposals', getCandidateProposalsHandler)

// GET /api/candidates/:slug/transparency — voting, assets, campaign financing
router.get('/:slug/transparency', getCandidateTransparencyHandler)

// GET /api/candidates/:slug/consistency — consistency scores (proposals vs. votes)
router.get('/:slug/consistency', getCandidateConsistencyHandler)

export default router
