import 'dotenv/config'

import { createApp } from './app'
import { invalidate } from './services/cacheService'

const PORT = process.env.PORT ?? process.env.API_PORT ?? 3001
const app = createApp()

app.listen(PORT, () => {
  console.info(`[api] Running on http://localhost:${PORT}`)
  invalidate('candidates:*').catch(() => {})
})

export default app
