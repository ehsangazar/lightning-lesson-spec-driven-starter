import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // tests/ is the regression suite: what already worked must keep working.
    // Acceptance tests for a spec-kit feature land here too, one file per
    // feature, since specs/ holds documents rather than code.
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
