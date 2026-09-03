import type { Page, Response } from 'playwright'
import { describe, expect, it, vi } from 'vitest'

import { navigateForContent, sameSiteHttpUrl } from '../src/utils/siteNavigation'

function response(status: number): Response {
  return { status: () => status } as unknown as Response
}

describe('navigateForContent', () => {
  it('uses the committed response when DOMContentLoaded never settles', async () => {
    const page = {
      goto: vi.fn().mockResolvedValue(response(200)),
      waitForLoadState: vi.fn().mockRejectedValue(new Error('Timeout 15000ms exceeded')),
      waitForSelector: vi.fn().mockResolvedValue({}),
    } as unknown as Pick<Page, 'goto' | 'waitForLoadState' | 'waitForSelector'>

    await expect(navigateForContent(page, 'https://www.gov.br/planalto')).resolves.toBeDefined()
    expect(page.goto).toHaveBeenCalledWith('https://www.gov.br/planalto', {
      waitUntil: 'commit',
      timeout: 30_000,
    })
  })

  it('retries a transient navigation failure and still rejects HTTP errors', async () => {
    const retryingPage = {
      goto: vi.fn()
        .mockRejectedValueOnce(new Error('net::ERR_CONNECTION_RESET'))
        .mockResolvedValueOnce(response(200)),
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
      waitForSelector: vi.fn().mockResolvedValue({}),
    } as unknown as Pick<Page, 'goto' | 'waitForLoadState' | 'waitForSelector'>

    await expect(navigateForContent(retryingPage, 'https://www.ba.gov.br', {
      retryDelayMs: 0,
    })).resolves.toBeDefined()
    expect(retryingPage.goto).toHaveBeenCalledTimes(2)

    const missingPage = {
      goto: vi.fn().mockResolvedValue(response(404)),
      waitForLoadState: vi.fn(),
      waitForSelector: vi.fn(),
    } as unknown as Pick<Page, 'goto' | 'waitForLoadState' | 'waitForSelector'>
    await expect(navigateForContent(missingPage, 'https://candidate.example/missing'))
      .rejects.toThrow('HTTP 404')
    expect(missingPage.goto).toHaveBeenCalledTimes(1)
  })

  it('retries the committed navigation when no body becomes available', async () => {
    const page = {
      goto: vi.fn().mockResolvedValue(response(200)),
      waitForLoadState: vi.fn().mockRejectedValue(new Error('DOMContentLoaded timeout')),
      waitForSelector: vi.fn()
        .mockRejectedValueOnce(new Error('body not attached'))
        .mockResolvedValueOnce({}),
    } as unknown as Pick<Page, 'goto' | 'waitForLoadState' | 'waitForSelector'>

    await expect(navigateForContent(page, 'https://www.parana.pr.gov.br', {
      retryDelayMs: 0,
    })).resolves.toBeDefined()
    expect(page.goto).toHaveBeenCalledTimes(2)
    expect(page.waitForSelector).toHaveBeenCalledWith('body', {
      state: 'attached',
      timeout: 15_000,
    })
  })
})

describe('navegacao a partir de conteudo nao confiavel', () => {
  function spyPage() {
    return {
      goto: vi.fn().mockResolvedValue(response(200)),
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
      waitForSelector: vi.fn().mockResolvedValue({}),
    } as unknown as Pick<Page, 'goto' | 'waitForLoadState' | 'waitForSelector'>
  }

  it.each([
    'file:///proc/self/environ',
    'file:///C:/Users/dev/.env',
    'chrome://version',
    'data:text/html,<h1>x</h1>',
  ])('nao navega para %s', async (url) => {
    const page = spyPage()
    await expect(navigateForContent(page, url)).rejects.toThrow(/Esquema bloqueado/)
    expect(page.goto).not.toHaveBeenCalled()
  })

  it('segue link de propostas no proprio site, inclusive http -> https e www', () => {
    expect(sameSiteHttpUrl('https://zema.com.br/propostas', 'http://zema.com.br'))
      .toBe('https://zema.com.br/propostas')
    expect(sameSiteHttpUrl('https://www.zema.com.br/programa', 'https://zema.com.br'))
      .toBe('https://www.zema.com.br/programa')
  })

  it.each([
    ['file:///proc/self/environ#/propostas', 'leitura de arquivo local'],
    ['http://127.0.0.1:15432/#/propostas', 'loopback do runner'],
    ['http://169.254.169.254/latest/meta-data/#/programa', 'metadata link-local'],
    ['https://evil.example/propostas', 'host de terceiro'],
  ])('recusa %s (%s)', (href) => {
    expect(sameSiteHttpUrl(href, 'https://zema.com.br')).toBeNull()
  })
})
