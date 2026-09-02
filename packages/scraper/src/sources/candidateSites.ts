import { createScraperPrismaClient } from '../utils/prisma'
import 'dotenv/config'
import { Position } from '@prisma/client'
import { withPage } from '../utils/playwright'
import { navigateForContent, sameSiteHttpUrl } from '../utils/siteNavigation'
import { processProposalsFromSite } from '../processors/proposalExtractor'
import { logger } from '../utils/logger'

const prisma = createScraperPrismaClient()

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CandidateSiteConfig {
  candidateId: string
  candidateName: string
  siteUrl: string
  /** Relative path to the proposals/program page. If null, auto-detect. */
  proposalsPath?: string
}

interface ScrapeResult {
  config: CandidateSiteConfig
  proposalsSaved: number
  error?: string
}

export interface CandidateSiteSyncMetrics {
  sites: number
  succeeded: number
  failed: number
  proposals: number
}

// ── Common proposal page paths ────────────────────────────────────────────────

const PROPOSAL_PATH_CANDIDATES = [
  '/propostas',
  '/programa',
  '/plataforma',
  '/ideias',
  '/programa-de-governo',
  '/propostas-de-governo',
  '/compromisos',
  '/projetos',
]

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

// ── Core scraping function ────────────────────────────────────────────────────

/**
 * Scrapes proposals from a candidate's website.
 * Returns the number of proposals saved to the DB.
 */
export async function scrapeCandidateSite(
  config: CandidateSiteConfig,
): Promise<number> {
  const targetUrl = config.proposalsPath
    ? new URL(config.proposalsPath, config.siteUrl).toString()
    : config.siteUrl

  logger.info(`[sites] Scraping ${targetUrl} for ${config.candidateName}`)

  return withPage(async (page) => {
    await navigateForContent(page, targetUrl)

      // If no explicit proposalsPath, try to find the proposals sub-page
    if (!config.proposalsPath) {
      const detected = await detectProposalsLink(page)
      // O href vem do DOM do site do candidato, que nao e confiavel: so segue
      // se apontar para o proprio site. Ver sameSiteHttpUrl.
      const safeDetected = detected ? sameSiteHttpUrl(detected, config.siteUrl) : null
      if (detected && !safeDetected) {
        logger.warn(
          `[sites] Ignoring off-site proposals link ${detected} for ${config.candidateName}`,
        )
      }
      if (safeDetected && safeDetected !== targetUrl) {
        logger.info(`[sites] Detected proposals page at ${safeDetected}`)
        await navigateForContent(page, safeDetected)
      }
    }

      // Wait briefly for JS-rendered content
    await sleep(1_500)

      // Extract main content — prefer semantic content areas, fall back to body
    const html = await page.evaluate(() => {
        const selectors = [
          'main',
          '[role="main"]',
          'article',
          '.content',
          '.propostas',
          '.programa',
          '.plataforma',
          '#content',
          '#main',
          'body',
        ]
        for (const sel of selectors) {
          const el = document.querySelector(sel)
          if (el) return el.innerHTML
        }
        return document.body.innerHTML
    })

    const pageUrl = page.url()
    const saved = await processProposalsFromSite(
      html,
      pageUrl,
      config.candidateId,
      config.candidateName,
    )

    return saved
  })
}

/**
 * Finds the most likely proposals page link on the candidate's homepage.
 * Returns the full URL or null if not found.
 */
export async function detectProposalsPage(siteUrl: string): Promise<string | null> {
  return withPage(async (page) => {
    try {
      await navigateForContent(page, siteUrl, { navigationTimeoutMs: 20_000 })

      // Look for links matching common proposal path patterns
      const found = await page.evaluate((paths) => {
        const anchors = Array.from(document.querySelectorAll('a[href]'))
        for (const anchor of anchors) {
          const href = (anchor as HTMLAnchorElement).href.toLowerCase()
          for (const path of paths) {
            if (href.includes(path)) return (anchor as HTMLAnchorElement).href
          }
        }
        return null
      }, PROPOSAL_PATH_CANDIDATES)

      return found
    } catch {
      return null
    }
  })
}

// ── Batch sync ────────────────────────────────────────────────────────────────

/**
 * Processes candidate sites in batches, respecting concurrency limits.
 * Skips candidates whose sites were scraped in the last 6 days.
 */
export async function syncCandidateSites(
  configs: CandidateSiteConfig[],
): Promise<CandidateSiteSyncMetrics> {
  logger.info(`[sites] Starting sync for ${configs.length} candidate sites`)

  const concurrency = Math.max(1, Number(process.env.SCRAPER_CONCURRENCY) || 2)
  const results: ScrapeResult[] = []

  for (let i = 0; i < configs.length; i += concurrency) {
    const batch = configs.slice(i, i + concurrency)

    const batchResults = await Promise.all(
      batch.map(async (config) => {
        try {
          const proposalsSaved = await scrapeCandidateSite(config)
          return { config, proposalsSaved }
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err)
          logger.error(`[sites] ✗ ${config.candidateName}: ${error}`)
          return { config, proposalsSaved: 0, error }
        }
      }),
    )

    results.push(...batchResults)

    // Polite delay between batches to avoid overloading sites
    if (i + concurrency < configs.length) await sleep(3_000)
  }

  const ok = results.filter((r) => !r.error).length
  const failed = results.filter((r) => r.error).length
  const totalSaved = results.reduce((sum, r) => sum + r.proposalsSaved, 0)

  logger.info(
    `[sites] Sync complete — ${ok} ok, ${failed} failed, ${totalSaved} proposals saved`,
  )
  if (failed > 0) throw new Error(`[sites] ${failed} of ${configs.length} candidate sites failed`)
  return { sites: configs.length, succeeded: ok, failed, proposals: totalSaved }
}

// ── Load configs from DB ──────────────────────────────────────────────────────

/**
 * Loads candidate site configs from the database.
 * Only includes candidates that have a siteUrl configured.
 */
export async function loadCandidateSiteConfigs(): Promise<CandidateSiteConfig[]> {
  const candidates = await prisma.candidate.findMany({
    where: {
      siteUrl: { not: null },
      isPublished: true,
      position: { in: [Position.PRESIDENTE, Position.GOVERNADOR, Position.SENADOR] },
    },
    select: { id: true, name: true, siteUrl: true },
  })

  return candidates
    .filter((c): c is typeof c & { siteUrl: string } => c.siteUrl !== null)
    .map((c) => ({
      candidateId: c.id,
      candidateName: c.name,
      siteUrl: c.siteUrl,
    }))
}

// ── Helper for detecting proposals link from inside a page ───────────────────

async function detectProposalsLink(
  page: import('playwright').Page,
): Promise<string | null> {
  try {
    const found = await page.evaluate((paths) => {
      const anchors = Array.from(document.querySelectorAll('a[href]'))
      for (const anchor of anchors) {
        const href = (anchor as HTMLAnchorElement).href.toLowerCase()
        for (const path of paths) {
          if (href.includes(path)) return (anchor as HTMLAnchorElement).href
        }
      }
      return null
    }, PROPOSAL_PATH_CANDIDATES)

    return found
  } catch {
    return null
  }
}

// ── Manual run entry point ────────────────────────────────────────────────────

if (require.main === module) {
  ;(async () => {
    const configs = await loadCandidateSiteConfigs()
    if (configs.length === 0) {
      logger.warn('[sites] No published candidates with siteUrl found; nothing to enrich.')
      process.exit(0)
    }
    await syncCandidateSites(configs)
    await prisma.$disconnect()
  })()
}
