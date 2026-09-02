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
  /** Siglas de UF; recorta a rodada a esses estados sem mexer no cargo. */
  state?: string[]
  /** Reprocessa documento que ja rendeu proposta; o padrao e pular. */
  force?: boolean
}

/**
 * O recorte de candidaturas de uma rodada, compartilhado com o
 * `publish:programs` para os dois lados do fluxo aceitarem os mesmos flags.
 *
 * `--slug` é exclusivo: pedir uma ficha específica e ainda filtrar por cargo ou
 * UF só serviria para a ficha pedida sumir calada. Cargo e estado combinam
 * (`--position=GOVERNADOR --state=MG,RJ`), e sem nenhum dos dois o escopo é
 * vazio, isto é, todas as candidaturas.
 */
export function candidateScope(scope: {
  slug?: string
  positions?: Position[]
  state?: string[]
}): { slug?: string; position?: { in: Position[] }; state?: { in: string[] } } {
  if (scope.slug) return { slug: scope.slug }
  return {
    ...(scope.positions ? { position: { in: scope.positions } } : {}),
    ...(scope.state?.length ? { state: { in: scope.state } } : {}),
  }
}

const UFS = new Set([
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT',
  'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
])

/** `--position=GOVERNADOR,SENADOR`; ausente é "todos os cargos". */
export function parsePositionsArg(argv: string[] = process.argv): Position[] | undefined {
  const flag = argv.find((argument) => argument.startsWith('--position='))
  if (!flag) return undefined
  return flag.split('=')[1].split(',').map((value) => {
    const position = Position[value.trim().toUpperCase() as keyof typeof Position]
    if (!position) throw new Error(`Cargo desconhecido: ${value}`)
    return position
  })
}

/**
 * `--state=MG,RJ,BA`; ausente é "todos os estados".
 *
 * Aceita lista porque os jobs que leem pacote nacional do TSE (`bios:tse`,
 * `import:contas`) baixam o mesmo arquivo a cada execução: seis UFs numa
 * chamada é um download, seis chamadas são seis.
 *
 * UF inválida aborta em vez de filtrar por um valor que não casa com nada: o
 * modo de falha do filtro silencioso é uma rodada que termina com zero linhas
 * e parece dizer que não havia dado, quando o que houve foi um erro de digitação.
 * Uma UF inválida no meio da lista aborta a lista inteira, pelo mesmo motivo.
 */
export function parseStateArg(argv: string[] = process.argv): string[] | undefined {
  const flag = argv.find((argument) => argument.startsWith('--state='))
  if (!flag) return undefined
  const states = flag.split('=')[1].split(',').map((value) => {
    const state = value.trim().toUpperCase()
    if (!UFS.has(state)) throw new Error(`UF desconhecida: ${value}`)
    return state
  })
  return [...new Set(states)]
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
 * Citar o arquivo faz o clique virar um download, e não uma fonte que a pessoa
 * consiga ler e conferir. Ordem de preferência:
 *
 *   1. a página da **própria candidatura** no DivulgaCandContas;
 *   2. `metadata.candidatePage`, gravada pelo sync por candidato;
 *   3. o `sourceUrl` — o pacote da UF ou o PDF avulso, conforme a origem.
 *
 * A página da candidatura vem antes da do documento porque um mesmo PDF pode
 * pertencer a duas candidaturas: o PCO registrou o mesmo programa para a
 * disputa presidencial e para a de governo de SP, o dedupe por SHA-256
 * reconheceu um único documento e o relinkou para uma das duas. Citar o
 * `candidatePage` dali mandava quem lia as propostas da Izadora (governo/SP)
 * para a ficha do Rui Costa Pimenta (presidência/BR) — fonte de outra pessoa,
 * pior que o pacote que se queria evitar.
 */
export function programCitationUrl(document: {
  sourceUrl: string | null
  metadata?: unknown
  candidate?: { candidacyStatusSourceUrl?: string | null } | null
}): string | null {
  const own = document.candidate?.candidacyStatusSourceUrl
  if (typeof own === 'string' && /^https:\/\//i.test(own)) return own

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
          candidate: candidateScope(options),
          // Documento que ja rendeu proposta nao volta para a fila.
          //
          // Sem isto, cada execucao recomeca pelo mesmo documento e refaz o
          // mesmo prefixo: a rodada dos 165 planos estaduais caia com o tunel
          // aos ~55 e as duas seguintes reprocessaram os mesmos 55, sem nunca
          // alcancar o resto. Reextrair tambem nao acrescenta nada -- o upsert
          // por `externalId` so reescreve o que ja existe, e item ja revisado e
          // preservado de qualquer forma.
          //
          // `--force` reprocessa mesmo assim, para quando o prompt ou o modelo
          // muda e o texto anterior precisa ser refeito.
          ...(options.force ? {} : { proposals: { none: {} } }),
        },
        select: {
          id: true,
          text: true,
          sourceUrl: true,
          metadata: true,
          candidateId: true,
          candidate: { select: { name: true, slug: true, candidacyStatusSourceUrl: true } },
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
  const prisma = createScraperPrismaClient()
  try {
    logger.info('[program-proposals] Extraindo propostas dos programas de governo')
    const result = await runProgramProposalExtraction({
      prisma,
      dryRun,
      limit: limitArg ? Number(limitArg.split('=')[1]) : undefined,
      slug: slugArg ? slugArg.split('=')[1] : undefined,
      positions: parsePositionsArg(),
      state: parseStateArg(),
      force: process.argv.includes('--force'),
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
