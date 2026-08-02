import Redis from 'ioredis'

// ── Client singleton ──────────────────────────────────────────────────────────

let redis: Redis | null = null

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      lazyConnect: true,
      enableOfflineQueue: false,
      // Fail fast on connection errors — do not block the app
      connectTimeout: 2_000,
      commandTimeout: 2_000,
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1_000)),
    })

    redis.on('error', (err) => {
      // Log but do not crash — cache is best-effort
      if ((err as NodeJS.ErrnoException).code !== 'ECONNREFUSED') {
        console.error('[cache] Redis error:', err.message)
      }
    })
  }
  return redis
}

// ── TTL constants (seconds) ───────────────────────────────────────────────────

export const TTL = {
  CANDIDATE_LIST: 60 * 60,     // 1h — list changes rarely
  CANDIDATE_DETAIL: 60 * 60,   // 1h — profile changes rarely
  PROPOSALS: 60 * 60,          // 1h
  CATEGORIES: 60 * 60 * 6,     // 6h — almost static
  COMPARISON: 60 * 60,         // 1h — LLM response is expensive
  STATS: 60 * 60 * 2,          // 2h
} as const

// ── Core helpers ──────────────────────────────────────────────────────────────

/**
 * Wraps an async function with Redis caching.
 * Falls back to calling fn() directly if Redis is unavailable.
 */
export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T> {
  if (process.env.CACHE_DISABLED === 'true') return fn()
  const client = getRedis()

  try {
    const cached = await client.get(key)
    if (cached) return JSON.parse(cached) as T
  } catch {
    // Redis down or parse error — fall through to fn()
  }

  const result = await fn()

  // Don't cache null/undefined — a missing resource may appear later (e.g. after seed)
  if (result != null) {
    try {
      await client.setex(key, ttlSeconds, JSON.stringify(result))
    } catch {
      // Best-effort — don't fail because we couldn't cache
    }
  }

  return result
}

/**
 * Invalidates a specific cache key or a pattern (prefix*).
 * Pattern invalidation uses SCAN to avoid blocking Redis with KEYS.
 */
export async function invalidate(keyOrPattern: string): Promise<void> {
  if (process.env.CACHE_DISABLED === 'true') return
  const client = getRedis()

  try {
    if (keyOrPattern.endsWith('*')) {
      let cursor = '0'
      do {
        const [nextCursor, keys] = await client.scan(cursor, 'MATCH', keyOrPattern, 'COUNT', 100)
        cursor = nextCursor
        if (keys.length > 0) await client.del(...keys)
      } while (cursor !== '0')
    } else {
      await client.del(keyOrPattern)
    }
  } catch {
    // Best-effort
  }
}

// ── Key builders ──────────────────────────────────────────────────────────────

export const cacheKey = {
  candidateList: (query: string) => `candidates:list:${query}`,
  candidateDetail: (slug: string) => `candidates:detail:${slug}`,
  candidateProposals: (slug: string) => `candidates:proposals:${slug}`,
  proposalList: (query: string) => `proposals:list:${query}`,
  categories: () => 'proposals:categories',
  comparison: (a: string, b: string, topic: string) =>
    `comparison:${[a, b].sort().join(':')}:${topic}`,
  stats: (readModel = 'legacy') => `candidates:stats:${readModel}`,
}
