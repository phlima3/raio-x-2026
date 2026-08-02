import 'dotenv/config'
import { createHash } from 'node:crypto'
import {
  DataSource,
  DocumentExtractionStatus,
  Prisma,
  PrismaClient,
  SourceDocumentType,
} from '@prisma/client'
import { unzipSync } from 'fflate'

import { extractPdfText } from '../documents/pdfText'
import {
  createPrismaSyncRunStore,
  runDataSourceSync,
  type CompletedSyncRun,
} from '../sync/runDataSourceSync'
import { logger } from '../utils/logger'
import {
  createTseCkanClient,
  TseResourceKind,
  type TseCkanClient,
  type TseResource,
} from './tse/ckanClient'

interface PdfEntry {
  filename: string
  bytes: Buffer
  sourceUrl: string
  resource: TseResource
  fetchedAt: Date
}

type PdfTextExtractor = (bytes: Buffer) => Promise<string>

export interface RunTseDocumentSyncOptions {
  prisma: PrismaClient
  client?: TseCkanClient
  year?: number
  dryRun?: boolean
  extractText?: PdfTextExtractor
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function looksLikePdf(bytes: Buffer): boolean {
  return bytes.subarray(0, 5).toString('ascii') === '%PDF-'
}

function looksLikeZip(bytes: Buffer): boolean {
  const signature = bytes.subarray(0, 4).toString('hex')
  return signature === '504b0304' || signature === '504b0506' || signature === '504b0708'
}

function pdfEntries(
  resource: TseResource,
  bytes: Buffer,
  fetchedAt: Date,
): PdfEntry[] {
  const format = resource.format.trim().toUpperCase()
  if (format === 'PDF' || looksLikePdf(bytes)) {
    return [{
      filename: resource.name || resource.url.split('/').pop() || 'document.pdf',
      bytes,
      sourceUrl: resource.url,
      resource,
      fetchedAt,
    }]
  }
  if (format !== 'ZIP' && !looksLikeZip(bytes)) return []

  const archive = unzipSync(new Uint8Array(bytes))
  return Object.entries(archive).flatMap(([filename, content]) => {
    if (!filename.toLowerCase().endsWith('.pdf')) return []
    return [{
      filename,
      bytes: Buffer.from(content),
      sourceUrl: `${resource.url}#entry=${encodeURIComponent(filename)}`,
      resource,
      fetchedAt,
    }]
  })
}

function linkedCandidateId(
  filename: string,
  candidates: Array<{ id: string; tseId: string | null }>,
): string | null {
  const matches = candidates.filter(
    (candidate) => candidate.tseId && filename.includes(candidate.tseId),
  )
  return matches.length === 1 ? matches[0].id : null
}

export async function runTseDocumentSync(
  options: RunTseDocumentSyncOptions,
): Promise<CompletedSyncRun> {
  const year = options.year ?? 2026
  const client = options.client ?? createTseCkanClient()
  const extractText = options.extractText ?? extractPdfText

  return runDataSourceSync({
    source: DataSource.TSE,
    kind: 'official-documents',
    sourceUrl: `https://dadosabertos.tse.jus.br/dataset/candidatos-${year}`,
    dryRun: options.dryRun,
    store: createPrismaSyncRunStore(options.prisma),
    execute: async ({ runId }) => {
      const resources = (await client.discover(year)).filter(
        (resource) => resource.kind === TseResourceKind.CAMPAIGN_PROGRAMS,
      )
      if (resources.length === 0) {
        return {
          noop: true,
          metrics: {
            resources: 0,
            documents: 0,
            created: 0,
            deduplicated: 0,
            extracted: 0,
            needsOcr: 0,
            failed: 0,
          },
        }
      }

      const entries: PdfEntry[] = []
      for (const resource of resources) {
        const downloaded = await client.download(resource)
        entries.push(...pdfEntries(resource, downloaded.bytes, downloaded.fetchedAt))
      }
      if (entries.length === 0) {
        return {
          noop: true,
          metrics: {
            resources: resources.length,
            documents: 0,
            created: 0,
            deduplicated: 0,
            extracted: 0,
            needsOcr: 0,
            failed: 0,
          },
        }
      }

      const candidates = await options.prisma.candidate.findMany({
        where: { tseId: { not: null } },
        select: { id: true, tseId: true },
      })
      let created = 0
      let deduplicated = 0
      let extracted = 0
      let needsOcr = 0
      let failed = 0

      for (const entry of entries) {
        const digest = sha256(entry.bytes)
        const existing = await options.prisma.sourceDocument.findUnique({
          where: { sha256: digest },
        })
        if (existing && existing.extractionStatus !== DocumentExtractionStatus.FAILED) {
          deduplicated++
          if (!options.dryRun) {
            await options.prisma.sourceDocument.update({
              where: { id: existing.id },
              data: { fetchedAt: entry.fetchedAt, sourceUrl: entry.sourceUrl, syncRunId: runId },
            })
          }
          continue
        }

        let text: string | null = null
        let status: DocumentExtractionStatus
        let extractionError: string | null = null
        try {
          const extractedText = (await extractText(entry.bytes)).trim()
          if (extractedText.length === 0) {
            status = DocumentExtractionStatus.NEEDS_OCR
            needsOcr++
          } else {
            text = extractedText
            status = DocumentExtractionStatus.EXTRACTED
            extracted++
          }
        } catch (error) {
          status = DocumentExtractionStatus.FAILED
          extractionError = error instanceof Error ? error.message : String(error)
          failed++
        }

        if (!options.dryRun) {
          const documentData = {
            source: DataSource.TSE,
            type: SourceDocumentType.CAMPAIGN_PROGRAM,
            sourceUrl: entry.sourceUrl,
            contentType: 'application/pdf',
            fetchedAt: entry.fetchedAt,
            text,
            extractionStatus: status,
            extractionError,
            candidateId: linkedCandidateId(entry.filename, candidates),
            syncRunId: runId,
            metadata: {
              resourceId: entry.resource.id,
              resourceName: entry.resource.name,
              filename: entry.filename,
            } satisfies Prisma.InputJsonObject,
          }
          await options.prisma.sourceDocument.upsert({
            where: { sha256: digest },
            update: documentData,
            create: { ...documentData, sha256: digest },
          })
        }
        created++
      }

      if (failed > 0) throw new Error(`[tse-documents] ${failed} PDF extraction(s) failed`)
      return {
        metrics: {
          resources: resources.length,
          documents: entries.length,
          created,
          deduplicated,
          extracted,
          needsOcr,
          failed,
        },
      }
    },
  })
}

export async function syncTseDocuments(
  year = 2026,
  dryRun = false,
): Promise<CompletedSyncRun> {
  const prisma = new PrismaClient()
  try {
    logger.info(`[tse-documents] Starting official document sync for ${year}`)
    const result = await runTseDocumentSync({ prisma, year, dryRun })
    logger.info('[tse-documents] Official document sync complete', result)
    return result
  } finally {
    await prisma.$disconnect()
  }
}

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run')
  const yearArg = process.argv.find((argument) => /^--year=\d{4}$/.test(argument))
  const year = yearArg ? Number(yearArg.split('=')[1]) : 2026
  syncTseDocuments(year, dryRun).catch((error) => {
    logger.error('[tse-documents] Fatal error', error)
    process.exit(1)
  })
}
