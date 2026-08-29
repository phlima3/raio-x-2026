import { createScraperPrismaClient } from '../utils/prisma'
import 'dotenv/config'
import { DataSource, Position, Prisma, type PrismaClient } from '@prisma/client'

import {
  createPrismaSyncRunStore,
  runDataSourceSync,
  type CompletedSyncRun,
} from '../sync/runDataSourceSync'
import { invalidateApiCandidateCaches } from '../utils/invalidateApiCache'
import { logger } from '../utils/logger'
import { revalidateCandidatePages } from '../utils/revalidateWeb'
import { tseBrowserEnabled } from './tse/browserTransport'
import {
  createBrowserDivulgaCandHttpPort,
  type DisposableDivulgaCandHttpPort,
} from './tse/divulgaCandBrowserPort'
import {
  configuredElectionId,
  createDivulgaCandClient,
  divulgaCandPublicUrl,
  DivulgaCandError,
  type DivulgaCandClient,
} from './tse/divulgaCand'
import type { DivulgaCandAccounts } from './tse/divulgaCandAccounts'
import { resolveTargets } from './tseDivulgaCand'

export interface RunFinanciamentoSyncOptions {
  prisma: PrismaClient
  client?: DivulgaCandClient
  year?: number
  electionId?: string
  tseIds?: string[]
  limit?: number
  dryRun?: boolean
}

/**
 * Monta a linha de `CampaignFinancing`. Separada do laço por ser a parte com
 * regra — e a única que se testa sem banco.
 *
 * `sourceUrl` é a página da candidatura, e não um arquivo: citar o pacote fazia
 * o "ver no TSE" do patrimônio virar um download em vez de uma fonte legível.
 */
export function financingUpdateData(
  accounts: DivulgaCandAccounts,
  year: number,
  candidatePage: string,
) {
  return {
    year,
    totalReceived: accounts.totalReceived ?? 0,
    totalSpent: accounts.totalSpent ?? 0,
    totalContracted: accounts.totalContracted,
    spendingLimit: accounts.spendingLimit,
    fefcReceived: accounts.fefcReceived,
    partyFundReceived: accounts.partyFundReceived,
    crowdfundingReceived: accounts.crowdfundingReceived,
    individualsReceived: accounts.individualsReceived,
    companiesReceived: accounts.companiesReceived,
    ownResourcesReceived: accounts.ownResourcesReceived,
    otherReceived: accounts.otherReceived,
    accountsUpdatedAt: accounts.accountsUpdatedAt,
    deliveryControlNumber: accounts.deliveryControlNumber,
    donors: accounts.donors as unknown as Prisma.InputJsonValue,
    suppliers: accounts.suppliers as unknown as Prisma.InputJsonValue,
    sourceUrl: candidatePage,
  }
}

export async function runFinanciamentoSync(
  options: RunFinanciamentoSyncOptions,
): Promise<CompletedSyncRun> {
  const year = options.year ?? 2026
  const electionId = options.electionId ?? configuredElectionId()
  const client = options.client ?? createDivulgaCandClient()

  return runDataSourceSync({
    source: DataSource.TSE,
    kind: 'divulgacand-financiamento',
    sourceUrl: `https://divulgacandcontas.tse.jus.br/divulga/#/candidato/BR/BR/${electionId}`,
    dryRun: options.dryRun,
    store: createPrismaSyncRunStore(options.prisma),
    execute: async () => {
      // Só o titular: a consulta do vice responde 200 com `totalRecebido` nulo,
      // e gravar zero ali faria a ficha dizer que a chapa não arrecadou.
      const targets = await resolveTargets(
        { ...options, positions: [Position.PRESIDENTE] },
        year,
        electionId,
      )
      if (targets.length === 0) return { noop: true, metrics: { candidates: 0 } }

      let consulted = 0
      let updated = 0
      let withoutAccounts = 0
      let withoutNumber = 0
      let failed = 0
      const touchedSlugs = new Set<string>()

      for (const { target, candidate } of targets) {
        if (!candidate) continue
        if (candidate.ballotNumber == null) {
          // Sem número não há como endereçar a consulta, e número não se adivinha.
          withoutNumber++
          logger.warn(`[financiamento] ${candidate.name} sem ballotNumber`)
          continue
        }

        let accounts: DivulgaCandAccounts | null
        try {
          accounts = await client.fetchAccounts(target, candidate.ballotNumber)
        } catch (error) {
          if (error instanceof DivulgaCandError && error.code === 'NOT_FOUND') {
            withoutAccounts++
            continue
          }
          failed++
          logger.error(
            `[financiamento] Consulta falhou para ${candidate.name}`,
            error instanceof Error ? error.message : error,
          )
          continue
        }
        consulted++

        if (!accounts) {
          withoutAccounts++
          continue
        }

        const data = financingUpdateData(accounts, year, divulgaCandPublicUrl(target))
        updated++
        if (candidate.slug) touchedSlugs.add(candidate.slug)
        if (!options.dryRun) {
          await options.prisma.campaignFinancing.upsert({
            where: { candidateId_year: { candidateId: candidate.id, year } },
            update: data,
            create: { ...data, candidateId: candidate.id },
          })
        }
      }

      if (!options.dryRun && touchedSlugs.size > 0) {
        await invalidateApiCandidateCaches()
        await revalidateCandidatePages([...touchedSlugs])
      }

      const metrics = {
        candidates: targets.length,
        consulted,
        updated,
        withoutAccounts,
        withoutNumber,
        failed,
      }
      if (failed > 0) {
        throw new Error(`[financiamento] ${failed} consulta(s) falharam`)
      }
      return { noop: updated === 0, metrics }
    },
  })
}

export async function syncFinanciamento(
  options: Omit<RunFinanciamentoSyncOptions, 'prisma'> = {},
): Promise<CompletedSyncRun> {
  const prisma = createScraperPrismaClient()
  const browserPort: DisposableDivulgaCandHttpPort | null =
    !options.client && tseBrowserEnabled() ? createBrowserDivulgaCandHttpPort() : null
  try {
    const result = await runFinanciamentoSync({
      prisma,
      ...options,
      client: options.client ??
        (browserPort ? createDivulgaCandClient({ http: browserPort }) : undefined),
    })
    logger.info('[financiamento] Concluído', result)
    return result
  } finally {
    await browserPort?.dispose()
    await prisma.$disconnect()
  }
}

if (require.main === module) {
  const limitArgument = process.argv.find((argument) => /^--limit=\d+$/.test(argument))
  syncFinanciamento({
    dryRun: process.argv.includes('--dry-run'),
    limit: limitArgument ? Number(limitArgument.split('=')[1]) : undefined,
  }).catch((error) => {
    logger.error('[financiamento] Erro fatal', error)
    process.exit(1)
  })
}
