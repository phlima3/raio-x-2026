export {}

const siteOrigin = (process.env.SEO_SITE_ORIGIN ?? 'https://raio-x-2026.com.br').replace(/\/$/, '')
const apiOrigin = (process.env.SEO_API_ORIGIN ?? 'https://api.raio-x-2026.com.br').replace(/\/$/, '')
const errors: string[] = []

function normalizeUrl(value: string): string {
  const url = new URL(value)
  return url.pathname === '/' && !url.search ? `${url.origin}/` : url.toString()
}

function canonicalFrom(html: string): string | null {
  return (
    html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] ??
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)?.[1] ??
    null
  )
}

function robotsFrom(html: string): string | null {
  return (
    html.match(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']robots["']/i)?.[1] ??
    null
  )
}

async function fetchText(
  url: string,
  init?: RequestInit,
): Promise<{ response: Response; text: string }> {
  const response = await fetch(url, init)
  return { response, text: await response.text() }
}

async function auditIndexableUrl(url: string): Promise<void> {
  try {
    const { response, text } = await fetchText(url, { redirect: 'manual' })
    if (response.status !== 200) errors.push(`${url}: HTTP ${response.status}`)
    const canonical = canonicalFrom(text)
    if (!canonical || normalizeUrl(canonical) !== normalizeUrl(url)) {
      errors.push(`${url}: canonical divergente (${canonical ?? 'ausente'})`)
    }
    if (/noindex/i.test(robotsFrom(text) ?? '')) errors.push(`${url}: noindex no sitemap`)
    if (/localhost/i.test(text)) errors.push(`${url}: contém localhost`)
    if (/(?:src|content)=["']http:\/\//i.test(text)) errors.push(`${url}: contém mídia HTTP`)
    if (url.includes('/candidatos/') && !/<script[^>]+application\/ld\+json/i.test(text)) {
      errors.push(`${url}: JSON-LD ausente`)
    }
  } catch (error) {
    errors.push(`${url}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function main(): Promise<void> {
  const [robots, sitemap, search, comparison, ogImage] = await Promise.all([
    fetchText(`${siteOrigin}/robots.txt`),
    fetchText(`${siteOrigin}/sitemap.xml`),
    fetchText(`${siteOrigin}/busca?q=auditoria`),
    fetchText(`${siteOrigin}/comparar?a=um&b=dois&topic=economia`),
    fetch(`${siteOrigin}/opengraph-image`),
  ])

  if (robots.response.status !== 200 || !robots.text.includes(`${siteOrigin}/sitemap.xml`)) {
    errors.push('robots.txt ausente ou sem sitemap canônico')
  }
  if (sitemap.response.status !== 200) errors.push(`sitemap.xml: HTTP ${sitemap.response.status}`)

  const urls = [...sitemap.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1])
  if (urls.length !== new Set(urls).size) errors.push('sitemap.xml contém URLs duplicadas')
  if (urls.some((url) => url.includes('?') || url.includes('/busca'))) {
    errors.push('sitemap.xml contém busca ou parâmetros')
  }
  if (urls.some((url) => !url.startsWith(`${siteOrigin}/`))) {
    errors.push('sitemap.xml contém origem não canônica')
  }

  if (!/noindex/i.test(robotsFrom(search.text) ?? '')) errors.push('/busca parametrizada sem noindex')
  if (canonicalFrom(search.text) !== `${siteOrigin}/busca`) errors.push('/busca com canonical incorreta')
  if (!/noindex/i.test(robotsFrom(comparison.text) ?? '')) {
    errors.push('/comparar parametrizado sem noindex')
  }
  if (canonicalFrom(comparison.text) !== `${siteOrigin}/comparar`) {
    errors.push('/comparar parametrizado com canonical incorreta')
  }
  if (ogImage.status !== 200 || ogImage.headers.get('content-type') !== 'image/png') {
    errors.push('/opengraph-image não respondeu image/png')
  }

  for (let index = 0; index < urls.length; index += 5) {
    await Promise.all(urls.slice(index, index + 5).map(auditIndexableUrl))
  }

  const reportResponse = await fetch(`${apiOrigin}/api/candidates/seo-report`).catch(() => null)
  if (reportResponse?.ok) {
    const report = (await reportResponse.json()) as {
      data: Array<{ slug: string; indexable: boolean }>
    }
    const expected = new Set(
      report.data
        .filter((candidate) => candidate.indexable)
        .map((candidate) => `${siteOrigin}/candidatos/${candidate.slug}`),
    )
    const actual = new Set(urls.filter((url) => url.includes('/candidatos/')))
    for (const url of expected) if (!actual.has(url)) errors.push(`${url}: qualificada e ausente do sitemap`)
    for (const url of actual) if (!expected.has(url)) errors.push(`${url}: no sitemap sem passar pelo gate`)
  } else {
    errors.push('API de quality report indisponível')
  }

  const redirectChecks = [
    `https://www.raio-x-2026.com.br/eleicoes-2026`,
    `http://raio-x-2026.com.br/eleicoes-2026`,
  ]
  for (const url of redirectChecks) {
    const response = await fetch(url, { redirect: 'manual' }).catch(() => null)
    if (!response || ![301, 308].includes(response.status)) {
      errors.push(`${url}: não redirecionou permanentemente`)
      continue
    }
    if (response.headers.get('location') !== `${siteOrigin}/eleicoes-2026`) {
      errors.push(`${url}: redireciona para destino inesperado`)
    }
  }

  console.info(`Auditadas ${urls.length} URLs do sitemap.`)
  if (errors.length > 0) {
    console.error(`\n${errors.length} falha(s):`)
    for (const error of errors) console.error(`- ${error}`)
    process.exitCode = 1
  } else {
    console.info('SEO audit: OK')
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 1
})
