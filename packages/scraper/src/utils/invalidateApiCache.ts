import Redis from 'ioredis'
import { logger } from './logger'

export const CANDIDATE_CONTENT_CACHE_PATTERNS = [
  'raiox:v2:candidates:*',
  'raiox:v2:consistency:*',
  'raiox:v2:comparison:*',
  'raiox:v2:proposals:*',
] as const

export async function invalidateApiCandidateCaches(): Promise<void> {
  const redisUrl = process.env.REDIS_URL
  if (!redisUrl) {
    logger.warn('[cache] REDIS_URL ausente; cache da API expirará pelo TTL')
    return
  }

  const redis = new Redis(redisUrl, {
    lazyConnect: true,
    enableOfflineQueue: false,
    connectTimeout: 2_000,
    commandTimeout: 2_000,
    retryStrategy: () => null,
  })

  try {
    await redis.connect()
    let deleted = 0
    for (const pattern of CANDIDATE_CONTENT_CACHE_PATTERNS) {
      let cursor = '0'
      do {
        const [nextCursor, keys] = await redis.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100,
        )
        cursor = nextCursor
        if (keys.length > 0) deleted += await redis.del(...keys)
      } while (cursor !== '0')
    }
    logger.info(`[cache] ${deleted} entradas derivadas invalidadas na API`)
  } catch (error) {
    logger.warn(
      '[cache] Falha ao invalidar a API; o TTL permanece como fallback',
      error instanceof Error ? error.message : error,
    )
  } finally {
    redis.disconnect()
  }
}
