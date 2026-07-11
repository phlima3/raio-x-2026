import axios from 'axios'
import { getBrowser } from '../utils/playwright'
import { htmlToText } from '../processors/proposalExtractor'
import { logger } from '../utils/logger'
import type { PresidentialNewsSource } from '../data/presidentialSources'

// Portais de notícia (JOTA, G1, Folha) bloqueiam user agents de bot —
// para leitura de artigos públicos usamos um UA de navegador comum.
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const MAX_TEXT_LENGTH = 40_000

export interface FetchedArticle {
  source: PresidentialNewsSource
  text: string
}

/**
 * Baixa uma página de notícia e devolve o texto limpo do conteúdo principal.
 * Retorna null em caso de falha — nunca lança.
 */
export async function fetchArticleText(
  source: PresidentialNewsSource,
): Promise<FetchedArticle | null> {
  const html = source.requiresBrowser
    ? await fetchWithBrowser(source.url)
    : (await fetchWithHttp(source.url)) ?? (await fetchWithBrowser(source.url))

  if (!html) {
    logger.warn(`[presidential-news] Could not fetch ${source.id} (${source.url})`)
    return null
  }

  const text = htmlToText(extractMainContent(html)).slice(0, MAX_TEXT_LENGTH)
  if (text.length < 200) {
    logger.warn(`[presidential-news] ${source.id}: extracted text too short (${text.length} chars)`)
    return null
  }

  logger.info(`[presidential-news] ${source.id}: fetched ${text.length} chars`)
  return { source, text }
}

/** Busca todas as fontes em sequência (respeitando um delay educado). */
export async function fetchAllSources(
  sources: PresidentialNewsSource[],
): Promise<FetchedArticle[]> {
  const articles: FetchedArticle[] = []

  for (const source of sources) {
    const article = await fetchArticleText(source)
    if (article) articles.push(article)
    await new Promise((resolve) => setTimeout(resolve, 2_000))
  }

  return articles
}

// ── Fetch strategies ──────────────────────────────────────────────────────────

async function fetchWithHttp(url: string): Promise<string | null> {
  try {
    const res = await axios.get<string>(url, {
      timeout: 20_000,
      responseType: 'text',
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept-Language': 'pt-BR,pt;q=0.9',
        Accept: 'text/html,application/xhtml+xml',
      },
      maxRedirects: 5,
    })
    return typeof res.data === 'string' ? res.data : null
  } catch (err) {
    logger.warn(
      `[presidential-news] HTTP fetch failed for ${url}: ${err instanceof Error ? err.message : err}`,
    )
    return null
  }
}

async function fetchWithBrowser(url: string): Promise<string | null> {
  try {
    const browser = await getBrowser()
    const context = await browser.newContext({
      userAgent: BROWSER_UA,
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
      viewport: { width: 1366, height: 768 },
    })

    try {
      const page = await context.newPage()
      await page.route('**/*.{png,jpg,jpeg,gif,webp,woff,woff2,ttf,mp4}', (route) =>
        route.abort(),
      )

      const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
      if (!res || res.status() >= 400) {
        logger.warn(`[presidential-news] HTTP ${res?.status() ?? '?'} on ${url}`)
        return null
      }

      // Aguarda hidratação de conteúdo dinâmico (paywalls soft, lazy content)
      await page.waitForTimeout(2_500)

      return await page.content()
    } finally {
      await context.close()
    }
  } catch (err) {
    logger.warn(
      `[presidential-news] Browser fetch failed for ${url}: ${err instanceof Error ? err.message : err}`,
    )
    return null
  }
}

// ── Content extraction ────────────────────────────────────────────────────────

/**
 * Recorta o conteúdo principal do HTML bruto (article/main), removendo
 * script/style/nav antes da conversão para texto.
 */
export function extractMainContent(html: string): string {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<(header|footer|nav|aside)[\s\S]*?<\/\1>/gi, '')

  for (const tag of ['article', 'main']) {
    const match = cleaned.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
    // Ignora matches minúsculos (ex: <article> de card de destaque)
    if (match && match[1].length > 1_000) return match[1]
  }

  const body = cleaned.match(/<body[^>]*>([\s\S]*)<\/body>/i)
  return body ? body[1] : cleaned
}
