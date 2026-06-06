import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Solo los tests de integración que requieren BD real
    include: ['tests/auth.test.js', 'tests/favorites.test.js'],
    setupFiles: ['tests/setup.js'],
    // Tests se ejecutan en serie — comparten la misma BD y necesitan orden determinista
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.js'],
      exclude: ['node_modules/', 'tests/', 'src/index.js'],
    },
  },
});
