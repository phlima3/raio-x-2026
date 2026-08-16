import { prisma } from '../lib/prisma'
import { Router, type Router as RouterType, Request, Response } from 'express'

import Redis from 'ioredis'

const router: RouterType = Router()

function getRedis(): Redis {
  return new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    lazyConnect: true,
    enableOfflineQueue: false,
    connectTimeout: 2_000,
    commandTimeout: 2_000,
    retryStrategy: () => null, // no retries in health check
  })
}

export interface RedisHealthClient {
  connect(): Promise<void>
  ping(): Promise<unknown>
}

export async function connectAndPingRedis(client: RedisHealthClient): Promise<void> {
  await client.connect()
  await client.ping()
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
    await connectAndPingRedis(redisClient)
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
