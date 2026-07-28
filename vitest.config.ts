import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Two kinds of test, deliberately kept apart:
    //   tests/  regression suite  - what already worked must keep working
    //   spec/   acceptance suite  - the executable half of each SPEC.md
    include: ['tests/**/*.test.ts', 'spec/**/*.test.ts'],
    environment: 'node',
  },
})
