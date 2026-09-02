import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { unzipSync } from 'fflate'

import { createScraperPrismaClient } from '../utils/prisma'
import { createTseCkanClient, TseResourceKind } from '../sources/tse/ckanClient'
import { invalidateApiCandidateCaches } from '../utils/invalidateApiCache'
import { parsePositionsArg } from './extractProgramProposals'
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
/**
 * Credito da foto de urna. O TSE publica estas imagens no portal de dados
 * abertos, e e ele que as divulga; o credito nomeia a fonte, sem afirmar
 * licenca que o portal nao declara.
 */
const PHOTO_CREDIT = 'Foto de urna - Tribunal Superior Eleitoral, dados abertos'

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
  const positions = parsePositionsArg()
  const prisma = createScraperPrismaClient()
  const client = createTseCkanClient()

  try {
    // O pacote de uma UF traz a eleição inteira — em SP são ~2.500 fotos, quase
    // todas de deputado. Uma consulta por entrada é o que fazia a rodada passar
    // de dez minutos contra o túnel; o mapa é a mesma prefetch que o sync de
    // documentos já usa. `--position` corta o que vai para o disco: sem ele, o
    // `public/` do site ganha milhares de imagens de candidatura que nenhuma
    // página renderiza.
    const byTseId = new Map(
      (await prisma.candidate.findMany({
        where: {
          tseId: { not: null },
          ...(positions ? { position: { in: positions } } : {}),
        },
        select: {
          id: true, tseId: true, photoUrl: true,
          photoSourceUrl: true, photoLicense: true,
        },
      })).flatMap((c) => c.tseId ? [[c.tseId, c] as const] : []),
    )
    logger.info('[tse:photos] candidaturas elegíveis', {
      total: byTseId.size,
      cargos: positions ?? 'todos',
    })

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

        const candidate = byTseId.get(tseId)
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
          // A procedencia e gravada junto com o arquivo: o pacote de onde a
          // foto saiu e o credito de quem a publicou. Sem isso a ficha exibe
          // uma foto sem dizer de onde veio, e o gate -- com razao -- segura a
          // pagina. E dado que o job ja tem em maos; deixa-lo de fora e que
          // era a omissao.
          if (
            candidate.photoUrl !== photoUrl ||
            candidate.photoSourceUrl !== resource.url ||
            candidate.photoLicense !== PHOTO_CREDIT
          ) {
            await prisma.candidate.update({
              where: { id: candidate.id },
              data: {
                photoUrl,
                photoSourceUrl: resource.url,
                photoLicense: PHOTO_CREDIT,
                materialUpdatedAt: new Date(),
              },
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
