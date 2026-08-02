import { DataSource, SyncRunStatus } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'

import {
  runDataSourceSync,
  type SyncRunStore,
} from '../src/sync/runDataSourceSync'

describe('runDataSourceSync', () => {
  it('records a failed source run and rethrows so the command exits non-zero', async () => {
    const store: SyncRunStore = {
      start: vi.fn().mockResolvedValue({ id: 'run-1' }),
      finish: vi.fn().mockResolvedValue(undefined),
    }
    const sourceFailure = new Error('TSE indisponível')

    await expect(runDataSourceSync({
      source: DataSource.TSE,
      kind: 'candidates',
      store,
      execute: async () => { throw sourceFailure },
    })).rejects.toBe(sourceFailure)

    expect(store.finish).toHaveBeenCalledWith('run-1', {
      status: SyncRunStatus.FAILED,
      metrics: {},
      error: 'TSE indisponível',
    })
  })
})
