import express, { type NextFunction, type Request, type Response } from 'express'
import { collectDefaultMetrics, Counter, Histogram, register } from 'prom-client'

/**
 * A Veloz raspa um endpoint no formato Prometheus a cada 30 segundos.
 *
 * Ele fica num listener próprio, **não** na porta 3001 que serve a API: só a
 * porta declarada em `veloz.json` recebe tráfego do domínio público, então
 * métrica interna não vira URL aberta na internet.
 */
const DEFAULT_METRICS_PORT = 9090

collectDefaultMetrics()

const httpDuration = new Histogram({
  name: 'raiox_http_request_duration_seconds',
  help: 'Duração das requisições HTTP da API por rota e status',
  labelNames: ['method', 'route', 'status'],
  // Faixas escolhidas para o que esta API faz: resposta de cache fica abaixo
  // de 50ms, consulta ao Postgres vive entre 100ms e 1s, e o que passa de 2s
  // já é o caso que interessa investigar.
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
})

const cacheEvents = new Counter({
  name: 'raiox_cache_events_total',
  help: 'Leituras do cache Redis por desfecho',
  labelNames: ['result'],
})

/**
 * Cache errando em silêncio já custou caro aqui: `withCache` guardava `null`
 * como a string `"null"` e servia o valor eternamente, e o scraper local
 * invalidava um Redis que não existia. Um contador de acerto e erro mostra
 * isso sem depender de alguém reparar num aviso perdido no log.
 */
export function recordCacheEvent(result: 'hit' | 'miss' | 'bypass'): void {
  cacheEvents.inc({ result })
}

/**
 * Rótulo de rota com cardinalidade limitada.
 *
 * O caminho cru viraria uma série por candidato — são 519 fichas, e cada
 * combinação de rota e status multiplica isso. O padrão registrado no Express
 * (`/api/candidates/:slug`) agrupa todas elas numa série só.
 */
export function routeLabelFor(request: {
  baseUrl?: string
  route?: { path?: unknown }
}): string {
  const base = request.baseUrl ?? ''
  const path = request.route?.path
  if (typeof path === 'string') return `${base}${path === '/' ? '' : path}` || '/'
  return base || 'desconhecida'
}

export function metricsMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const fim = httpDuration.startTimer({ method: request.method })
  response.on('finish', () => {
    fim({ route: routeLabelFor(request), status: String(response.statusCode) })
  })
  next()
}

export function startMetricsServer(
  port: number = Number(process.env.METRICS_PORT) || DEFAULT_METRICS_PORT,
): void {
  const app = express()
  app.get('/metrics', async (_request, response) => {
    response.set('Content-Type', register.contentType)
    response.end(await register.metrics())
  })
  app.listen(port, () => {
    console.info(`[api] métricas em http://localhost:${port}/metrics`)
  })
}
