import { createHash } from 'node:crypto'

import {
  createTseBrowserTransport,
  TseBrowserError,
  tseBrowserEnabled,
} from './browserTransport'

export enum TseResourceKind {
  CANDIDATES = 'CANDIDATES',
  CANDIDATE_COMPLEMENT = 'CANDIDATE_COMPLEMENT',
  ASSETS = 'ASSETS',
  COALITIONS = 'COALITIONS',
  VACANCIES = 'VACANCIES',
  CASSATIONS = 'CASSATIONS',
  SOCIAL_MEDIA = 'SOCIAL_MEDIA',
  CAMPAIGN_PROGRAMS = 'CAMPAIGN_PROGRAMS',
  PHOTOS = 'PHOTOS',
  UNKNOWN = 'UNKNOWN',
}

export interface TseResource {
  id: string
  name: string
  format: string
  url: string
  kind: TseResourceKind
}

export interface DownloadedTseResource {
  resource: TseResource
  bytes: Buffer
  sha256: string
  fetchedAt: Date
}

export interface TseHttpPort {
  getJson<T>(url: string): Promise<T>
  getBytes(url: string): Promise<Buffer>
}

export interface TseCkanClient {
  discover(year: number): Promise<TseResource[]>
  download(resource: TseResource): Promise<DownloadedTseResource>
}

export interface CreateTseCkanClientOptions {
  baseUrl?: string
  http?: TseHttpPort
}

interface CkanResourceRaw {
  id?: unknown
  name?: unknown
  format?: unknown
  url?: unknown
}

interface CkanPackageResponse {
  success?: unknown
  result?: {
    name?: unknown
    resources?: unknown
  }
}

export class TseCkanError extends Error {
  constructor(
    readonly code: 'HTTP_ERROR' | 'INVALID_CATALOG',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'TseCkanError'
  }
}

function normalizeToken(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function classifyResource(name: string, url: string): TseResourceKind {
  const token = normalizeToken(`${name} ${url}`)
  if (token.includes('complementar')) return TseResourceKind.CANDIDATE_COMPLEMENT
  if (token.includes('bem_candidato') || token.includes('bens de candidato')) {
    return TseResourceKind.ASSETS
  }
  if (token.includes('coligac')) return TseResourceKind.COALITIONS
  if (token.includes('vaga')) return TseResourceKind.VACANCIES
  if (token.includes('cassac')) return TseResourceKind.CASSATIONS
  if (token.includes('rede_social') || token.includes('redes sociais')) {
    return TseResourceKind.SOCIAL_MEDIA
  }
  if (token.includes('foto_cand') || token.includes('fotos de candidato')) {
    return TseResourceKind.PHOTOS
  }
  if (token.includes('proposta') || token.includes('programa')) {
    return TseResourceKind.CAMPAIGN_PROGRAMS
  }
  if (token.includes('consulta_cand') || token.trim().startsWith('candidatos ')) {
    return TseResourceKind.CANDIDATES
  }
  return TseResourceKind.UNKNOWN
}

function catalogBaseUrl(value: string): string {
  return value.replace(/\/+$/, '').replace(/\/api(?:\/3)?$/i, '')
}

function parseResources(response: CkanPackageResponse): TseResource[] {
  const rawResources = response.result?.resources
  if (response.success !== true || !Array.isArray(rawResources)) {
    throw new TseCkanError('INVALID_CATALOG', 'Resposta inválida do catálogo CKAN do TSE')
  }

  return rawResources.flatMap((raw: CkanResourceRaw) => {
    if (
      typeof raw.id !== 'string' || typeof raw.name !== 'string' ||
      typeof raw.url !== 'string' || typeof raw.format !== 'string'
    ) {
      return []
    }
    return [{
      id: raw.id,
      name: raw.name,
      format: raw.format,
      url: raw.url,
      kind: classifyResource(raw.name, raw.url),
    }]
  })
}

export function createFetchTseHttpPort(timeoutMs = 30_000): TseHttpPort {
  async function checkedFetch(url: string): Promise<Response> {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'RaioX2026Bot/1.0 (official-data-sync)' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) {
      throw new TseCkanError('HTTP_ERROR', `TSE respondeu HTTP ${response.status} para ${url}`)
    }
    return response
  }

  return {
    async getJson<T>(url: string): Promise<T> {
      return (await checkedFetch(url)).json() as Promise<T>
    },
    async getBytes(url: string): Promise<Buffer> {
      const data = await (await checkedFetch(url)).arrayBuffer()
      return Buffer.from(data)
    },
  }
}

/**
 * Traduz o erro neutro do transporte pelo browser no erro que o resto do
 * cliente já sabe tratar, para quem chama não precisar saber por qual caminho
 * o dado veio.
 */
export function createBrowserTseHttpPort(): TseHttpPort {
  const transport = createTseBrowserTransport()
  async function mapped<T>(url: string, run: () => Promise<T>): Promise<T> {
    try {
      return await run()
    } catch (error) {
      if (error instanceof TseBrowserError) {
        throw new TseCkanError('HTTP_ERROR', `TSE respondeu para ${url}: ${error.message}`)
      }
      throw error
    }
  }
  return {
    getJson: (url) => mapped(url, () => transport.getJson(url)),
    getBytes: (url) => mapped(url, () => transport.getBytes(url)),
  }
}

/** Browser só quando pedido; em CI o caminho segue sendo o `fetch` puro. */
export function createDefaultTseHttpPort(): TseHttpPort {
  return tseBrowserEnabled() ? createBrowserTseHttpPort() : createFetchTseHttpPort()
}

export function createTseCkanClient(
  options: CreateTseCkanClientOptions = {},
): TseCkanClient {
  const baseUrl = catalogBaseUrl(
    options.baseUrl ?? process.env.TSE_API_URL ?? 'https://dadosabertos.tse.jus.br',
  )
  const http = options.http ?? createDefaultTseHttpPort()

  return {
    async discover(year) {
      if (!Number.isInteger(year) || year < 1980 || year > 2100) {
        throw new TseCkanError('INVALID_CATALOG', `Ano eleitoral inválido: ${year}`)
      }
      const dataset = encodeURIComponent(`candidatos-${year}`)
      const response = await http.getJson<CkanPackageResponse>(
        `${baseUrl}/api/3/action/package_show?id=${dataset}`,
      )
      return parseResources(response)
    },
    async download(resource) {
      const bytes = await http.getBytes(resource.url)
      return {
        resource,
        bytes,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        fetchedAt: new Date(),
      }
    },
  }
}
