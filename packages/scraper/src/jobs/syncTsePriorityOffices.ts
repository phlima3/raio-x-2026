import { createScraperPrismaClient } from '../utils/prisma'
import { createTseCkanClient, TseResourceKind } from '../sources/tse/ckanClient'
import { parseTseCandidateArchive } from '../sources/tse/candidateArchive'
import { parseTseTabularArchives } from '../sources/tse/tabularArchive'
import { importTseCandidates } from '../sources/tse/importCandidates'

/**
 * Importação dirigida à disputa presidencial. O snapshot completo leva mais do
 * que a vida do túnel; recortar para PRESIDENTE e VICE_PRESIDENTE mantém a
 * mesma lógica de reconciliação e faz a varredura de pré-candidaturas atuar
 * apenas sobre esses cargos, que é exatamente o recorte pretendido.
 */
async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run')
  const year = 2026
  const prisma = createScraperPrismaClient()
  const client = createTseCkanClient()

  try {
    const resources = await client.discover(year)
    const resource = resources.find((r) => r.kind === TseResourceKind.CANDIDATES)
    const complementResource = resources.find(
      (r) => r.kind === TseResourceKind.CANDIDATE_COMPLEMENT,
    )
    if (!resource) throw new Error('recurso de candidaturas ausente')
    if (!complementResource) throw new Error('complemento de julgamento ausente')

    const [downloaded, complementDownload] = await Promise.all([
      client.download(resource),
      client.download(complementResource),
    ])

    const parsed = parseTseCandidateArchive(downloaded.bytes)
    const complementRows = parseTseTabularArchives(complementDownload.bytes)
      .flatMap((file) => file.rows)

    // Governador entra junto porque o seed cadastra Zema, Caiado e Leite nos
    // dois cargos, e `makeSlug(nome, partido, UF)` ignora o cargo: as duas
    // fichas colidem no mesmo slug e a candidatura presidencial fica
    // inalcançável enquanto a ficha estadual seguir publicada.
    const WANTED = new Set(['PRESIDENTE', 'VICE_PRESIDENTE', 'GOVERNADOR', 'VICE_GOVERNADOR'])
    const records = parsed.records.filter((r) => WANTED.has(r.position))
    const byPosition = [...WANTED].map(
      (p) => `${p}=${records.filter((r) => r.position === p).length}`,
    ).join(' ')
    console.info(`[tse:priority] snapshot=${parsed.records.length} recorte=${records.length} ${byPosition}`)
    if (records.length === 0) throw new Error('recorte presidencial vazio — abortando')

    const metrics = await importTseCandidates(prisma, {
      records,
      sourceUrl: resource.url,
      checksum: downloaded.sha256,
      syncedAt: complementDownload.fetchedAt,
      dryRun,
      complementRows,
      complementSourceUrl: complementResource.url,
      requireComplementJudgment: true,
    })
    console.info('[tse:priority] metrics', JSON.stringify(metrics))
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error('[tse:priority] falhou', error)
  process.exit(1)
})
