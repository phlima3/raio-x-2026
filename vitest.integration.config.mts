import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/**/*.integration.test.ts'],
    fileParallelism: false,
    restoreMocks: true,
    clearMocks: true,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
})
