import { defineConfig } from 'vitest/config'

// Backend unit tests only (server/). Kept separate from vite.config.ts so tests
// don't load the React/Tailwind plugins.
export default defineConfig({
  test: {
    include: ['server/**/*.test.ts'],
    environment: 'node',
  },
})
