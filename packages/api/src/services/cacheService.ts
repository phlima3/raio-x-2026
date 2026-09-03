import Redis from 'ioredis'
import { recordCacheEvent } from '../observability/metrics'

// ── Client singleton ──────────────────────────────────────────────────────────

let redis: Redis | null = null
export const CACHE_NAMESPACE = 'raiox:v2:'

function namespaced(key: string): string {
  return `${CACHE_NAMESPACE}${key}`
}

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
/**
 * Espera o Redis ficar pronto antes de mandar comando.
 *
 * O cliente usa `lazyConnect` com `enableOfflineQueue: false`, então comando
 * emitido antes da conexão estabelecer é rejeitado na hora — não enfileirado.
 * A invalidação do startup caía exatamente nisso e o `.catch` a engolia: em
 * 2026-08-29 a API serviu por uma hora um `CampaignFinancing` sem as colunas
 * novas, cacheado antes do deploy, porque a limpeza nunca chegou a rodar.
 */
export async function ensureRedisReady(timeoutMs = 5_000): Promise<void> {
  const client = getRedis()
  // Ler por função: `client.status` muda depois do `connect()`, e comparar a
  // propriedade direto faz o TypeScript estreitar o tipo e descartar 'ready'.
  const pronto = () => client.status === 'ready'
  if (pronto()) return
  if (client.status === 'wait' || client.status === 'end') {
    await client.connect().catch(() => undefined)
  }
  if (pronto()) return
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Redis não ficou pronto a tempo')), timeoutMs)
    client.once('ready', () => { clearTimeout(timer); resolve() })
    client.once('error', (error) => { clearTimeout(timer); reject(error) })
  })
}

export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T> {
  if (process.env.CACHE_DISABLED === 'true') {
    recordCacheEvent('bypass')
    return fn()
  }
  const client = getRedis()

  try {
    const cached = await client.get(namespaced(key))
    if (cached) {
      recordCacheEvent('hit')
      return JSON.parse(cached) as T
    }
  } catch {
    // Redis down or parse error — fall through to fn()
  }
  recordCacheEvent('miss')

  const result = await fn()

  // Don't cache null/undefined — a missing resource may appear later (e.g. after seed)
  if (result != null) {
    try {
      await client.setex(namespaced(key), ttlSeconds, JSON.stringify(result))
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
  const namespacedKeyOrPattern = namespaced(keyOrPattern)

  try {
    if (namespacedKeyOrPattern.endsWith('*')) {
      let cursor = '0'
      do {
        const [nextCursor, keys] = await client.scan(
          cursor,
          'MATCH',
          namespacedKeyOrPattern,
          'COUNT',
          100,
        )
        cursor = nextCursor
        if (keys.length > 0) await client.del(...keys)
      } while (cursor !== '0')
    } else {
      await client.del(namespacedKeyOrPattern)
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
  comparison: (readModel: string, a: string, b: string, topic: string) =>
    `comparison:${readModel}:${[a, b].sort().join(':')}:${topic}`,
  stats: (readModel = 'legacy') => `candidates:stats:${readModel}`,
}
