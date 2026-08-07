import type { Page, Response } from 'playwright'
import { describe, expect, it, vi } from 'vitest'

import { navigateForContent } from '../src/utils/siteNavigation'

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
