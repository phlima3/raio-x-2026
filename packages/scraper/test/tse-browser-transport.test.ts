import { afterEach, describe, expect, it } from 'vitest'

import {
  assertNavigationStatus,
  TseBrowserError,
  tseBrowserEnabled,
} from '../src/sources/tse/browserTransport'
import { asDivulgaCandError } from '../src/sources/tse/divulgaCandBrowserPort'

const URL_ANEXO =
  'https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/doc/280017002789'

describe('tseBrowserEnabled', () => {
  const original = process.env.TSE_BROWSER_TRANSPORT

  afterEach(() => {
    if (original === undefined) delete process.env.TSE_BROWSER_TRANSPORT
    else process.env.TSE_BROWSER_TRANSPORT = original
  })

  it('stays off unless explicitly turned on, so CI keeps using plain fetch', () => {
    delete process.env.TSE_BROWSER_TRANSPORT
    expect(tseBrowserEnabled()).toBe(false)
    process.env.TSE_BROWSER_TRANSPORT = '0'
    expect(tseBrowserEnabled()).toBe(false)
    process.env.TSE_BROWSER_TRANSPORT = 'false'
    expect(tseBrowserEnabled()).toBe(false)
  })

  it('turns on for 1 and true', () => {
    process.env.TSE_BROWSER_TRANSPORT = '1'
    expect(tseBrowserEnabled()).toBe(true)
    process.env.TSE_BROWSER_TRANSPORT = 'TRUE'
    expect(tseBrowserEnabled()).toBe(true)
  })
})

describe('assertNavigationStatus', () => {
  it('lets any 2xx through', () => {
    expect(() => assertNavigationStatus(URL_ANEXO, 200)).not.toThrow()
    expect(() => assertNavigationStatus(URL_ANEXO, 206)).not.toThrow()
  })

  it('keeps the status on the error, which is what separates missing from failed', () => {
    try {
      assertNavigationStatus(URL_ANEXO, 404)
      expect.unreachable('404 deveria ter lançado')
    } catch (error) {
      expect(error).toBeInstanceOf(TseBrowserError)
      expect((error as TseBrowserError).status).toBe(404)
    }
  })

  it('rejects the 403 the TSE gives to automated clients', () => {
    // Precisa chegar ao sync como falha, e não como candidatura inexistente.
    try {
      assertNavigationStatus(URL_ANEXO, 403)
      expect.unreachable('403 deveria ter lançado')
    } catch (error) {
      expect((error as TseBrowserError).status).toBe(403)
    }
  })
})

describe('asDivulgaCandError', () => {
  it('turns a 404 into NOT_FOUND, which the sync counts as missing', () => {
    const mapped = asDivulgaCandError(URL_ANEXO, new TseBrowserError(404, 'qualquer'))
    expect(mapped).toMatchObject({ name: 'DivulgaCandError', code: 'NOT_FOUND' })
  })

  it('turns anything else into HTTP_ERROR, which reproves the run', () => {
    const mapped = asDivulgaCandError(URL_ANEXO, new TseBrowserError(403, 'Access Denied'))
    expect(mapped).toMatchObject({ name: 'DivulgaCandError', code: 'HTTP_ERROR' })
  })

  it('leaves an unrelated error alone instead of disguising it', () => {
    // Um bug de programação não pode virar "candidatura sem registro".
    const bug = new TypeError('leitura de undefined')
    expect(asDivulgaCandError(URL_ANEXO, bug)).toBe(bug)
  })
})
