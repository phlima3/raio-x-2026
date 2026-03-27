import { Router, type Router as RouterType, Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import Redis from 'ioredis'

const router: RouterType = Router()
const prisma = new PrismaClient()

function getRedis(): Redis {
  return new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    lazyConnect: true,
    enableOfflineQueue: false,
    connectTimeout: 2_000,
    commandTimeout: 2_000,
    retryStrategy: () => null, // no retries in health check
  })
}

// GET /health — liveness + readiness probe
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  const timestamp = new Date().toISOString()

  // Check DB connectivity
  let dbStatus: 'ok' | 'error' = 'ok'
  try {
    await prisma.$queryRaw`SELECT 1`
  } catch {
    dbStatus = 'error'
  }

  // Check Redis connectivity
  let redisStatus: 'ok' | 'error' = 'ok'
  const redisClient = getRedis()
  try {
    await redisClient.ping()
  } catch {
    redisStatus = 'error'
  } finally {
    redisClient.disconnect()
  }

  const allOk = dbStatus === 'ok' && redisStatus === 'ok'

  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ok' : 'degraded',
    db: dbStatus,
    redis: redisStatus,
    timestamp,
  })
})

export default router
