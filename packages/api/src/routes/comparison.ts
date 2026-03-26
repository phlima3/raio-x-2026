import { Router, type Router as RouterType } from 'express'
import { compareHandler, getComparisonTopicsHandler } from '../controllers/comparison'
import { strictRateLimiter } from '../middleware/rateLimiter'

const router: RouterType = Router()

// GET /api/comparison?candidateA=:id&candidateB=:id — side-by-side candidate data
// Uses strict rate limiter because Gemini calls can be expensive
router.get('/', strictRateLimiter, compareHandler)

// GET /api/comparison/topics — available comparison topics (categories)
router.get('/topics', getComparisonTopicsHandler)

export default router
