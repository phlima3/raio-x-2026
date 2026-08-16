import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { unzipSync } from 'fflate'

import { createScraperPrismaClient } from '../utils/prisma'
import { createTseCkanClient, TseResourceKind } from '../sources/tse/ckanClient'
import { invalidateApiCandidateCaches } from '../utils/invalidateApiCache'
import { logger } from '../utils/logger'

/**
 * As fotos oficiais das candidaturas são publicadas no mesmo dataset do TSE,
 * num recurso por unidade eleitoral (`foto_cand2026_BR_div.zip`), e não em uma
 * URL por candidato — o CDN só serve o pacote. Cada entrada se chama
 * `F{UF}{SQ_CANDIDATO}_div.jpg`, então a chave é o `tseId` que já guardamos.
 *
 * Os arquivos são gravados no `public/` do site, a mesma convenção das fotos
 * do catálogo editorial, e a candidatura passa a apontar para o caminho local.
 * Uma foto curada à mão nunca é sobrescrita: ela costuma ter resolução melhor
 * que os 161x225 da foto de urna.
 */
const PHOTO_ENTRY = /^F([A-Z]{2})(\d+)_div\.jpe?g$/i
const PUBLIC_DIR = join(
  process.cwd(),
  process.cwd().endsWith('scraper') ? '../..' : '.',
  'packages/web/public/images/candidates/tse',
)

function parseUnits(): string[] {
  const flag = process.argv.find((argument) => argument.startsWith('--units='))
  const raw = flag?.split('=')[1] ?? 'BR'
  return raw.split(',').map((unit) => unit.trim().toUpperCase()).filter(Boolean)
}

export async function syncTseCandidatePhotos(): Promise<void> {
  const units = new Set(parseUnits())
  const dryRun = process.argv.includes('--dry-run')
  const prisma = createScraperPrismaClient()
  const client = createTseCkanClient()

  try {
    const resources = (await client.discover(2026)).filter(
      (resource) => resource.kind === TseResourceKind.PHOTOS &&
        units.has(resource.name.slice(0, 2).toUpperCase()),
    )
    if (resources.length === 0) {
      logger.warn('[tse:photos] nenhum recurso de foto encontrado', { units: [...units] })
      return
    }

    if (!dryRun) mkdirSync(PUBLIC_DIR, { recursive: true })

    let written = 0
    let linked = 0
    let skipped = 0
    for (const resource of resources) {
      const downloaded = await client.download(resource)
      const files = unzipSync(new Uint8Array(downloaded.bytes))

      for (const [entry, bytes] of Object.entries(files)) {
        const match = PHOTO_ENTRY.exec(entry.split('/').pop() ?? '')
        if (!match) continue
        const tseId = match[2]

        const candidate = await prisma.candidate.findUnique({
          where: { tseId },
          select: { id: true, photoUrl: true },
        })
        if (!candidate) continue

        // Só a foto de urna vive em `images/candidates/tse`; qualquer outro
        // valor foi curado e tem precedência.
        const curated = candidate.photoUrl != null &&
          !candidate.photoUrl.startsWith('/images/candidates/tse/')
        if (curated) { skipped++; continue }

        const photoUrl = `/images/candidates/tse/${tseId}.jpg`
        if (!dryRun) {
          writeFileSync(join(PUBLIC_DIR, `${tseId}.jpg`), Buffer.from(bytes))
          written++
          if (candidate.photoUrl !== photoUrl) {
            await prisma.candidate.update({
              where: { id: candidate.id },
              data: { photoUrl, materialUpdatedAt: new Date() },
            })
            linked++
          }
        } else {
          written++
        }
      }
    }

    logger.info('[tse:photos] concluído', {
      recursos: resources.length,
      arquivos: written,
      vinculadas: linked,
      preservadas: skipped,
      dryRun,
    })
    if (!dryRun && linked > 0) await invalidateApiCandidateCaches()
  } finally {
    await prisma.$disconnect()
  }
}

if (require.main === module) {
  syncTseCandidatePhotos().catch((error) => {
    logger.error('[tse:photos] falhou', error)
    process.exit(1)
  })
}
