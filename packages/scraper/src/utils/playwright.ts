import { chromium, Browser, BrowserContext, Page } from 'playwright'
import { logger } from './logger'

// TODO: Add proxy rotation support for scraping candidate sites at scale
// TODO: Add stealth mode plugin to avoid bot detection
// TODO: Implement screenshot capture for debugging failed scrapes

let browser: Browser | null = null
let browserPromise: Promise<Browser> | null = null

export async function getBrowser(): Promise<Browser> {
  if (browser?.isConnected()) return browser
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: process.env.SCRAPER_HEADLESS !== 'false',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    }).then((launched) => {
      browser = launched
      logger.info('Playwright browser launched')
      return launched
    }).finally(() => {
      browserPromise = null
    })
  }
  return browserPromise
}

export async function createContext(): Promise<BrowserContext> {
  const b = await getBrowser()
  return b.newContext({
    // Candidate sites are public/untrusted enrichment only; accepting a stale
    // certificate never grants access to authenticated or privileged content.
    ignoreHTTPSErrors: true,
    userAgent:
      'Mozilla/5.0 (compatible; RaioX2026Bot/1.0; +https://raiox2026.com.br/bot)',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    // TODO: Set viewport for consistent layout rendering
  })
}

export async function newPage(): Promise<Page> {
  const ctx = await createContext()
  const page = await ctx.newPage()

  // Block images and fonts to speed up scraping
  await page.route('**/*.{png,jpg,jpeg,gif,webp,woff,woff2,ttf}', (route) => route.abort())

  return page
}

export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    try {
      await browserPromise
    } catch {
      // A failed launch has no browser process to close.
    }
  }
  if (browser) {
    await browser.close()
    browser = null
    logger.info('Playwright browser closed')
  }
}

export async function withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
  const page = await newPage()
  try {
    return await fn(page)
  } finally {
    await page.context().close()
  }
}
