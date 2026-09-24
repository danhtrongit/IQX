import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  test: {
    environment: 'node',
    fileParallelism: false,
    hookTimeout: 120_000,
    include: ['test/integration/**/*.integration.spec.ts'],
    setupFiles: ['test/setup.ts'],
    testTimeout: 120_000,
  },
});
