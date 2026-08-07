import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import http from 'node:http'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const webDirectory = process.cwd()
const nextBinary = require.resolve('next/dist/bin/next')
const port = Number(process.env.SEO_SMOKE_PORT ?? 3210)
const configuredApiOrigin = process.env.SEO_SMOKE_API_ORIGIN?.replace(/\/$/, '')
const mockApiPort = Number(process.env.SEO_SMOKE_API_PORT ?? 3211)
const apiOrigin = configuredApiOrigin ?? `http://127.0.0.1:${mockApiPort}`
const requireSyntheticSitemapGate =
  process.env.SEO_SMOKE_REQUIRE_SYNTHETIC_GATE === 'true'
const revalidationSecret = 'seo-smoke-local-secret'
const serverLogs: string[] = []

interface ResponseSnapshot {
  status: number
  headers: http.IncomingHttpHeaders
  body: string
  buffer: Buffer
}

interface RequestOptions {
  method?: string
  headers?: Record<string, string>
  body?: unknown
}

interface CandidateListResponse {
  data: Array<{ slug: string; name: string }>
}

interface CandidateSeoResponse {
  data: Array<{ slug: string; aliases: string[]; indexable: boolean }>
}

const mockCandidate = {
  id: 'seo-smoke-candidate',
  slug: 'candidata-teste-partido-sp',
  name: 'Candidata Teste',
  socialName: null,
  party: 'PARTIDO',
  state: 'SP',
  position: 'PRESIDENTE',
  photoUrl: null,
  ballotNumber: 42,
  isIncumbent: false,
  electionYear: 2026,
  candidacyStatus: 'registro_solicitado',
  updatedAt: '2026-08-07T18:00:00.000Z',
  bio: 'Perfil de validação do renderizador de produção.',
  bioSummary: 'Perfil sintético usado exclusivamente no smoke test local.',
  siteUrl: null,
  email: null,
  coalitionName: null,
  approvalRate: null,
  partyHistory: [],
  proposals: [
    {
      id: 'proposal-smoke-1',
      title: 'Ampliar a transparência de dados públicos',
      category: 'Transparência',
      status: 'SUBMITTED',
      source: 'Programa de governo',
      tags: ['transparência'],
      proposedAt: '2026-08-01T12:00:00.000Z',
      description: 'Publicar bases públicas em formatos abertos e auditáveis.',
      summary: 'Dados públicos abertos e auditáveis.',
      url: 'https://example.com/programa#transparencia',
      candidateId: 'seo-smoke-candidate',
    },
  ],
  votingRecords: [],
  assetDeclarations: [],
  campaignFinancings: [],
  candidacyStatusSourceUrl: 'https://divulgacandcontas.tse.jus.br/registro-teste',
  candidacyStatusVerifiedAt: '2026-08-07T18:00:00.000Z',
  bioSourceUrl: 'https://example.com/biografia',
  materialUpdatedAt: '2026-08-07T18:00:00.000Z',
  reviewedAt: '2026-08-07T18:00:00.000Z',
  editorialApprovedAt: '2026-08-07T18:00:00.000Z',
  editorialAuthor: 'Equipe editorial de teste',
  editorialReviewer: 'Revisão automatizada de teste',
  photoSourceUrl: null,
  photoLicense: null,
}

function sendJson(response: http.ServerResponse, status: number, data: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(data))
}

const mockApiServer = configuredApiOrigin
  ? null
  : http.createServer((request, response) => {
      const url = new URL(request.url ?? '/', apiOrigin)
      if (url.pathname === '/api/candidates') {
        sendJson(response, 200, {
          success: true,
          data: [mockCandidate],
          meta: { total: 1, page: 1, limit: 1, totalPages: 1 },
        })
        return
      }
      if (url.pathname === '/api/candidates/seo-report') {
        sendJson(response, 200, {
          success: true,
          data: [{
            id: mockCandidate.id,
            slug: mockCandidate.slug,
            aliases: [],
            duplicateCandidateIds: [],
            name: mockCandidate.name,
            party: mockCandidate.party,
            state: mockCandidate.state,
            position: mockCandidate.position,
            electionYear: mockCandidate.electionYear,
            candidacyStatus: mockCandidate.candidacyStatus,
            candidacyStatusVerifiedAt: mockCandidate.candidacyStatusVerifiedAt,
            materialUpdatedAt: mockCandidate.materialUpdatedAt,
            reviewedAt: mockCandidate.reviewedAt,
            updatedAt: mockCandidate.updatedAt,
            topics: ['Transparência'],
            searchIntent: {
              primary: 'candidata teste eleições 2026',
              secondary: [],
              validation: 'hipotese_aguardando_search_console',
            },
            indexable: true,
            blockers: [],
            warnings: [],
            substantiveModules: ['trajetoria', 'propostas', 'patrimonio'],
            blockerMessages: [],
          }],
          meta: { total: 1, indexable: 1 },
        })
        return
      }
      if (url.pathname === '/api/candidates/stats') {
        sendJson(response, 200, {
          success: true,
          data: {
            total: 1,
            byPosition: { PRESIDENTE: 1 },
            byParty: { PARTIDO: 1 },
            byState: { SP: 1 },
          },
        })
        return
      }
      if (url.pathname === `/api/candidates/${mockCandidate.slug}`) {
        sendJson(response, 200, { success: true, data: mockCandidate })
        return
      }
      if (
        url.pathname === `/api/candidates/${mockCandidate.slug}/consistency` ||
        url.pathname === `/api/candidates/${mockCandidate.slug}/news`
      ) {
        sendJson(response, 200, { success: true, data: [] })
        return
      }
      sendJson(response, 404, { success: false, error: 'Rota de teste inexistente' })
    })

const mockApiReady = mockApiServer
  ? new Promise<void>((resolve, reject) => {
      mockApiServer.once('error', reject)
      mockApiServer.listen(mockApiPort, '127.0.0.1', resolve)
    })
  : Promise.resolve()

const server = spawn(process.execPath, [nextBinary, 'start', '-p', String(port)], {
  cwd: webDirectory,
  env: {
    ...process.env,
    NEXT_PUBLIC_API_URL: apiOrigin,
    API_URL_INTERNAL: apiOrigin,
    REVALIDATION_SECRET: revalidationSecret,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

server.stdout.on('data', (chunk: Buffer) => serverLogs.push(chunk.toString()))
server.stderr.on('data', (chunk: Buffer) => serverLogs.push(chunk.toString()))

function request(route: string, options: RequestOptions = {}): Promise<ResponseSnapshot> {
  return new Promise((resolve, reject) => {
    const payload = options.body == null
      ? null
      : Buffer.from(JSON.stringify(options.body))
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: route,
        method: options.method ?? 'GET',
        headers: {
          ...(payload
            ? {
                'content-type': 'application/json',
                'content-length': String(payload.length),
              }
            : {}),
          ...options.headers,
        },
      },
      (response) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => chunks.push(chunk))
        response.on('end', () => {
          const buffer = Buffer.concat(chunks)
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: buffer.toString('utf8'),
            buffer,
          })
        })
      },
    )

    req.setTimeout(15_000, () => req.destroy(new Error(`Timeout ao acessar ${route}`)))
    req.on('error', (error) => {
      reject(new Error(`${options.method ?? 'GET'} ${route}: ${error.message}`))
    })
    if (payload) req.write(payload)
    req.end()
  })
}

async function waitUntilReady(): Promise<void> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`Servidor encerrou com código ${server.exitCode}\n${serverLogs.join('')}`)
    }
    try {
      const response = await request('/')
      if (response.status === 200) return
    } catch {
      // O processo ainda está abrindo a porta.
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Servidor não iniciou a tempo.\n${serverLogs.join('')}`)
}

function canonical(html: string): string | undefined {
  return html.match(/<link rel="canonical" href="([^"]+)"/)?.[1]
}

function normalizeRootUrl(value: string | undefined): string | undefined {
  return value?.replace(/\/$/, '')
}

function hasNoindex(html: string): boolean {
  return /<meta name="robots" content="[^"]*noindex/i.test(html)
}

function hasJsonLd(html: string): boolean {
  return html.includes('type="application/ld+json"')
}

async function discoverCandidate(): Promise<{
  slug: string
  name: string
  indexable: boolean
}> {
  const listResponse = await fetch(
    `${apiOrigin}/api/candidates?electionYear=2026&limit=1`,
  )
  assert.equal(listResponse.ok, true, `API de candidatos retornou ${listResponse.status}`)
  const list = (await listResponse.json()) as CandidateListResponse
  const candidate = list.data[0]
  assert.ok(candidate, 'A API precisa oferecer ao menos um candidato para o smoke test')

  let indexable = false
  const qualityResponse = await fetch(`${apiOrigin}/api/candidates/seo-report`)
  if (qualityResponse.ok) {
    const quality = (await qualityResponse.json()) as CandidateSeoResponse
    indexable = quality.data.some(
      (item) =>
        (item.slug === candidate.slug || item.aliases.includes(candidate.slug)) &&
        item.indexable,
    )
  }

  return { ...candidate, indexable }
}

async function run(): Promise<void> {
  await mockApiReady
  await waitUntilReady()
  const evidence: string[] = []
  const discovered = await discoverCandidate()
  const candidatePath = `/candidatos/${discovered.slug}`

  const refreshSeoPages = await request('/api/revalidate', {
    method: 'POST',
    headers: { authorization: `Bearer ${revalidationSecret}` },
    body: {
      paths: ['/sitemap.xml', '/candidatos-presidente', candidatePath],
    },
  })
  assert.equal(refreshSeoPages.status, 200)

  const home = await request('/')
  assert.equal(home.status, 200)
  assert.equal(
    normalizeRootUrl(canonical(home.body)),
    'https://raio-x-2026.com.br',
  )
  assert.equal(hasNoindex(home.body), false)
  assert.equal(hasJsonLd(home.body), true)
  evidence.push('home: 200 + canonical + JSON-LD')

  const robots = await request('/robots.txt')
  assert.equal(robots.status, 200)
  assert.match(
    robots.body,
    /Sitemap: https:\/\/raio-x-2026\.com\.br\/sitemap\.xml/,
  )
  evidence.push('robots: 200 + sitemap canônico')

  let sitemap = await request('/sitemap.xml')
  assert.equal(sitemap.status, 200)
  let locations = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (match) => match[1],
  )
  const expectedCandidateUrl = `https://raio-x-2026.com.br${candidatePath}`
  for (
    let attempt = 0;
    requireSyntheticSitemapGate &&
      discovered.indexable &&
      !locations.includes(expectedCandidateUrl) &&
      attempt < 20;
    attempt += 1
  ) {
    await new Promise((resolve) => setTimeout(resolve, 250))
    sitemap = await request('/sitemap.xml')
    assert.equal(sitemap.status, 200)
    locations = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      (match) => match[1],
    )
  }
  assert.equal(new Set(locations).size, locations.length)
  assert.equal(locations.some((location) => location.includes('/busca')), false)
    for (const required of [
      '/eleicoes-2026',
      '/sobre',
      '/comparacoes',
      '/graficos/perfis-por-partido',
    ]) {
    assert.equal(
      locations.includes(`https://raio-x-2026.com.br${required}`),
      true,
      `Sitemap sem ${required}`,
    )
  }
  if (requireSyntheticSitemapGate) {
    assert.equal(
      locations.includes(expectedCandidateUrl),
      discovered.indexable,
      'Sitemap e quality gate divergiram para o perfil sintético',
    )
  }
  evidence.push(`sitemap: ${locations.length} URLs únicas; utilitárias excluídas`)

  for (const route of [
    '/eleicoes-2026',
    '/sobre',
    '/comparacoes',
    '/graficos/perfis-por-partido',
  ]) {
    const page = await request(route)
    assert.equal(page.status, 200)
    assert.equal(canonical(page.body), `https://raio-x-2026.com.br${route}`)
    assert.equal(hasNoindex(page.body), false)
    assert.equal(hasJsonLd(page.body), true)
  }
  evidence.push('hubs/editorial: indexáveis + canonical + JSON-LD')

  const citedGraph = await request('/graficos/perfis-por-partido/imagem')
  assert.equal(citedGraph.status, 200)
  assert.match(citedGraph.headers['content-type'] ?? '', /^image\/png/)
  evidence.push('ativo citável: página metodológica + PNG incorporável')

  const search = await request('/busca?q=ronaldo')
  assert.equal(search.status, 200)
  assert.equal(canonical(search.body), 'https://raio-x-2026.com.br/busca')
  assert.equal(hasNoindex(search.body), true)

  const compare = await request('/comparar?candidateA=a&candidateB=b')
  assert.equal(compare.status, 200)
  assert.equal(canonical(compare.body), 'https://raio-x-2026.com.br/comparar')
  assert.equal(hasNoindex(compare.body), true)
  evidence.push('parâmetros: canonical limpo + noindex')

  const landing = await request('/governador/ac')
  assert.equal(landing.status, 200)
  const landingInSitemap = locations.includes(
    'https://raio-x-2026.com.br/governador/ac',
  )
  assert.equal(hasNoindex(landing.body), !landingInSitemap)
  evidence.push('landing programática: indexação coerente com cobertura editorial')

  const globalOg = await request('/opengraph-image')
  assert.equal(globalOg.status, 200)
  assert.match(globalOg.headers['content-type'] ?? '', /^image\/png/)

  const candidate = await request(candidatePath)
  assert.equal(candidate.status, 200)
  assert.equal(
    canonical(candidate.body),
    `https://raio-x-2026.com.br${candidatePath}`,
  )
  assert.equal(hasNoindex(candidate.body), !discovered.indexable)
  assert.equal(hasJsonLd(candidate.body), true)
  assert.match(candidate.body, new RegExp(discovered.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(candidate.body, /Situação eleitoral/)
  assert.match(candidate.body, /Propostas/)
  assert.equal(
    candidate.body.includes('http://api.raio-x-2026.com.br/images/candidates/'),
    false,
  )

  const candidateOg = await request(`${candidatePath}/opengraph-image`)
  assert.equal(candidateOg.status, 200)
  assert.match(candidateOg.headers['content-type'] ?? '', /^image\/png/)
  evidence.push('perfil: SSR crítico + quality gate + JSON-LD + OG PNG')

  const wwwRedirect = await request('/sobre?src=smoke', {
    headers: {
      Host: 'www.raio-x-2026.com.br',
      'x-forwarded-proto': 'https',
    },
  })
  assert.equal(wwwRedirect.status, 308)
  assert.equal(
    wwwRedirect.headers.location,
    'https://raio-x-2026.com.br/sobre?src=smoke',
  )

  const httpRedirect = await request('/fontes', {
    headers: {
      Host: 'raio-x-2026.com.br',
      'x-forwarded-proto': 'http',
    },
  })
  assert.equal(httpRedirect.status, 308)
  assert.equal(
    httpRedirect.headers.location,
    'https://raio-x-2026.com.br/fontes',
  )
  evidence.push('redirect: www/HTTP consolidados em um salto 308')

  const invalidVital = await request('/api/web-vitals', {
    method: 'POST',
    body: { name: 'INVALID' },
  })
  assert.equal(invalidVital.status, 400)
  const validVital = await request('/api/web-vitals', {
    method: 'POST',
    body: {
      id: 'smoke-lcp',
      name: 'LCP',
      value: 1_800,
      rating: 'good',
      path: '/',
    },
  })
  assert.equal(validVital.status, 204)

  const unauthorizedRevalidation = await request('/api/revalidate', {
    method: 'POST',
    body: { paths: ['/'] },
  })
  assert.equal(unauthorizedRevalidation.status, 401)
  const authorizedRevalidation = await request('/api/revalidate', {
    method: 'POST',
    headers: { authorization: `Bearer ${revalidationSecret}` },
    body: { paths: ['/'], tags: ['candidates'] },
  })
  assert.equal(authorizedRevalidation.status, 200)
  evidence.push('observabilidade/revalidação: contratos HTTP validados')

  console.log(evidence.join('\n'))
}

run()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : error)
    console.error(serverLogs.slice(-20).join(''))
    process.exitCode = 1
  })
  .finally(() => {
    server.kill('SIGTERM')
    mockApiServer?.close()
  })
