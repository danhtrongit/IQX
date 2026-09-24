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
    include: ['test/system/**/*.system.spec.ts'],
    setupFiles: ['test/setup.ts'],
    hookTimeout: 180_000,
    testTimeout: 180_000,
    maxConcurrency: 1,
  },
});
