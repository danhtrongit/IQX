import 'reflect-metadata';

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';

const HTTP_METHODS = ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT'] as const;
const OPENAPI_METHODS = new Set(HTTP_METHODS.map((method) => method.toLowerCase()));
const INFRASTRUCTURE_PATHS = [/^\/docs(?:\/|$)/, /^\/openapi\.json$/];

export interface LegacyRoute {
  authHint?: { level?: string };
  includeInSchema?: boolean;
  method: string;
  path: string;
  protocol: 'http' | 'websocket';
  responseModelHint?: unknown;
  router?: { module?: string };
  source?: { file?: string; handler?: string; line?: number };
}

export interface LegacyContract {
  counts: { http: number; routes: number; websocket: number };
  routes: LegacyRoute[];
}

export interface OpenApiOperation {
  method: string;
  path: string;
  operationId?: string;
  raw: Record<string, unknown>;
}

export interface RuntimeHttpOperation {
  method: string;
  path: string;
}

export interface RuntimeWebSocketGateway {
  className: string;
  messageHandlers: string[];
  path: string | null;
}

export interface RuntimeInventory {
  http: RuntimeHttpOperation[];
  websocket: {
    adapter: string | null;
    gateways: RuntimeWebSocketGateway[];
  };
}

export interface CoverageInput {
  legacy: LegacyContract;
  openApi: { paths?: Record<string, Record<string, unknown>> };
  runtime: RuntimeInventory;
  dispositions?: {
    overrides?: Record<string, { disposition?: string; replacement?: string }>;
  };
  semanticSignals?: SemanticSignal[];
}

export interface SemanticSignal {
  file: string;
  kind: 'constant-placeholder' | 'not-implemented';
  line: number;
  sample: string;
}

export interface ApiCoverageReport {
  schemaVersion: 1;
  baseline: { http: number; websocket: number };
  runtime: {
    documentedHttp: number;
    registeredHttp: number;
    websocketAdapter: string | null;
    websocketGateways: number;
  };
  coverage: {
    http: { mapped: number; missing: string[]; total: number };
    websocket: { mapped: number; missing: string[]; total: number };
  };
  mappings: RouteMapping[];
  groups: GroupCoverage[];
  consistency: {
    duplicateLegacy: string[];
    duplicateOpenApi: string[];
    duplicateRuntime: string[];
    openApiWithoutRuntime: string[];
    runtimeWithoutOpenApi: string[];
  };
  quality: {
    operationsWithoutDeclaredAuth: string[];
    operationsWithoutResponseSchema: string[];
    semanticSignals: SemanticSignal[];
    semanticVerification: 'manual-review-required';
  };
  verdict: {
    structurallyComplete: boolean;
    semanticComplete: false;
    failures: string[];
  };
}

export interface RouteMapping {
  authLevel: string;
  documented: boolean;
  responseSchema: boolean;
  runtimeRegistered: boolean;
  source: string;
  sourceFile: string | null;
  strategy:
    | 'compatibility'
    | 'explicit-replacement'
    | 'parameterized-consolidation'
    | 'prefix-replacement'
    | 'unmapped';
  target: string | null;
}

export interface GroupCoverage {
  auth: Record<string, number>;
  mapped: number;
  missing: number;
  module: string;
  responseSchemasMissing: number;
  responseSchemasMissingByAuth: Record<string, number>;
  total: number;
}

function normalizePath(path: string): string {
  const withoutQuery = path.split('?')[0] ?? path;
  const leadingSlash = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
  const templated = leadingSlash
    .replace(/:([A-Za-z0-9_]+)(?:\([^/]+\))?/g, '{$1}')
    .replace(/\*([A-Za-z0-9_]*)/g, (_match, name: string) => `{${name || 'wildcard'}}`);
  return templated.length > 1 ? templated.replace(/\/+$/, '') : templated;
}

export function operationKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${normalizePath(path)}`;
}

/** Parameter names differ between FastAPI snake_case and Nest camelCase. */
export function operationIdentityKey(method: string, path: string): string {
  return operationKey(method, path).replace(/\{[^/{}]+\}/g, '{}');
}

export function extractOpenApiOperations(openApi: CoverageInput['openApi']): OpenApiOperation[] {
  return Object.entries(openApi.paths ?? {}).flatMap(([path, pathItem]) =>
    Object.entries(pathItem).flatMap(([method, candidate]) => {
      if (!OPENAPI_METHODS.has(method) || candidate === null || typeof candidate !== 'object') {
        return [];
      }
      const raw = candidate as Record<string, unknown>;
      return [
        {
          method: method.toUpperCase(),
          path: normalizePath(path),
          operationId: typeof raw.operationId === 'string' ? raw.operationId : undefined,
          raw,
        },
      ];
    }),
  );
}

function duplicates(keys: string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) repeated.add(key);
    seen.add(key);
  }
  return [...repeated].sort();
}

function hasResponseSchema(operation: OpenApiOperation | undefined): boolean {
  if (!operation) return false;
  const responses = operation.raw.responses;
  if (!responses || typeof responses !== 'object') return false;
  return Object.entries(responses as Record<string, unknown>).some(([status, response]) => {
    if (!/^2\d\d$/.test(status) || !response || typeof response !== 'object') return false;
    if (status === '204') return true;
    const content = (response as Record<string, unknown>).content;
    if (!content || typeof content !== 'object') return false;
    return Object.values(content as Record<string, unknown>).some(
      (media) =>
        media !== null &&
        typeof media === 'object' &&
        'schema' in (media as Record<string, unknown>),
    );
  });
}

function declaresAuth(operation: OpenApiOperation): boolean {
  return Array.isArray(operation.raw.security) && operation.raw.security.length > 0;
}

function replacementFor(
  source: string,
  route: LegacyRoute,
  operationByIdentity: Map<string, OpenApiOperation>,
  operations: OpenApiOperation[],
  dispositions: CoverageInput['dispositions'],
): Pick<RouteMapping, 'strategy' | 'target'> {
  const exact = operationByIdentity.get(operationIdentityKey(route.method, route.path));
  if (exact) {
    return { strategy: 'compatibility', target: operationKey(exact.method, exact.path) };
  }

  const explicit = dispositions?.overrides?.[source];
  if (
    explicit?.disposition === 'implemented' &&
    explicit.replacement &&
    operationByIdentity.has(identityFromOperationKey(explicit.replacement))
  ) {
    const replacement = operationByIdentity.get(identityFromOperationKey(explicit.replacement));
    if (!replacement) throw new Error('Checked replacement unexpectedly disappeared');
    return {
      strategy: 'explicit-replacement',
      target: operationKey(replacement.method, replacement.path),
    };
  }

  if (route.path.startsWith('/api/v1/')) {
    const prefixed = operationByIdentity.get(
      operationIdentityKey(route.method, route.path.replace('/api/v1/', '/api/v2/')),
    );
    if (prefixed) {
      return {
        strategy: 'prefix-replacement',
        target: operationKey(prefixed.method, prefixed.path),
      };
    }
  }

  const compatibilityPattern = operations.find((candidate) =>
    parameterizedRouteMatches(route.method, route.path, candidate.method, candidate.path),
  );
  if (compatibilityPattern) {
    return {
      strategy: 'parameterized-consolidation',
      target: operationKey(compatibilityPattern.method, compatibilityPattern.path),
    };
  }
  if (route.path.startsWith('/api/v1/')) {
    const prefixedPath = route.path.replace('/api/v1/', '/api/v2/');
    const v2Pattern = operations.find((candidate) =>
      parameterizedRouteMatches(route.method, prefixedPath, candidate.method, candidate.path),
    );
    if (v2Pattern) {
      return {
        strategy: 'parameterized-consolidation',
        target: operationKey(v2Pattern.method, v2Pattern.path),
      };
    }
  }
  return { strategy: 'unmapped', target: null };
}

function identityFromOperationKey(key: string): string {
  const separator = key.indexOf(' ');
  if (separator < 1) return key;
  return operationIdentityKey(key.slice(0, separator), key.slice(separator + 1));
}

function parameterizedRouteMatches(
  sourceMethod: string,
  sourcePath: string,
  candidateMethod: string,
  candidatePath: string,
): boolean {
  if (sourceMethod.toUpperCase() !== candidateMethod.toUpperCase()) return false;
  const sourceSegments = normalizePath(sourcePath).split('/');
  const candidateSegments = normalizePath(candidatePath).split('/');
  if (sourceSegments.length !== candidateSegments.length) return false;
  let consolidatedLiteral = false;
  for (let index = 0; index < sourceSegments.length; index += 1) {
    const source = sourceSegments[index];
    const candidate = candidateSegments[index];
    if (source === candidate) continue;
    if (!candidate || !/^\{[^/{}]+\}$/.test(candidate)) return false;
    if (source && !/^\{[^/{}]+\}$/.test(source)) consolidatedLiteral = true;
  }
  return consolidatedLiteral;
}

function isInfrastructurePath(path: string): boolean {
  return INFRASTRUCTURE_PATHS.some((pattern) => pattern.test(path));
}

function groupMappings(legacyRoutes: LegacyRoute[], mappings: RouteMapping[]): GroupCoverage[] {
  const groups = new Map<string, GroupCoverage>();
  legacyRoutes.forEach((route, index) => {
    const module = route.router?.module ?? 'unknown';
    const current = groups.get(module) ?? {
      auth: {},
      mapped: 0,
      missing: 0,
      module,
      responseSchemasMissing: 0,
      responseSchemasMissingByAuth: {},
      total: 0,
    };
    const mapping = mappings[index];
    if (!mapping) throw new Error(`Internal coverage error: missing mapping at index ${index}`);
    const auth = route.authHint?.level ?? 'unknown';
    current.auth[auth] = (current.auth[auth] ?? 0) + 1;
    current.total += 1;
    if (mapping.target) current.mapped += 1;
    else current.missing += 1;
    if (route.protocol === 'http' && mapping.documented && !mapping.responseSchema) {
      current.responseSchemasMissing += 1;
      current.responseSchemasMissingByAuth[auth] =
        (current.responseSchemasMissingByAuth[auth] ?? 0) + 1;
    }
    groups.set(module, current);
  });
  return [...groups.values()].sort((left, right) => left.module.localeCompare(right.module));
}

export function analyzeApiCoverage(input: CoverageInput): ApiCoverageReport {
  const openApiOperations = extractOpenApiOperations(input.openApi);
  const runtimeHttp = input.runtime.http
    .filter((route) => !isInfrastructurePath(normalizePath(route.path)))
    .map((route) => ({
      ...route,
      method: route.method.toUpperCase(),
      path: normalizePath(route.path),
    }))
    .filter((route) => route.method !== 'OPTIONS');
  const runtimeKeys = runtimeHttp.map((route) => operationKey(route.method, route.path));
  const openApiByIdentity = new Map(
    openApiOperations.map((operation) => [
      operationIdentityKey(operation.method, operation.path),
      operation,
    ]),
  );
  const runtimeIdentitySet = new Set(
    runtimeHttp.map((route) => operationIdentityKey(route.method, route.path)),
  );

  const mappings: RouteMapping[] = input.legacy.routes.map((route) => {
    const source = operationKey(route.method, route.path);
    if (route.protocol === 'websocket') {
      const gateway = input.runtime.websocket.gateways.find(
        (candidate) =>
          candidate.path && normalizePath(candidate.path) === normalizePath(route.path),
      );
      return {
        authLevel: route.authHint?.level ?? 'unknown',
        documented: route.includeInSchema !== false,
        responseSchema: true,
        runtimeRegistered: Boolean(gateway && input.runtime.websocket.adapter),
        source,
        sourceFile: route.source?.file ?? null,
        strategy: gateway ? 'compatibility' : 'unmapped',
        target: gateway ? source : null,
      };
    }

    const replacement = replacementFor(
      source,
      route,
      openApiByIdentity,
      openApiOperations,
      input.dispositions,
    );
    const operation = replacement.target
      ? openApiByIdentity.get(identityFromOperationKey(replacement.target))
      : undefined;
    const isHiddenCompatibility =
      route.includeInSchema === false &&
      runtimeIdentitySet.has(operationIdentityKey(route.method, route.path));
    const runtimeRegistered = replacement.target
      ? runtimeIdentitySet.has(identityFromOperationKey(replacement.target))
      : isHiddenCompatibility;
    return {
      authLevel: route.authHint?.level ?? 'unknown',
      documented: Boolean(operation),
      responseSchema: route.includeInSchema === false ? true : hasResponseSchema(operation),
      runtimeRegistered,
      source,
      sourceFile: route.source?.file ?? null,
      strategy: isHiddenCompatibility ? 'compatibility' : replacement.strategy,
      target: isHiddenCompatibility ? source : replacement.target,
    };
  });

  const legacyHttp = input.legacy.routes.filter((route) => route.protocol === 'http');
  const legacyWs = input.legacy.routes.filter((route) => route.protocol === 'websocket');
  const httpMappings = mappings.filter(
    (_mapping, index) => input.legacy.routes[index]?.protocol === 'http',
  );
  const wsMappings = mappings.filter(
    (_mapping, index) => input.legacy.routes[index]?.protocol === 'websocket',
  );
  const missingHttp = httpMappings
    .filter((mapping) => !mapping.target || !mapping.runtimeRegistered)
    .map((mapping) => mapping.source)
    .sort();
  const missingWs = wsMappings
    .filter((mapping) => !mapping.target || !mapping.runtimeRegistered)
    .map((mapping) => mapping.source)
    .sort();

  const openApiWithoutRuntime = openApiOperations
    .filter(
      (operation) =>
        !runtimeIdentitySet.has(operationIdentityKey(operation.method, operation.path)),
    )
    .map((operation) => operationKey(operation.method, operation.path))
    .sort();
  const openApiIdentitySet = new Set(
    openApiOperations.map((operation) => operationIdentityKey(operation.method, operation.path)),
  );
  const hiddenLegacyKeys = new Set(
    input.legacy.routes
      .filter((route) => route.protocol === 'http' && route.includeInSchema === false)
      .map((route) => operationIdentityKey(route.method, route.path)),
  );
  const runtimeWithoutOpenApi = runtimeHttp
    .filter((route) => {
      const identity = operationIdentityKey(route.method, route.path);
      if (openApiIdentitySet.has(identity) || hiddenLegacyKeys.has(identity)) return false;
      if (
        route.method === 'HEAD' &&
        openApiIdentitySet.has(operationIdentityKey('GET', route.path))
      ) {
        return false;
      }
      return true;
    })
    .map((route) => operationKey(route.method, route.path))
    .sort();

  const operationsWithoutResponseSchema = openApiOperations
    .filter((operation) => !hasResponseSchema(operation))
    .map((operation) => operationKey(operation.method, operation.path))
    .sort();
  const operationsWithoutDeclaredAuth = openApiOperations
    .filter((operation) => !declaresAuth(operation))
    .map((operation) => operationKey(operation.method, operation.path))
    .sort();
  const consistency = {
    duplicateLegacy: duplicates(
      input.legacy.routes.map((route) => operationIdentityKey(route.method, route.path)),
    ),
    duplicateOpenApi: duplicates(
      openApiOperations.map((route) => operationIdentityKey(route.method, route.path)),
    ),
    duplicateRuntime: duplicates(
      runtimeHttp.map((route) => operationIdentityKey(route.method, route.path)),
    ),
    openApiWithoutRuntime,
    runtimeWithoutOpenApi,
  };
  const failures: string[] = [];
  if (legacyHttp.length !== input.legacy.counts.http) {
    failures.push(
      `legacy HTTP count is ${legacyHttp.length}, expected ${input.legacy.counts.http}`,
    );
  }
  if (legacyWs.length !== input.legacy.counts.websocket) {
    failures.push(
      `legacy WebSocket count is ${legacyWs.length}, expected ${input.legacy.counts.websocket}`,
    );
  }
  if (missingHttp.length)
    failures.push(`${missingHttp.length} legacy HTTP operations are unmapped`);
  if (missingWs.length)
    failures.push(`${missingWs.length} legacy WebSocket operations are unverified`);
  if (consistency.duplicateLegacy.length)
    failures.push('legacy inventory contains duplicate operations');
  if (consistency.duplicateOpenApi.length) failures.push('OpenAPI contains duplicate operations');
  if (consistency.duplicateRuntime.length) failures.push('runtime contains duplicate operations');
  if (openApiWithoutRuntime.length)
    failures.push(`${openApiWithoutRuntime.length} OpenAPI operations lack runtime handlers`);
  if (runtimeWithoutOpenApi.length)
    failures.push(
      `${runtimeWithoutOpenApi.length} runtime API handlers are unknown to the contract`,
    );

  return {
    schemaVersion: 1,
    baseline: { http: input.legacy.counts.http, websocket: input.legacy.counts.websocket },
    runtime: {
      documentedHttp: openApiOperations.length,
      registeredHttp: new Set(runtimeKeys).size,
      websocketAdapter: input.runtime.websocket.adapter,
      websocketGateways: input.runtime.websocket.gateways.length,
    },
    coverage: {
      http: {
        mapped: legacyHttp.length - missingHttp.length,
        missing: missingHttp,
        total: legacyHttp.length,
      },
      websocket: {
        mapped: legacyWs.length - missingWs.length,
        missing: missingWs,
        total: legacyWs.length,
      },
    },
    mappings,
    groups: groupMappings(input.legacy.routes, mappings),
    consistency,
    quality: {
      operationsWithoutDeclaredAuth,
      operationsWithoutResponseSchema,
      semanticSignals: input.semanticSignals ?? [],
      semanticVerification: 'manual-review-required',
    },
    verdict: {
      structurallyComplete: failures.length === 0,
      semanticComplete: false,
      failures,
    },
  };
}

interface FastifyRouteOptions {
  method: string | string[];
  url: string;
}

interface NestInternalWrapper {
  instance?: object;
  metatype?: object;
}

interface NestInternalModule {
  providers?: Map<unknown, NestInternalWrapper>;
}

function inspectWebSocketRuntime(app: NestFastifyApplication): RuntimeInventory['websocket'] {
  const internal = app as unknown as {
    config?: { getIoAdapter?: () => object | undefined };
    container?: { getModules?: () => Map<unknown, NestInternalModule> };
  };
  const adapter = internal.config?.getIoAdapter?.();
  const gateways: RuntimeWebSocketGateway[] = [];
  const modules = internal.container?.getModules?.();
  for (const module of modules?.values() ?? []) {
    for (const wrapper of module.providers?.values() ?? []) {
      const instance = wrapper.instance;
      const constructor = instance?.constructor ?? wrapper.metatype;
      if (!constructor || !Reflect.getMetadata('websockets:is_gateway', constructor)) continue;
      const options = Reflect.getMetadata('websockets:gateway_options', constructor) as
        Record<string, unknown> | undefined;
      const prototype = instance ? Object.getPrototypeOf(instance) : undefined;
      const messageHandlers = prototype
        ? Object.getOwnPropertyNames(prototype).filter((property) => {
            const descriptor = Object.getOwnPropertyDescriptor(prototype, property);
            return (
              typeof descriptor?.value === 'function' &&
              Boolean(Reflect.getMetadata('websockets:message_mapping', descriptor.value))
            );
          })
        : [];
      gateways.push({
        className:
          typeof (constructor as { name?: unknown }).name === 'string'
            ? (constructor as { name: string }).name
            : 'AnonymousGateway',
        messageHandlers: messageHandlers.sort(),
        path: typeof options?.path === 'string' ? normalizePath(options.path) : null,
      });
    }
  }
  return {
    adapter: adapter?.constructor.name ?? null,
    gateways: gateways.sort((left, right) => left.className.localeCompare(right.className)),
  };
}

export async function collectRuntimeInventory(
  app: NestFastifyApplication,
): Promise<RuntimeInventory> {
  const routes: RuntimeHttpOperation[] = [];
  const fastify = app.getHttpAdapter().getInstance();
  fastify.addHook('onRoute', (route: FastifyRouteOptions) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) routes.push({ method, path: normalizePath(route.url) });
  });
  await app.init();
  await fastify.ready();
  return {
    http: routes.sort((left, right) =>
      operationKey(left.method, left.path).localeCompare(operationKey(right.method, right.path)),
    ),
    websocket: inspectWebSocketRuntime(app),
  };
}

async function walkTypeScriptFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) files.push(...(await walkTypeScriptFiles(path)));
    else if (extname(entry.name) === '.ts') files.push(path);
  }
  return files;
}

export async function scanSemanticSignals(sourceRoot: string): Promise<SemanticSignal[]> {
  const signals: SemanticSignal[] = [];
  const notImplemented =
    /NotImplementedException|HttpStatus\.NOT_IMPLEMENTED|(?:status|statusCode)\s*[:=(]\s*501|throw new Error\([^\n]*not implemented/i;
  const placeholder =
    /^\s*return\s+(?:Promise\.resolve\()?\s*(?:null|undefined|\[\]|\{\}|['"](?:todo|placeholder)['"])\s*\)?\s*;\s*$/i;
  for (const file of await walkTypeScriptFiles(sourceRoot)) {
    const content = await readFile(file, 'utf8');
    content.split('\n').forEach((line, index) => {
      const kind = notImplemented.test(line)
        ? 'not-implemented'
        : /controllers?\.ts$/.test(file) && placeholder.test(line)
          ? 'constant-placeholder'
          : null;
      if (kind) {
        signals.push({
          file: relative(dirname(sourceRoot), file),
          kind,
          line: index + 1,
          sample: line.trim().slice(0, 160),
        });
      }
    });
  }
  return signals.sort((left, right) =>
    `${left.file}:${left.line}`.localeCompare(`${right.file}:${right.line}`),
  );
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

async function renderCoverage(): Promise<string> {
  const root = process.cwd();
  const [{ createApiApp, createOpenApiDocument }, legacyText, dispositionsText] = await Promise.all(
    [
      import('../src/app.js'),
      readFile(resolve(root, 'contracts/legacy-v1-endpoints.json'), 'utf8'),
      readFile(resolve(root, 'contracts/legacy-v1-dispositions.json'), 'utf8'),
    ],
  );
  const app = await createApiApp({
    environment: {
      APP_ENV: 'test',
      API_DOCS_ENABLED: 'false',
      COMPATIBILITY_V1_ENABLED: 'true',
      LOG_LEVEL: 'silent',
      MARKET_INGEST_ENABLED: 'false',
      QUEUE_ENABLED: 'false',
      REDIS_ENABLED: 'false',
    },
    logger: false,
  });
  try {
    const runtime = await collectRuntimeInventory(app);
    const report = analyzeApiCoverage({
      dispositions: JSON.parse(dispositionsText) as CoverageInput['dispositions'],
      legacy: JSON.parse(legacyText) as LegacyContract,
      openApi: createOpenApiDocument(app) as unknown as CoverageInput['openApi'],
      runtime,
      semanticSignals: await scanSemanticSignals(resolve(root, 'src')),
    });
    return `${JSON.stringify(canonicalize(report), null, 2)}\n`;
  } finally {
    await app.close();
  }
}

async function main(): Promise<void> {
  const output = resolve(process.cwd(), 'contracts/api-coverage.json');
  const rendered = await renderCoverage();
  const report = JSON.parse(rendered) as ApiCoverageReport;
  const counts = `HTTP ${report.coverage.http.mapped}/${report.coverage.http.total}; WebSocket ${report.coverage.websocket.mapped}/${report.coverage.websocket.total}; runtime ${report.runtime.registeredHttp}; OpenAPI ${report.runtime.documentedHttp}`;
  if (process.argv.includes('--check')) {
    let current: string;
    try {
      current = await readFile(output, 'utf8');
    } catch {
      console.error(`API coverage snapshot is missing (${counts})`);
      process.exitCode = 1;
      return;
    }
    if (current !== rendered) {
      console.error(`API coverage snapshot is stale (${counts})`);
      process.exitCode = 1;
      return;
    }
    if (!report.verdict.structurallyComplete) {
      console.error(
        `API coverage is incomplete (${counts}): ${report.verdict.failures.join('; ')}`,
      );
      process.exitCode = 1;
      return;
    }
    console.log(`API route coverage is structurally complete (${counts})`);
    console.log(
      'Semantic completion is intentionally not inferred from route coverage; manual review is required.',
    );
    return;
  }
  await writeFile(output, rendered, 'utf8');
  console.log(`wrote ${output} (${counts})`);
  if (!report.verdict.structurallyComplete) process.exitCode = 1;
}

const executedFile = process.argv[1] ? resolve(process.argv[1]) : '';
if (executedFile === fileURLToPath(import.meta.url)) await main();
