import { afterEach, describe, expect, it } from 'vitest'

import { boundedDatabaseUrl, connectionLimit } from '../src/lib/databaseUrl'

const URL_BASE = 'postgresql://r_svc:senha@db.interno:5432/t_svc?sslmode=disable'

afterEach(() => {
  delete process.env.API_CONNECTION_LIMIT
})

describe('boundedDatabaseUrl', () => {
  it('caps the pool without disturbing the rest of the connection string', () => {
    const bounded = new URL(boundedDatabaseUrl(URL_BASE, 5))

    expect(bounded.searchParams.get('connection_limit')).toBe('5')
    expect(bounded.searchParams.get('sslmode')).toBe('disable')
    expect(bounded.username).toBe('r_svc')
    expect(bounded.password).toBe('senha')
    expect(bounded.host).toBe('db.interno:5432')
    expect(bounded.pathname).toBe('/t_svc')
  })

  it('leaves an explicit connection_limit untouched', () => {
    const explicit = `${URL_BASE}&connection_limit=20`

    expect(boundedDatabaseUrl(explicit, 5)).toBe(explicit)
  })

  it('returns an unparseable value unchanged instead of breaking startup', () => {
    expect(boundedDatabaseUrl('nao-e-uma-url', 5)).toBe('nao-e-uma-url')
  })
})

describe('connectionLimit', () => {
  it('defaults to a fixed ceiling instead of scaling with the container', () => {
    expect(connectionLimit()).toBe(5)
  })

  it('honours a valid override and ignores a nonsensical one', () => {
    process.env.API_CONNECTION_LIMIT = '2'
    expect(connectionLimit()).toBe(2)

    process.env.API_CONNECTION_LIMIT = '0'
    expect(connectionLimit()).toBe(5)

    process.env.API_CONNECTION_LIMIT = 'muitas'
    expect(connectionLimit()).toBe(5)
  })
})
