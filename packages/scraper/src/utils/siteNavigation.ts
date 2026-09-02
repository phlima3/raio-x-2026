import type { Page, Response } from 'playwright'

import { logger } from './logger'

type NavigationPage = Pick<Page, 'goto' | 'waitForLoadState' | 'waitForSelector'>

export interface SiteNavigationOptions {
  attempts?: number
  navigationTimeoutMs?: number
  contentTimeoutMs?: number
  retryDelayMs?: number
}

class HttpStatusError extends Error {
  constructor(
    readonly status: number,
    url: string,
  ) {
    super(`HTTP ${status} on ${url}`)
  }
}

const NAVIGABLE_PROTOCOLS = new Set(['http:', 'https:'])

const bareHost = (hostname: string): string =>
  hostname.toLowerCase().replace(/^www\./, '')

/**
 * O scraper navega para URLs escolhidas por paginas nao confiaveis: a ancora de
 * "propostas" sai do DOM do site do candidato. `page.goto` e dirigido por CDP e
 * aceita `file://` mesmo partindo de um documento http, entao sem essa checagem
 * uma ancora escondida (`<a href="file:///proc/self/environ#/propostas">`) faz o
 * scraper ler arquivos locais do runner e mandar o conteudo para o LLM.
 */
function assertNavigable(url: string): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`URL de navegacao invalida: ${url}`)
  }
  if (!NAVIGABLE_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(`Esquema bloqueado (${parsed.protocol}) em ${url}: so http e https navegam`)
  }
}

/**
 * Restringe um link descoberto no DOM ao proprio site do candidato. A pagina de
 * propostas e do mesmo host por construcao; seguir link para fora nunca foi a
 * intencao, e e exatamente o que da ao dono do site controle sobre host e porta
 * do `goto` — isto e, SSRF contra loopback e link-local do runner.
 *
 * Compara hostname (com `www.` removido) em vez de origin, porque siteUrl vive
 * no banco as vezes em http e o link interno aponta para https.
 *
 * ponytail: nao resolve DNS. Um candidato que aponte o proprio dominio para
 * 127.0.0.1 ainda passa. Fechar isso exige fixar o IP resolvido na conexao, que
 * o Playwright nao expoe; se virar necessario, o caminho e um proxy que resolve
 * e recusa loopback/link-local/RFC1918.
 */
export function sameSiteHttpUrl(candidate: string, base: string): string | null {
  try {
    const url = new URL(candidate)
    if (!NAVIGABLE_PROTOCOLS.has(url.protocol)) return null
    if (bareHost(url.hostname) !== bareHost(new URL(base).hostname)) return null
    return url.toString()
  } catch {
    return null
  }
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Navigates until the server commits a response, then gives the DOM a bounded
 * window to settle. Some government sites keep DOMContentLoaded pending on
 * third-party resources even though their useful HTML is already available.
 */
export async function navigateForContent(
  page: NavigationPage,
  url: string,
  options: SiteNavigationOptions = {},
): Promise<Response> {
  assertNavigable(url)

  const attempts = Math.max(1, options.attempts ?? 2)
  const navigationTimeoutMs = options.navigationTimeoutMs ?? 30_000
  const contentTimeoutMs = options.contentTimeoutMs ?? 15_000
  const retryDelayMs = options.retryDelayMs ?? 1_000
  let lastError: unknown

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await page.goto(url, {
        waitUntil: 'commit',
        timeout: navigationTimeoutMs,
      })
      if (!response) throw new Error(`HTTP unknown on ${url}`)
      if (response.status() >= 400) throw new HttpStatusError(response.status(), url)

      try {
        await page.waitForLoadState('domcontentloaded', { timeout: contentTimeoutMs })
      } catch (error) {
        logger.warn(
          `[sites] DOMContentLoaded did not settle for ${url}; waiting for committed body`,
          error,
        )
      }
      await page.waitForSelector('body', {
        state: 'attached',
        timeout: contentTimeoutMs,
      })
      return response
    } catch (error) {
      if (error instanceof HttpStatusError && error.status < 500) throw error
      lastError = error
      if (attempt < attempts) {
        logger.warn(`[sites] Navigation attempt ${attempt}/${attempts} failed for ${url}; retrying`)
        if (retryDelayMs > 0) await delay(retryDelayMs)
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}
