import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Unit tests only — no DB required. Integration tests use vitest.integration.config.js
    include: ['src/**/*.test.{js,ts}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['src/**/*.js'],
      exclude: [
        'node_modules/',
        'tests/',
        'src/index.js',
        'src/config/env.js',
        'src/clients/gasolinerasClient.js',
        '**/*.test.js',
      ],
    },
  },
});
