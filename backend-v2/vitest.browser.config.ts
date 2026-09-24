import system from './vitest.system.config.js';

export default {
  ...system,
  test: {
    ...system.test,
    include: ['test/browser/**/*.browser.spec.ts'],
    testTimeout: 300_000,
    hookTimeout: 180_000,
  },
};
