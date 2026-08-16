import { describe, expect, it } from 'vitest'

import { serializeMeta } from '../src/utils/logger'

class PrismaLikeError extends Error {
  readonly clientVersion = '5.22.0'

  constructor(message: string) {
    super(message)
    this.name = 'PrismaClientInitializationError'
  }
}

describe('serializeMeta', () => {
  it('keeps the error message that JSON.stringify would silently drop', () => {
    const error = new PrismaLikeError(
      'Authentication failed against database server, the provided credentials are not valid',
    )

    expect(JSON.parse(JSON.stringify(error))).not.toHaveProperty('message')
    expect(JSON.parse(JSON.stringify(serializeMeta(error)))).toEqual(
      expect.objectContaining({
        name: 'PrismaClientInitializationError',
        clientVersion: '5.22.0',
        message: 'Authentication failed against database server, '
          + 'the provided credentials are not valid',
      }),
    )
  })

  it('unwraps a nested cause', () => {
    const serialized = serializeMeta(
      new Error('falha ao ler recurso', { cause: new Error('ECONNREFUSED') }),
    ) as { cause: { message: string } }

    expect(serialized.cause.message).toBe('ECONNREFUSED')
  })

  it('passes plain metadata through untouched', () => {
    expect(serializeMeta({ parsed: 12, source: 'TSE' })).toEqual({ parsed: 12, source: 'TSE' })
  })
})
