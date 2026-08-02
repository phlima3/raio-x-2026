import { describe, expect, it, vi } from 'vitest'

import {
  collectCamaraPages,
  type CamaraHttpPort,
} from '../src/sources/camara'

describe('Câmara pagination', () => {
  it('follows every rel=next link until the final page', async () => {
    const http: CamaraHttpPort = {
      get: vi.fn()
        .mockResolvedValueOnce({
          data: {
            dados: [{ id: 1 }],
            links: [{ rel: 'next', href: 'https://camara.test/items?pagina=2' }],
          },
        })
        .mockResolvedValueOnce({
          data: {
            dados: [{ id: 2 }],
            links: [{ rel: 'next', href: 'https://camara.test/items?pagina=3' }],
          },
        })
        .mockResolvedValueOnce({
          data: { dados: [{ id: 3 }], links: [] },
        }),
    }

    const rows = await collectCamaraPages<{ id: number }>(http, '/items', { itens: 100 })

    expect(rows.map((row) => row.id)).toEqual([1, 2, 3])
    expect(http.get).toHaveBeenCalledTimes(3)
  })
})
