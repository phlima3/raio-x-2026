import 'dotenv/config'

import { Prisma } from '@prisma/client'

import { createApp } from './app'
import { invalidate } from './services/cacheService'

const PORT = process.env.PORT ?? process.env.API_PORT ?? 3001
const app = createApp()

app.listen(PORT, () => {
  console.info(`[api] Running on http://localhost:${PORT}`)
  // O cliente Prisma do runtime já divergiu do gerado no build: em
  // 2026-08-29 a API serviu `CampaignFinancing` sem as colunas novas mesmo
  // com o build provando 23 campos. Registrar no startup transforma isso em
  // uma linha de log, em vez de um campo faltando numa resposta pública.
  try {
    const modelo = Prisma.dmmf.datamodel.models.find((m) => m.name === 'CampaignFinancing')
    console.info(
      `[api] Prisma CampaignFinancing: ${modelo?.fields.length ?? 0} campos` +
        ` (fefcReceived=${modelo?.fields.some((f) => f.name === 'fefcReceived') ?? false})`,
    )
  } catch {
    console.info('[api] não foi possível inspecionar o modelo Prisma')
  }
  Promise.all([
    invalidate('candidates:*'),
    invalidate('proposals:*'),
    invalidate('comparison:*'),
  ]).catch(() => {})
})

export default app
