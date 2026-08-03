import type { Page, Response } from 'playwright'

import { logger } from './logger'

type NavigationPage = Pick<Page, 'goto' | 'waitForLoadState'>

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
          `[sites] DOMContentLoaded did not settle for ${url}; using committed HTML`,
          error,
        )
      }
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
