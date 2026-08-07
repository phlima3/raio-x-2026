export {}

const apiOrigin = (process.env.SEO_API_ORIGIN ?? 'https://api.raio-x-2026.com.br').replace(/\/$/, '')
const strict = process.argv.includes('--strict')

interface ReportItem {
  slug: string
  name: string
  position: string
  candidacyStatus: string | null
  indexable: boolean
  substantiveModules: string[]
  blockers: string[]
  warnings: string[]
}

async function main() {
  const response = await fetch(`${apiOrigin}/api/candidates/seo-report`)
  if (!response.ok) throw new Error(`Quality report respondeu HTTP ${response.status}`)
  const payload = (await response.json()) as { data: ReportItem[] }

  console.table(
    payload.data.map((candidate) => ({
      candidato: candidate.name,
      cargo: candidate.position,
      status: candidate.candidacyStatus ?? 'ausente',
      indexavel: candidate.indexable ? 'sim' : 'não',
      modulos: candidate.substantiveModules.length,
      bloqueios: candidate.blockers.join(', ') || '—',
      alertas: candidate.warnings.join(', ') || '—',
      slug: candidate.slug,
    })),
  )

  const indexable = payload.data.filter((candidate) => candidate.indexable).length
  console.info(`\nResumo: ${indexable}/${payload.data.length} perfis indexáveis.`)

  const blockerCounts = new Map<string, number>()
  for (const candidate of payload.data) {
    for (const blocker of candidate.blockers) {
      blockerCounts.set(blocker, (blockerCounts.get(blocker) ?? 0) + 1)
    }
  }
  if (blockerCounts.size > 0) {
    console.info('\nBloqueios por frequência:')
    console.table(
      [...blockerCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([bloqueio, perfis]) => ({ bloqueio, perfis })),
    )
  }

  if (strict && indexable !== payload.data.length) process.exitCode = 1
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
