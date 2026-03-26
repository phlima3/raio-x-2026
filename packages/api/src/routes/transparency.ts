import { Router } from 'express'
import {
  getVotingRecordsHandler,
  getAssetDeclarationsHandler,
  getCampaignFinancingHandler,
} from '../controllers/transparency'

const router = Router()

// GET /api/transparency/:candidateId/voting — voting history
router.get('/:candidateId/voting', getVotingRecordsHandler)

// GET /api/transparency/:candidateId/assets — asset declarations by year
router.get('/:candidateId/assets', getAssetDeclarationsHandler)

// GET /api/transparency/:candidateId/financing — campaign financing summary
router.get('/:candidateId/financing', getCampaignFinancingHandler)

export default router
