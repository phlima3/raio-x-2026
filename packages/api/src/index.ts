import 'dotenv/config'

import { createApp } from './app'
import { invalidate } from './services/cacheService'

const PORT = process.env.PORT ?? process.env.API_PORT ?? 3001
const app = createApp()

app.listen(PORT, () => {
  console.info(`[api] Running on http://localhost:${PORT}`)
  Promise.all([
    invalidate('candidates:*'),
    invalidate('proposals:*'),
    invalidate('comparison:*'),
  ]).catch(() => {})
})

export default app
