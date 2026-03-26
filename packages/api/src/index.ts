import 'dotenv/config'
import express, { type Express } from 'express'
import cors from 'cors'
import helmet from 'helmet'

import { errorHandler } from './middleware/errorHandler'
import { rateLimiter } from './middleware/rateLimiter'
import { invalidate } from './services/cacheService'
import candidatesRouter from './routes/candidates'
import proposalsRouter from './routes/proposals'
import comparisonRouter from './routes/comparison'
import transparencyRouter from './routes/transparency'

const app: Express = express()
const PORT = process.env.API_PORT ?? 3001

// ── Global middleware ─────────────────────────────────────────────────────────
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

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/candidates', candidatesRouter)
app.use('/api/proposals', proposalsRouter)
app.use('/api/comparison', comparisonRouter)
app.use('/api/transparency', transparencyRouter)

// ── Error handling (must be last) ─────────────────────────────────────────────
app.use(errorHandler)

app.listen(PORT, () => {
  console.info(`[api] Running on http://localhost:${PORT}`)
  // Flush candidate caches on startup so stale null entries (from pre-seed requests) don't persist
  invalidate('candidates:*').catch(() => {})
})

export default app
