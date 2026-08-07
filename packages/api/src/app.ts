import cors from 'cors'
import express, { type Express } from 'express'
import helmet from 'helmet'

import { errorHandler } from './middleware/errorHandler'
import { rateLimiter } from './middleware/rateLimiter'
import candidatesRouter from './routes/candidates'
import comparisonRouter from './routes/comparison'
import healthRouter from './routes/health'
import proposalsRouter from './routes/proposals'
import transparencyRouter from './routes/transparency'

export function createApp(): Express {
  const app = express()

  app.set('trust proxy', 1)
  app.use(helmet())
  const corsOrigins = [
    'http://localhost:3000',
    'https://raio-x-2026.com.br',
    'https://www.raio-x-2026.com.br',
    process.env.FRONTEND_URL,
  ].filter(Boolean) as string[]
  app.use(cors({ origin: corsOrigins }))
  app.use(express.json())
  app.use(rateLimiter)

  app.use('/health', healthRouter)
  app.use('/api/candidates', candidatesRouter)
  app.use('/api/proposals', proposalsRouter)
  app.use('/api/comparison', comparisonRouter)
  app.use('/api/transparency', transparencyRouter)

  app.use(errorHandler)
  return app
}
