import { createScraperPrismaClient } from '../utils/prisma'
import 'dotenv/config'
import { Position, ProposalOrigin, ProposalStatus, type PrismaClient } from '@prisma/client'

import { invalidateApiCandidateCaches } from '../utils/invalidateApiCache'
import { logger } from '../utils/logger'
import { revalidateCandidatePages } from '../utils/revalidateWeb'

/** A fonte gravada pelo `extract:programs`. Nada mais é publicável por aqui. */
const PROGRAM_SOURCE = 'tse_program'

export interface PublishProgramProposalsOptions {
  prisma: PrismaClient
  positions?: Position[]
  slug?: string
  dryRun?: boolean
}

export interface PublishProgramProposalsResult {
  candidates: number
  published: number
  slugs: string[]
}

/**
 * Publica a extração dos planos de governo em um escopo fechado de cargos.
 *
 * É uma decisão editorial deliberada: o texto é de máquina e não passou por
 * revisão item a item, então a ficha precisa dizer isso ao leitor — ver o aviso
 * em `ProposalsSection` e o rótulo por item em `ProposalBlock`. `origin`
 * permanece `AI_EXTRACTION` justamente para o front conseguir marcar.
 *
 * `reviewedAt` continua nulo: ninguém conferiu, e mentir nesse campo faria uma
 * reextração pular a linha achando que houve revisão.
 */
export async function publishProgramProposals(
  options: PublishProgramProposalsOptions,
): Promise<PublishProgramProposalsResult> {
  const positions = options.positions ?? [Position.PRESIDENTE]

  const targets = await options.prisma.proposal.findMany({
    where: {
      source: PROGRAM_SOURCE,
      origin: ProposalOrigin.AI_EXTRACTION,
      reviewedAt: null,
      status: ProposalStatus.DRAFT,
      candidate: {
        isPublished: true,
        ...(options.slug ? { slug: options.slug } : { position: { in: positions } }),
      },
    },
    select: { id: true, candidate: { select: { slug: true, name: true } } },
  })

  const slugs = [...new Set(targets.flatMap((t) => t.candidate.slug ? [t.candidate.slug] : []))]
  const names = new Set(targets.map((t) => t.candidate.name))

  if (!options.dryRun && targets.length > 0) {
    await options.prisma.proposal.updateMany({
      where: { id: { in: targets.map((t) => t.id) } },
      data: { status: ProposalStatus.SUBMITTED, isPublished: true },
    })
    await invalidateApiCandidateCaches()
    await revalidateCandidatePages(slugs)
  }

  return { candidates: names.size, published: targets.length, slugs }
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run')
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
    const result = await publishProgramProposals({
      prisma,
      positions,
      slug: slugArg ? slugArg.split('=')[1] : undefined,
      dryRun,
    })
    logger.info(
      `[publish-programs] ${dryRun ? '[dry-run] ' : ''}` +
        `${result.published} propostas de ${result.candidates} candidatos`,
      { slugs: result.slugs },
    )
  } finally {
    await prisma.$disconnect()
  }
}

if (require.main === module) {
  main().catch((error) => {
    logger.error('[publish-programs] Erro fatal', error)
    process.exit(1)
  })
}
