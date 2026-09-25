import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const serverOnlyStub = fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url));
const alias = {
  '@': fileURLToPath(new URL('./src', import.meta.url)),
  // 'server-only' throws outside a React Server environment; tests stub it.
  'server-only': serverOnlyStub,
};

export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
          restoreMocks: true,
        },
      },
      {
        extends: true,
        test: {
          name: 'component',
          include: ['tests/component/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['tests/setup/component.ts'],
          restoreMocks: true,
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          setupFiles: ['tests/setup/integration.ts'],
          // One local database: run files one after another.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}', 'scripts/check-secrets.ts'],
      exclude: [
        'src/lib/supabase/database.types.ts',
        // Next.js route files and framework glue are covered by Playwright
        // journeys, not unit tests.
        'src/app/**',
        'src/proxy.ts',
        'src/lib/supabase/**',
        'src/server/auth.ts',
        'src/server/actions/**',
        'src/env.ts',
        'src/env.client.ts',
      ],
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
        'src/domain/**': { lines: 100, branches: 100, functions: 100, statements: 100 },
      },
    },
  },
});
