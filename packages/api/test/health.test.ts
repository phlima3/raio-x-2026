import { describe, expect, it, vi } from 'vitest'

import { connectAndPingRedis } from '../src/routes/health'

describe('connectAndPingRedis', () => {
  it('connects a lazy Redis client before sending PING', async () => {
    let connected = false
    const client = {
      connect: vi.fn(async () => {
        connected = true
      }),
      ping: vi.fn(async () => {
        if (!connected) throw new Error('PING sent before Redis connected')
        return 'PONG'
      }),
    }

    await expect(connectAndPingRedis(client)).resolves.toBeUndefined()
    expect(client.connect).toHaveBeenCalledOnce()
    expect(client.ping).toHaveBeenCalledOnce()
    expect(client.connect.mock.invocationCallOrder[0])
      .toBeLessThan(client.ping.mock.invocationCallOrder[0])
  })
})
