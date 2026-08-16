import { logger } from '@/lib/logger'
import { validateWebVital } from '@/lib/web-vitals'

const MAX_BODY_BYTES = 2_048
const RATE_LIMIT = 600
const RATE_WINDOW_MS = 60_000
const MAX_RATE_LIMIT_KEYS = 10_000
const rateLimits = new Map<string, { count: number; resetAt: number }>()

function requestKey(request: Request): string {
  const trustedHeader = process.env.TRUSTED_PROXY_IP_HEADER?.trim().toLowerCase()
  if (!trustedHeader) return 'global'
  return (request.headers.get(trustedHeader) ?? 'unknown').trim().slice(0, 120)
}

function consumeRateLimit(key: string, now = Date.now()): boolean {
  for (const [candidateKey, entry] of rateLimits) {
    if (entry.resetAt <= now) rateLimits.delete(candidateKey)
  }
  const current = rateLimits.get(key)
  if (!current) {
    if (rateLimits.size >= MAX_RATE_LIMIT_KEYS) return false
    rateLimits.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return true
  }
  if (current.count >= RATE_LIMIT) return false
  current.count += 1
  return true
}

class PayloadTooLargeError extends Error {}

async function readBoundedJson(request: Request): Promise<unknown> {
  if (!request.body) return null
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    received += value.byteLength
    if (received > MAX_BODY_BYTES) {
      await reader.cancel()
      throw new PayloadTooLargeError()
    }
    chunks.push(value)
  }

  const bytes = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown
  } catch {
    return null
  }
}

export async function POST(request: Request): Promise<Response> {
  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return Response.json({ success: false, error: 'Payload muito grande' }, { status: 413 })
  }
  if (!consumeRateLimit(requestKey(request))) {
    return Response.json(
      { success: false, error: 'Limite de requisições excedido' },
      { status: 429, headers: { 'retry-after': '60' } },
    )
  }

  let parsed: unknown
  try {
    parsed = await readBoundedJson(request)
  } catch (error) {
    if (!(error instanceof PayloadTooLargeError)) throw error
    return Response.json({ success: false, error: 'Payload muito grande' }, { status: 413 })
  }
  const metric = validateWebVital(parsed)
  if (!metric) {
    return Response.json({ success: false, error: 'Métrica inválida' }, { status: 400 })
  }

  logger.info('web-vital', metric)
  return new Response(null, {
    status: 204,
    headers: { 'cache-control': 'no-store' },
  })
}
