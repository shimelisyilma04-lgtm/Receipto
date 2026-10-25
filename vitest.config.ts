import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['server/tests/**/*.test.ts', 'src/tests/**/*.test.ts'],
    testTimeout: 15000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: [
        'server/**/*.ts',
        'src/services/**/*.ts',
        'src/api.ts',
      ],
      exclude: [
        'server/tests/**',
        'src/tests/**',
        'node_modules/**',
        'dist/**',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), './src'),
    },
  },
});
