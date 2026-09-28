import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const packageJson = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
);
const appJson = JSON.parse(
  await readFile(new URL('../app.json', import.meta.url), 'utf8'),
);

test('mobile package has an Expo entry point and typecheck script', () => {
  assert.equal(packageJson.main, 'expo-router/entry');
  assert.equal(typeof packageJson.scripts?.typecheck, 'string');
});

test('Expo app metadata declares a stable identity', () => {
  assert.equal(typeof appJson.expo?.name, 'string');
  assert.ok(appJson.expo.name.length > 0);
  assert.equal(typeof appJson.expo?.slug, 'string');
  assert.ok(appJson.expo.slug.length > 0);
});

test('store and deep-link metadata is present before native builds', () => {
  assert.equal(appJson.expo.scheme, 'iqx');
  assert.equal(appJson.expo.ios?.bundleIdentifier, 'com.iqx.app');
  assert.equal(appJson.expo.android?.package, 'com.iqx.app');
  assert.deepEqual(appJson.expo.ios?.associatedDomains, ['applinks:iqx.vn']);
  assert.equal(appJson.expo.android?.intentFilters?.[0]?.autoVerify, true);
  const buildProperties = appJson.expo.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-build-properties');
  assert.equal(buildProperties?.[1]?.android?.targetSdkVersion, 36);
});
