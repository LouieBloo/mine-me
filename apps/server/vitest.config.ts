import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    pool: 'forks',
    // The engine tests run hundreds of ticks of a 135x135 world (9x the cells of the original grid) while the suite runs in parallel
    testTimeout: 30000,
    include: ['**/*.{test,spec}.ts'],
    setupFiles: ['./tests/setup/assetsRoot.ts', './tests/setup/definitions.ts'],
  },
})
