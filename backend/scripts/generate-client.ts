import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

import { createClient } from '@hey-api/openapi-ts';
import { format } from 'prettier';

const projectRoot = process.cwd();
const schemaPath = resolve(projectRoot, 'contracts/openapi-v2.json');
const committedOutput = resolve(projectRoot, 'contracts/client');

async function generate(output: string): Promise<void> {
  // Passing the already-parsed local snapshot prevents registry or URL input.
  const schema = JSON.parse(await readFile(schemaPath, 'utf8')) as object;
  await createClient({
    input: schema,
    interactive: false,
    output: {
      clean: true,
      entryFile: true,
      path: output,
      postProcess: [],
      tsConfigPath: resolve(projectRoot, 'tsconfig.json'),
    },
    // Generate compile-time contracts only: no SDK, transport, hooks or runtime schemas.
    plugins: ['@hey-api/typescript'],
  });
  await formatGeneratedTypes(output);
}

async function formatGeneratedTypes(output: string): Promise<void> {
  for (const entry of await readdir(output, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
    const path = join(output, entry.name);
    const source = await readFile(path, 'utf8');
    await writeFile(path, await format(source, { filepath: path }), 'utf8');
  }
}

async function filesUnder(root: string, current = root): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries.sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  )) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) {
      for (const [name, contents] of await filesUnder(root, path)) {
        files.set(name, contents);
      }
    } else if (entry.isFile()) {
      files.set(relative(root, path), await readFile(path));
    } else {
      throw new Error(`Unsupported generated entry: ${path}`);
    }
  }
  return files;
}

async function assertDirectoriesEqual(expectedRoot: string, actualRoot: string): Promise<void> {
  const [expected, actual] = await Promise.all([filesUnder(expectedRoot), filesUnder(actualRoot)]);
  const expectedNames = [...expected.keys()].sort();
  const actualNames = [...actual.keys()].sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    throw new Error(
      `Generated client file set drifted. Expected ${JSON.stringify(expectedNames)}, ` +
        `found ${JSON.stringify(actualNames)}.`,
    );
  }
  for (const name of expectedNames) {
    const expectedContents = expected.get(name);
    const actualContents = actual.get(name);
    if (!expectedContents || !actualContents || !actualContents.equals(expectedContents)) {
      throw new Error(`Generated client file drifted: ${name}`);
    }
  }
}

async function check(): Promise<void> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'iqx-openapi-types-'));
  const temporaryOutput = join(temporaryRoot, 'client');
  try {
    await generate(temporaryOutput);
    await assertDirectoriesEqual(temporaryOutput, committedOutput);
  } finally {
    // The exact path comes directly from mkdtemp, never from user input.
    await rm(temporaryRoot, { force: true, recursive: true });
  }
  console.log('Generated OpenAPI types are current');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.some((argument) => argument !== '--check') || args.length > 1) {
    throw new Error('Usage: generate-client.ts [--check]');
  }
  if (args[0] === '--check') {
    await check();
    return;
  }
  await generate(committedOutput);
  console.log(`wrote ${committedOutput}`);
}

await main();
