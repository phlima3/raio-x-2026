import 'dotenv/config'
import express, { type Express } from 'express'
import cors from 'cors'
import helmet from 'helmet'

import { errorHandler } from './middleware/errorHandler'
import { rateLimiter } from './middleware/rateLimiter'
import candidatesRouter from './routes/candidates'
import proposalsRouter from './routes/proposals'
import comparisonRouter from './routes/comparison'
import transparencyRouter from './routes/transparency'

const app: Express = express()
const PORT = process.env.API_PORT ?? 3001

// ── Global middleware ─────────────────────────────────────────────────────────
app.use(helmet())
app.use(cors({ origin: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000' }))
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
})

export default app
