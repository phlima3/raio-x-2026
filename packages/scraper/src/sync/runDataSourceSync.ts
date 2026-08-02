import {
  type DataSource,
  Prisma,
  type PrismaClient,
  SyncRunStatus,
} from '@prisma/client'

export type SyncMetrics = Record<string, number | string | boolean | null>

export interface StartSyncRunInput {
  source: DataSource
  kind: string
  sourceUrl?: string
  dryRun: boolean
}

export interface FinishSyncRunInput {
  status: SyncRunStatus
  metrics: SyncMetrics
  error: string | null
}

export interface SyncRunStore {
  start(input: StartSyncRunInput): Promise<{ id: string }>
  finish(id: string, input: FinishSyncRunInput): Promise<void>
}

export interface SyncExecutionResult {
  metrics?: SyncMetrics
  noop?: boolean
}

export interface RunDataSourceSyncInput {
  source: DataSource
  kind: string
  sourceUrl?: string
  dryRun?: boolean
  store: SyncRunStore
  execute(context: { runId: string }): Promise<SyncExecutionResult | void>
}

export interface CompletedSyncRun {
  runId: string
  status: SyncRunStatus
  metrics: SyncMetrics
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

export async function runDataSourceSync(
  input: RunDataSourceSyncInput,
): Promise<CompletedSyncRun> {
  const run = await input.store.start({
    source: input.source,
    kind: input.kind,
    sourceUrl: input.sourceUrl,
    dryRun: input.dryRun ?? false,
  })

  try {
    const result = await input.execute({ runId: run.id })
    const metrics = result?.metrics ?? {}
    const status = result?.noop ? SyncRunStatus.NOOP : SyncRunStatus.SUCCESS
    await input.store.finish(run.id, { status, metrics, error: null })
    return { runId: run.id, status, metrics }
  } catch (error) {
    await input.store.finish(run.id, {
      status: SyncRunStatus.FAILED,
      metrics: {},
      error: errorMessage(error),
    })
    throw error
  }
}

type SyncRunPrisma = Pick<PrismaClient, 'dataSyncRun'>

export function createPrismaSyncRunStore(db: SyncRunPrisma): SyncRunStore {
  return {
    async start(input) {
      return db.dataSyncRun.create({
        data: {
          source: input.source,
          kind: input.kind,
          sourceUrl: input.sourceUrl,
          dryRun: input.dryRun,
        },
        select: { id: true },
      })
    },
    async finish(id, input) {
      await db.dataSyncRun.update({
        where: { id },
        data: {
          status: input.status,
          finishedAt: new Date(),
          metrics: input.metrics as Prisma.InputJsonObject,
          error: input.error,
        },
      })
    },
  }
}
