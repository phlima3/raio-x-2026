import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

import {
  createTseCkanClient,
  TseResourceKind,
  type TseHttpPort,
} from '../src/sources/tse/ckanClient'

describe('TSE CKAN client', () => {
  it('discovers typed resources and downloads bytes with a SHA-256 checksum', async () => {
    const body = Buffer.from('official snapshot')
    const http: TseHttpPort = {
      getJson: vi.fn().mockResolvedValue({
        success: true,
        result: {
          name: 'candidatos-2026',
          resources: [
            {
              id: 'resource-candidates',
              name: 'Candidatos',
              format: 'CSV',
              url: 'https://cdn.tse.jus.br/consulta_cand_2026.zip',
            },
            {
              id: 'resource-social',
              name: 'Redes sociais de candidatos',
              format: 'CSV',
              url: 'https://cdn.tse.jus.br/rede_social_candidato_2026.zip',
            },
          ],
        },
      }),
      getBytes: vi.fn().mockResolvedValue(body),
    }
    const client = createTseCkanClient({
      baseUrl: 'https://dadosabertos.tse.jus.br',
      http,
    })

    const resources = await client.discover(2026)
    const downloaded = await client.download(resources[0])

    expect(resources.map((resource) => resource.kind)).toEqual([
      TseResourceKind.CANDIDATES,
      TseResourceKind.SOCIAL_MEDIA,
    ])
    expect(downloaded.bytes).toEqual(body)
    expect(downloaded.sha256).toBe(createHash('sha256').update(body).digest('hex'))
  })
})
