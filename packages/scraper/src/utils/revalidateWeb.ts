import { logger } from './logger'

const CORE_PATHS = ['/', '/sitemap.xml', '/candidatos-presidente']
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function buildRevalidationBatches(
  slugs: string[],
  maximumPaths = 50,
): string[][] {
  if (slugs.length === 0) return []
  if (!Number.isInteger(maximumPaths) || maximumPaths < CORE_PATHS.length) {
    throw new Error('maximumPaths must accommodate the core SEO paths')
  }

  const paths = [
    ...CORE_PATHS,
    ...[...new Set(slugs)]
      .filter((slug) => SAFE_SLUG.test(slug))
      .map((slug) => `/candidatos/${slug}`),
  ]
  const batches: string[][] = []
  for (let index = 0; index < paths.length; index += maximumPaths) {
    batches.push(paths.slice(index, index + maximumPaths))
  }
  return batches
}

export async function revalidateCandidatePages(slugs: string[]): Promise<void> {
  const endpoint = process.env.WEB_REVALIDATION_URL
  const token = process.env.REVALIDATION_SECRET
  if (!endpoint || !token || slugs.length === 0) return

  const batches = buildRevalidationBatches(slugs)
  let revalidatedPaths = 0

  for (const paths of batches) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ paths }),
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) {
        logger.warn(`[revalidate] Web respondeu HTTP ${response.status}`)
        continue
      }
      revalidatedPaths += paths.length
    } catch (error) {
      logger.warn(
        '[revalidate] Falha ao avisar o frontend; o ISR por tempo permanece ativo',
        error instanceof Error ? error.message : error,
      )
    }
  }

  if (revalidatedPaths > 0) {
    logger.info(`[revalidate] ${revalidatedPaths} rotas enviadas para revalidação`)
  }
}
