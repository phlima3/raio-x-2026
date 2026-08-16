import { describe, expect, it } from 'vitest'

import { boundedDatabaseUrl } from '../src/utils/prisma'

const URL_BASE = 'postgresql://r_svc:senha@127.0.0.1:15432/t_svc?sslmode=disable'

describe('boundedDatabaseUrl', () => {
  it('caps the pool without disturbing the rest of the connection string', () => {
    const bounded = new URL(boundedDatabaseUrl(URL_BASE, 3))

    expect(bounded.searchParams.get('connection_limit')).toBe('3')
    expect(bounded.searchParams.get('sslmode')).toBe('disable')
    expect(bounded.username).toBe('r_svc')
    expect(bounded.password).toBe('senha')
    expect(bounded.host).toBe('127.0.0.1:15432')
    expect(bounded.pathname).toBe('/t_svc')
  })

  it('preserves a percent-encoded password', () => {
    const encoded = 'postgresql://u:p%40ss%3Aword@host:5432/db'

    expect(new URL(boundedDatabaseUrl(encoded, 3)).password).toBe('p%40ss%3Aword')
  })

  it('leaves an explicit connection_limit untouched', () => {
    const explicit = `${URL_BASE}&connection_limit=10`

    expect(boundedDatabaseUrl(explicit, 3)).toBe(explicit)
  })

  it('returns an unparseable value unchanged instead of breaking the run', () => {
    expect(boundedDatabaseUrl('nao-e-uma-url', 3)).toBe('nao-e-uma-url')
  })
})
