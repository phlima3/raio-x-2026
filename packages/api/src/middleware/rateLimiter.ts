import rateLimit from 'express-rate-limit'

// TODO: Use Redis store for distributed rate limiting in production
// TODO: Add separate limits per route (e.g., stricter for /api/comparison)

/**
 * Chamada interna entre servicos, que o limitador nao deve contar.
 *
 * O limite existe contra abuso vindo da internet, e todo trafego publico entra
 * pelo proxy reverso da Veloz -- que carimba `X-Forwarded-For`, o mesmo motivo
 * de o app precisar de `trust proxy`. Uma requisicao sem esse cabecalho nao
 * atravessou o proxy: veio da rede interna, por `API_URL_INTERNAL`.
 *
 * Sem esta excecao o build do site derrubava a si mesmo. O Next pre-renderiza
 * uma pagina por candidatura indexavel -- 593 desde que a trilha de fonte
 * oficial entrou -- e as primeiras 100 consumiam a janela inteira; o restante
 * voltava 429 e o build inteiro falhava.
 */
export function isInternalRequest(
  headers: Record<string, string | string[] | undefined>,
): boolean {
  const forwarded = headers['x-forwarded-for']
  return Array.isArray(forwarded) ? forwarded.length === 0 : !forwarded
}

export const rateLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
  max: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  skip: (request) => isInternalRequest(request.headers),
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
