/**
 * Porta HTTP do DivulgaCandContas servida por um Chrome de verdade.
 *
 * O TSE responde 403 a cliente automatizado. O bloqueio não é por IP: da
 * mesma máquina e do mesmo endereço, medido em 2026-08-29,
 *
 *   curl                          -> 403
 *   fetch do Node                 -> 403
 *   Chromium headless (Playwright)-> 403
 *   Chrome instalado, headed      -> 200
 *
 * e o mesmo vale para `cdn.tse.jus.br`. Quem roda no GitHub Actions passa sem
 * isto; quem roda na máquina de desenvolvimento, não. Esta porta existe para
 * o segundo caso, e é opt-in por `TSE_DIVULGACAND_BROWSER=1` — em CI o
 * caminho continua sendo o `fetch` puro, que é mais barato e não precisa de
 * sessão gráfica.
 *
 * A requisição sai de dentro da página, e não do processo Node: é a navegação
 * real que resolve o desafio do Akamai, e só um `fetch` mesma-origem herda
 * essa sessão.
 */

import { chromium, type Browser, type Page } from 'playwright'

import {
  DIVULGACAND_BASE_URL,
  DivulgaCandError,
  type DivulgaCandHttpPort,
} from './divulgaCand'
import { logger } from '../../utils/logger'

/** Resposta trazida da página; `body` vem em base64 para servir texto e PDF. */
export interface BrowserHttpResponse {
  status: number
  body: string | null
}

export interface DisposableDivulgaCandHttpPort extends DivulgaCandHttpPort {
  dispose(): Promise<void>
}

export interface CreateBrowserPortOptions {
  baseUrl?: string
  timeoutMs?: number
}

/** Liga a porta pelo browser; fora dela o sync usa `fetch` puro. */
export function browserPortEnabled(): boolean {
  const flag = process.env.TSE_DIVULGACAND_BROWSER?.trim().toLowerCase()
  return flag === '1' || flag === 'true'
}

function trimBaseUrl(value: string): string {
  return value.replace(/\/+$/, '')
}

/**
 * Traduz a resposta da página nos mesmos erros que a porta de `fetch` produz,
 * para o sync não precisar saber por qual caminho o dado veio. Fica separada
 * da navegação porque é a parte com regra — e a única testável sem browser.
 */
export function decodeBrowserResponse(url: string, response: BrowserHttpResponse): Buffer {
  if (response.status === 404) {
    throw new DivulgaCandError('NOT_FOUND', `DivulgaCandContas respondeu 404 para ${url}`)
  }
  if (response.status < 200 || response.status >= 300) {
    throw new DivulgaCandError(
      'HTTP_ERROR',
      `DivulgaCandContas respondeu HTTP ${response.status} para ${url}`,
    )
  }
  if (response.body === null) {
    throw new DivulgaCandError('HTTP_ERROR', `Resposta sem corpo para ${url}`)
  }
  return Buffer.from(response.body, 'base64')
}

async function launchChrome(): Promise<Browser> {
  // `channel: 'chrome'` usa o Chrome instalado na máquina. O Chromium que vem
  // com o Playwright é detectado e barrado, então a queda para ele serve só
  // para dar um erro de rede legível em vez de um erro de binário ausente.
  try {
    return await chromium.launch({ headless: false, channel: 'chrome' })
  } catch (error) {
    logger.warn(
      '[divulgacand] Chrome instalado não encontrado; tentando o Chromium do Playwright, que o TSE costuma barrar',
      error instanceof Error ? error.message : error,
    )
    return chromium.launch({ headless: false })
  }
}

export async function createBrowserDivulgaCandHttpPort(
  options: CreateBrowserPortOptions = {},
): Promise<DisposableDivulgaCandHttpPort> {
  const baseUrl = trimBaseUrl(
    options.baseUrl ?? process.env.TSE_DIVULGACAND_URL ?? DIVULGACAND_BASE_URL,
  )
  const timeoutMs = options.timeoutMs ?? 60_000
  const origin = new URL(baseUrl).origin

  const browser = await launchChrome()
  let page: Page
  try {
    page = await (await browser.newContext({ locale: 'pt-BR' })).newPage()
    await page.goto(`${baseUrl}/divulga/`, {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs,
    })
  } catch (error) {
    await browser.close()
    throw new DivulgaCandError(
      'HTTP_ERROR',
      `Não foi possível abrir a sessão do DivulgaCandContas em ${baseUrl}`,
      { cause: error },
    )
  }
  logger.info('[divulgacand] Sessão pelo browser aberta', { baseUrl })

  async function request(url: string): Promise<Buffer> {
    if (new URL(url).origin !== origin) {
      // Um fetch para outra origem não herda a sessão e morre no CORS; melhor
      // dizer isso do que devolver um erro de rede opaco.
      throw new DivulgaCandError(
        'HTTP_ERROR',
        `A porta pelo browser só atende a origem ${origin}; recebeu ${url}`,
      )
    }
    const response = await page.evaluate(
      async ({ target, timeout }): Promise<BrowserHttpResponse> => {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), timeout)
        try {
          const result = await fetch(target, { signal: controller.signal })
          if (!result.ok) return { status: result.status, body: null }
          const bytes = new Uint8Array(await result.arrayBuffer())
          let binary = ''
          const chunk = 0x8000
          for (let index = 0; index < bytes.length; index += chunk) {
            binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
          }
          return { status: result.status, body: btoa(binary) }
        } finally {
          clearTimeout(timer)
        }
      },
      { target: url, timeout: timeoutMs },
    )
    return decodeBrowserResponse(url, response)
  }

  return {
    async getJson<T>(url: string): Promise<T> {
      return JSON.parse((await request(url)).toString('utf8')) as T
    },
    async getBytes(url: string): Promise<Buffer> {
      return request(url)
    },
    async dispose(): Promise<void> {
      await browser.close()
      logger.info('[divulgacand] Sessão pelo browser encerrada')
    },
  }
}
