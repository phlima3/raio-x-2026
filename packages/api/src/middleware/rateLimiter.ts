import rateLimit from 'express-rate-limit'

// TODO: Use Redis store for distributed rate limiting in production
// TODO: Add separate limits per route (e.g., stricter for /api/comparison)

export const rateLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
  max: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Muitas requisições. Tente novamente em alguns instantes.',
  },
})

export const strictRateLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Limite de requisições atingido para esta rota.',
  },
})
