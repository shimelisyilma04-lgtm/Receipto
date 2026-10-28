import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['server/tests/**/*.{test,spec}.{ts,tsx}', 'src/tests/**/*.{test,spec}.{ts,tsx}'],
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
      thresholds: {
        statements: 60,
        branches: 40,
        functions: 60,
        lines: 60,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), './src'),
    },
  },
});
