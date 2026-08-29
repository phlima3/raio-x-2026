import { createScraperPrismaClient } from '../utils/prisma'
import 'dotenv/config'
import {
  DataSource,
  DocumentExtractionStatus,
  Position,
  ProposalOrigin,
  ProposalStatus,
  SourceDocumentType,
  type PrismaClient,
} from '@prisma/client'

import { createProvider, type LLMProvider, type ProposalsByTheme } from '../processors/llm'
import { proposalTitleFromDescription } from '../processors/proposalExtractor'
import {
  createPrismaSyncRunStore,
  runDataSourceSync,
  type CompletedSyncRun,
} from '../sync/runDataSourceSync'
import { logger } from '../utils/logger'

const THEME_LABELS: Record<keyof ProposalsByTheme, string> = {
  economia: 'Economia',
  saude: 'Saúde',
  educacao: 'Educação',
  seguranca: 'Segurança',
  meioambiente: 'Meio Ambiente',
  tecnologia: 'Tecnologia',
  politicaexterna: 'Política Externa',
  outros: 'Outros',
}

export interface RunProgramProposalExtractionOptions {
  prisma: PrismaClient
  provider?: LLMProvider
  dryRun?: boolean
  limit?: number
  slug?: string
  positions?: Position[]
}

interface ExtractedProposal {
  externalId: string
  title: string
  description: string
  category: string
  tags: string[]
}

export function flattenProgramProposals(
  byTheme: ProposalsByTheme,
  documentId: string,
): ExtractedProposal[] {
  return (Object.entries(byTheme) as Array<[keyof ProposalsByTheme, string[]]>)
    .flatMap(([theme, descriptions]) =>
      descriptions.flatMap((raw, index) => {
        const description = raw.trim()
        if (!description) return []
        const category = THEME_LABELS[theme]
        return [{
          // Estável por documento e posição: reprocessar o mesmo PDF atualiza a
          // linha em vez de criar outra.
          externalId: `program_${documentId}_${theme}_${index}`,
          title: proposalTitleFromDescription(category, description),
          description,
          category,
          tags: [theme],
        }]
      }))
}

/**
 * Lê os programas de governo que o TSE publica e grava as propostas que a IA
 * extrai deles.
 *
 * Toda linha nasce `DRAFT` + `isPublished=false` + `origin=AI_EXTRACTION`,
 * porque é saída de modelo sobre documento oficial, não texto conferido. Item
 * já revisado nunca é sobrescrito: uma reextração pula a linha em vez de apagar
 * o trabalho de quem revisou.
 */
/**
 * A que endereço a proposta manda o leitor.
 *
 * Citar o PDF faz o clique virar um arquivo na pasta de downloads, e não uma
 * fonte que a pessoa consiga ler e conferir. O sync do DivulgaCandContas
 * guarda a página pública da candidatura em `metadata.candidatePage`: havendo
 * página, é ela que se cita. O caminho do catálogo não tem equivalente — ali o
 * recurso é o pacote inteiro — e nesse caso resta o `sourceUrl`.
 */
export function programCitationUrl(document: {
  sourceUrl: string | null
  metadata?: unknown
}): string | null {
  const metadata =
    typeof document.metadata === 'object' &&
    document.metadata !== null &&
    !Array.isArray(document.metadata)
      ? (document.metadata as Record<string, unknown>)
      : null
  const page = metadata?.candidatePage
  if (typeof page === 'string' && /^https?:\/\//i.test(page)) return page
  return document.sourceUrl
}

export async function runProgramProposalExtraction(
  options: RunProgramProposalExtractionOptions,
): Promise<CompletedSyncRun> {
  const provider = options.provider ?? createProvider()

  return runDataSourceSync({
    source: DataSource.TSE,
    kind: 'program-proposals',
    sourceUrl: 'https://dadosabertos.tse.jus.br/dataset/candidatos-2026',
    dryRun: options.dryRun,
    store: createPrismaSyncRunStore(options.prisma),
    execute: async () => {
      const documents = await options.prisma.sourceDocument.findMany({
        where: {
          type: SourceDocumentType.CAMPAIGN_PROGRAM,
          extractionStatus: DocumentExtractionStatus.EXTRACTED,
          candidateId: { not: null },
          ...(options.slug
            ? { candidate: { slug: options.slug } }
            : options.positions
              ? { candidate: { position: { in: options.positions } } }
              : {}),
        },
        select: {
          id: true,
          text: true,
          sourceUrl: true,
          metadata: true,
          candidateId: true,
          candidate: { select: { name: true, slug: true } },
        },
        orderBy: { fetchedAt: 'desc' },
        ...(options.limit ? { take: options.limit } : {}),
      })

      let extracted = 0
      let created = 0
      let preserved = 0
      let failed = 0
      let oversized = 0

      for (const document of documents) {
        if (!document.text || !document.candidateId) continue

        // Ler metade de um plano e gravar o resultado como "as propostas do
        // candidato" é pior do que não ler: no banco fica indistinguível de uma
        // extração completa. Documento que não cabe na janela do provider fica
        // para quem tiver janela maior.
        if (document.text.length > provider.inputBudget) {
          oversized++
          logger.warn(
            `[program-proposals] ${document.candidate?.name ?? document.candidateId} ignorado: ` +
              `${document.text.length} caracteres não cabem no orçamento de ${provider.inputBudget}`,
          )
          continue
        }

        let byTheme: ProposalsByTheme
        try {
          byTheme = await provider.extractProposals(document.text)
        } catch (error) {
          failed++
          logger.error(
            `[program-proposals] Extração falhou para ${document.candidate?.name ?? document.candidateId}`,
            error instanceof Error ? error.message : error,
          )
          continue
        }

        const proposals = flattenProgramProposals(byTheme, document.id)
        extracted++
        logger.info(
          `[program-proposals] ${document.candidate?.name ?? document.candidateId}: ` +
            `${proposals.length} propostas de ${document.text.length} caracteres`,
        )
        if (options.dryRun) continue

        for (const proposal of proposals) {
          const existing = await options.prisma.proposal.findUnique({
            where: { externalId: proposal.externalId },
            select: { reviewedAt: true, status: true },
          })
          if (existing?.reviewedAt || (existing && existing.status !== ProposalStatus.DRAFT)) {
            preserved++
            continue
          }

          const data = {
            source: 'tse_program',
            title: proposal.title,
            description: proposal.description,
            category: proposal.category,
            tags: proposal.tags,
            status: ProposalStatus.DRAFT,
            isPublished: false,
            origin: ProposalOrigin.AI_EXTRACTION,
            url: programCitationUrl(document),
            sourceDocumentId: document.id,
            candidateId: document.candidateId,
          }
          await options.prisma.proposal.upsert({
            where: { externalId: proposal.externalId },
            update: data,
            create: { ...data, externalId: proposal.externalId },
          })
          created++
        }
      }

      // Nenhum documento com texto é ausência de trabalho, não sucesso vazio.
      if (documents.length === 0) {
        return {
          noop: true,
          metrics: { documents: 0, extracted: 0, created: 0, preserved: 0, failed: 0, oversized: 0 },
        }
      }
      if (failed > 0 && extracted === 0) {
        throw new Error(`[program-proposals] todas as ${failed} extrações falharam`)
      }
      return {
        metrics: { documents: documents.length, extracted, created, preserved, failed, oversized },
      }
    },
  })
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run')
  const limitArg = process.argv.find((argument) => /^--limit=\d+$/.test(argument))
  const slugArg = process.argv.find((argument) => argument.startsWith('--slug='))
  const positionArg = process.argv.find((argument) => argument.startsWith('--position='))
  const positions = positionArg
    ? positionArg.split('=')[1].split(',').map((value) => {
      const position = Position[value.trim().toUpperCase() as keyof typeof Position]
      if (!position) throw new Error(`Cargo desconhecido: ${value}`)
      return position
    })
    : undefined
  const prisma = createScraperPrismaClient()
  try {
    logger.info('[program-proposals] Extraindo propostas dos programas de governo')
    const result = await runProgramProposalExtraction({
      prisma,
      dryRun,
      limit: limitArg ? Number(limitArg.split('=')[1]) : undefined,
      slug: slugArg ? slugArg.split('=')[1] : undefined,
      positions,
    })
    logger.info('[program-proposals] Concluído', result)
  } finally {
    await prisma.$disconnect()
  }
}

if (require.main === module) {
  main().catch((error) => {
    logger.error('[program-proposals] Erro fatal', error)
    process.exit(1)
  })
}
