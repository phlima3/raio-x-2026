import cors from 'cors'
import express, { type Express } from 'express'
import helmet from 'helmet'

import { errorHandler } from './middleware/errorHandler'
import { metricsMiddleware } from './observability/metrics'
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
  // O Google rastreia api.raio-x-2026.com.br e lista `/api/candidates`,
  // `/api/candidates/stats` e `/api/candidates/seo-report` como "rastreada,
  // mas não indexada" (Search Console, 2026-09). JSON não é página: dizer
  // isso no cabeçalho vale para toda rota, inclusive as que ainda não existem.
  app.use((_req, res, next) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow')
    next()
  })
  app.get('/robots.txt', (_req, res) => {
    res.type('text/plain').send('User-agent: *\nDisallow: /\n')
  })
  const corsOrigins = [
    'http://localhost:3000',
    'https://raio-x-2026.com.br',
    'https://www.raio-x-2026.com.br',
    process.env.FRONTEND_URL,
  ].filter(Boolean) as string[]
  app.use(cors({ origin: corsOrigins }))
  app.use(express.json())
  app.use(rateLimiter)
  // Depois do rate limiter, para que a requisicao recusada com 429 tambem
  // apareca na metrica -- e justamente o caso que se quer enxergar.
  app.use(metricsMiddleware)

  app.use('/health', healthRouter)
  app.use('/api/candidates', candidatesRouter)
  app.use('/api/proposals', proposalsRouter)
  app.use('/api/comparison', comparisonRouter)
  app.use('/api/transparency', transparencyRouter)

  app.use(errorHandler)
  return app
}
