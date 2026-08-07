import type { Browser } from 'playwright'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ launch: vi.fn() }))
vi.mock('playwright', () => ({ chromium: { launch: mocks.launch } }))

import { closeBrowser, createContext, getBrowser } from '../src/utils/playwright'

describe('Playwright browser lifecycle', () => {
  afterEach(async () => {
    await closeBrowser()
    vi.clearAllMocks()
  })

  it('shares one launch across concurrent pages and tolerates public-site certificate errors', async () => {
    let finishLaunch!: (browser: Browser) => void
    const launched = new Promise<Browser>((resolve) => { finishLaunch = resolve })
    const browser = {
      isConnected: vi.fn().mockReturnValue(true),
      close: vi.fn().mockResolvedValue(undefined),
      newContext: vi.fn().mockResolvedValue({}),
    } as unknown as Browser
    mocks.launch.mockReturnValue(launched)

    const first = getBrowser()
    const second = getBrowser()
    expect(mocks.launch).toHaveBeenCalledTimes(1)
    finishLaunch(browser)
    await expect(Promise.all([first, second])).resolves.toEqual([browser, browser])

    await createContext()
    expect(browser.newContext).toHaveBeenCalledWith(expect.objectContaining({
      ignoreHTTPSErrors: true,
    }))
  })
})
