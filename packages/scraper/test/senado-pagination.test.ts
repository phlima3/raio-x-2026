import { describe, expect, it, vi } from 'vitest'

import { collectSenadoPages } from '../src/sources/senado'

describe('collectSenadoPages', () => {
  it('follows every next link and preserves the first request parameters', async () => {
    const get = vi.fn()
      .mockResolvedValueOnce({
        data: {
          dados: [{ id: 1 }],
          links: [{ rel: 'next', href: '/processo?pagina=2' }],
        },
        headers: {},
      })
      .mockResolvedValueOnce({
        data: {
          dados: [{ id: 2 }],
          links: [{ rel: 'next', href: '/processo?pagina=3' }],
        },
        headers: {},
      })
      .mockResolvedValueOnce({ data: { dados: [{ id: 3 }], links: [] }, headers: {} })

    const rows = await collectSenadoPages<{ id: number }>(
      { get },
      '/processo',
      { codigoParlamentarAutor: 42 },
    )

    expect(rows).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }])
    expect(get).toHaveBeenNthCalledWith(1, '/processo', {
      params: { codigoParlamentarAutor: 42 },
    })
    expect(get).toHaveBeenNthCalledWith(2, '/processo?pagina=2', undefined)
    expect(get).toHaveBeenNthCalledWith(3, '/processo?pagina=3', undefined)
  })

  it('accepts the array response used by the current official API', async () => {
    const get = vi.fn().mockResolvedValue({ data: [{ id: 1 }, { id: 2 }], headers: {} })

    await expect(collectSenadoPages<{ id: number }>({ get }, '/votacao'))
      .resolves.toEqual([{ id: 1 }, { id: 2 }])
  })

  it('rejects pagination loops instead of silently truncating', async () => {
    const get = vi.fn().mockResolvedValue({
      data: { dados: [], links: [{ rel: 'next', href: '/processo' }] },
      headers: {},
    })

    await expect(collectSenadoPages({ get }, '/processo'))
      .rejects.toThrow('Pagination loop')
  })
})
