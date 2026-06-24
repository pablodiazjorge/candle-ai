import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/app/core/**/*.ts'],
      exclude: ['src/app/core/llm/**', 'src/app/core/state/**'],
      thresholds: {
        statements: 70,
        branches: 60,
        functions: 70,
        lines: 70,
      },
    },
  },
  resolve: {
    conditions: ['browser', 'module', 'import'],
    mainFields: ['browser', 'module', 'main'],
  },
});
