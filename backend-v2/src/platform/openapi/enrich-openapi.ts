import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { MetadataScanner, ModulesContainer } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type {
  OpenAPIObject,
  OperationObject,
  ReferenceObject,
  ResponseObject,
  SchemaObject,
} from '@nestjs/swagger';

import legacyOpenApiJson from '../../../contracts/legacy-openapi.json' with { type: 'json' };
import {
  AUTH_PREMIUM_KEY,
  AUTH_PUBLIC_KEY,
  AUTH_ROLES_KEY,
} from '../../modules/auth/auth.decorators.js';
import type { UserRole } from '../../modules/auth/auth.types.js';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];
type JsonRecord = Record<string, unknown>;

type LegacyDocument = {
  paths?: Record<string, Record<string, unknown>>;
  components?: { schemas?: Record<string, unknown> };
};

type RouteMetadata = {
  handler: object;
  method: HttpMethod;
  path: string;
  isPublic: boolean;
  roles: UserRole[];
  premium: boolean;
};

type ExtendedOperation = OperationObject & {
  'x-auth-level'?: string;
  'x-required-roles'?: UserRole[];
  'x-response-schema-status'?:
    'explicit' | 'no-content' | 'legacy-mapped' | 'v2-declared' | 'untyped';
  'x-response-schema-note'?: string;
};

type QualitySummary = {
  operations: number;
  responseSchemas: number;
  noContentResponses: number;
  untypedResponses: number;
  publicOperations: number;
  authenticatedOperations: number;
};

const legacyDocument = legacyOpenApiJson as unknown as LegacyDocument;

/**
 * Add security and response metadata that Swagger cannot infer from global
 * guards or TypeScript return types. The function mutates and returns document.
 * It never changes runtime authorization behavior.
 */
export function enrichOpenApiDocument(
  app: NestFastifyApplication,
  document: OpenAPIObject,
): OpenAPIObject {
  installComponents(document);
  applyV2RequestMetadata(document);
  normalizeAnonymousRuntimeSchemas(document);
  normalizeOpenApi30SchemaKeywords(document);
  const routes = discoverRoutes(app);
  const routesByHandler = groupRoutesByHandler(routes);

  for (const route of routes) {
    const operation = operationAt(document, route.path, route.method);
    if (!operation) continue;
    applySecurity(operation, route);
    applyGlobalErrors(operation, route.path, route);

    if (hasSuccessSchema(operation)) {
      operation['x-response-schema-status'] ??= 'explicit';
      continue;
    }
    if (hasNoContentSuccess(operation)) {
      operation['x-response-schema-status'] = 'no-content';
      continue;
    }
    if (isVerifiedEmptyBody(route)) {
      markEmptySuccess(operation);
      operation['x-response-schema-status'] = 'no-content';
      continue;
    }
    if (applySpecialSuccessResponse(operation, route)) {
      operation['x-response-schema-status'] = 'v2-declared';
      continue;
    }

    const responseSchema = responseSchemaForRoute(route, routesByHandler);
    if (responseSchema) {
      setSuccessSchema(operation, responseSchema.schema);
      operation['x-response-schema-status'] = responseSchema.status;
      continue;
    }

    operation['x-response-schema-status'] = 'untyped';
    operation['x-response-schema-note'] =
      'Handler return type has no verified runtime OpenAPI schema; no generic object was invented.';
  }

  const operationIds = new Map<
    string,
    Array<{ operation: OperationObject; method: string; path: string }>
  >();
  for (const [path, item] of Object.entries(document.paths)) {
    for (const method of HTTP_METHODS) {
      const operation = item?.[method];
      if (operation?.operationId)
        operationIds.set(operation.operationId, [
          ...(operationIds.get(operation.operationId) ?? []),
          { operation, method, path },
        ]);
    }
  }
  for (const [id, operations] of operationIds) {
    if (operations.length < 2) continue;
    for (const { operation, method, path } of operations) {
      operation.operationId = `${id}_${method}_${path.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '')}`;
    }
  }
  const quality = summarizeQuality(document);
  (document as OpenAPIObject & { 'x-metadata-quality'?: QualitySummary })['x-metadata-quality'] =
    quality;
  document.info.description =
    `${document.info.description ?? ''}\n\nOpenAPI metadata coverage: ${quality.responseSchemas} typed response bodies, ${quality.noContentResponses} verified empty responses, ${quality.untypedResponses} untyped operations.`.trim();
  return document;
}

/**
 * Nest's Standard Schema mapper emits z.json() as a recursive `__schemaN`
 * component. That anonymous name is unstable and the OpenAPI reference parser
 * used by our client generator cannot inventory its self-reference. z.json()
 * has exactly the same domain as the stable JsonValue component installed by
 * this module, so redirecting those refs is semantics-preserving.
 */
function normalizeAnonymousRuntimeSchemas(document: OpenAPIObject): void {
  const schemas = document.components?.schemas;
  if (schemas) {
    for (const [name, schema] of Object.entries(schemas)) {
      if (!/^__schema\d+$/.test(name) || !isRecursiveJsonSchema(name, schema)) continue;
      rewriteReferenceInPlace(
        document,
        `#/components/schemas/${name}`,
        '#/components/schemas/JsonValue',
      );
      delete schemas[name];
    }
  }
  normalizeInlineJsonDefinitions(document);
}

function isRecursiveJsonSchema(name: string, value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const serialized = JSON.stringify(value);
  return (
    serialized.includes(`#/components/schemas/${name}`) &&
    serialized.includes('"type":"array"') &&
    serialized.includes('"type":"object"') &&
    serialized.includes('"type":"string"') &&
    serialized.includes('"type":"number"') &&
    serialized.includes('"type":"boolean"')
  );
}

function rewriteReferenceInPlace(value: unknown, from: string, to: string): void {
  if (Array.isArray(value)) {
    value.forEach((item) => rewriteReferenceInPlace(item, from, to));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value as JsonRecord)) {
    if (key === '$ref' && item === from) (value as JsonRecord)[key] = to;
    else rewriteReferenceInPlace(item, from, to);
  }
}

function normalizeInlineJsonDefinitions(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(normalizeInlineJsonDefinitions);
    return;
  }
  if (!value || typeof value !== 'object') return;
  const record = value as JsonRecord;
  const definitions = record.definitions;
  if (definitions && typeof definitions === 'object') {
    const definitionRecord = definitions as JsonRecord;
    for (const [name, schema] of Object.entries(definitionRecord)) {
      if (
        !/^__schema\d+$/.test(name) ||
        !schema ||
        typeof schema !== 'object' ||
        !JSON.stringify(schema).includes(`#/definitions/${name}`)
      )
        continue;
      rewriteReferenceInPlace(record, `#/definitions/${name}`, '#/components/schemas/JsonValue');
      delete definitionRecord[name];
    }
    if (Object.keys(definitionRecord).length === 0) delete record.definitions;
  }
  Object.values(record).forEach(normalizeInlineJsonDefinitions);
}

/** Convert JSON Schema 2020-12 keywords from the FastAPI baseline to OAS 3.0. */
function normalizeOpenApi30SchemaKeywords(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(normalizeOpenApi30SchemaKeywords);
    return;
  }
  if (!value || typeof value !== 'object') return;
  const record = value as JsonRecord;
  if (record.type === 'null') {
    record.type = 'string';
    record.nullable = true;
    record.enum = [null];
  }
  if ('const' in record) {
    record.enum = [record.const];
    delete record.const;
  }
  if (typeof record.exclusiveMinimum === 'number') {
    record.minimum = record.exclusiveMinimum;
    record.exclusiveMinimum = true;
  }
  if (typeof record.exclusiveMaximum === 'number') {
    record.maximum = record.exclusiveMaximum;
    record.exclusiveMaximum = true;
  }
  if (record.type === 'string' && typeof record.contentMediaType === 'string') {
    record.format ??= 'binary';
    delete record.contentMediaType;
  }
  Object.values(record).forEach(normalizeOpenApi30SchemaKeywords);
}

export function summarizeOpenApiMetadata(document: OpenAPIObject): QualitySummary {
  return summarizeQuality(document);
}

function discoverRoutes(app: NestFastifyApplication): RouteMetadata[] {
  const modules = app.get(ModulesContainer);
  const scanner = new MetadataScanner();
  const routes: RouteMetadata[] = [];

  for (const moduleRef of modules.values()) {
    for (const wrapper of moduleRef.controllers.values()) {
      const controller = wrapper.metatype;
      const instance = wrapper.instance as object | null;
      if (!controller || !instance) continue;
      const prototype = Object.getPrototypeOf(instance) as object | null;
      if (!prototype) continue;

      const controllerPaths = metadataPaths(Reflect.getMetadata(PATH_METADATA, controller));
      for (const methodName of scanner.getAllMethodNames(prototype)) {
        const handler = Reflect.get(prototype, methodName) as unknown;
        if (typeof handler !== 'function') continue;
        const requestMethod = Reflect.getMetadata(METHOD_METADATA, handler) as
          RequestMethod | undefined;
        const method = toHttpMethod(requestMethod);
        if (!method) continue;
        const methodPaths = metadataPaths(Reflect.getMetadata(PATH_METADATA, handler));
        const isPublic = metadataOverride<boolean>(AUTH_PUBLIC_KEY, handler, controller) === true;
        const roles = metadataOverride<UserRole[]>(AUTH_ROLES_KEY, handler, controller) ?? [];
        const premium = metadataOverride<boolean>(AUTH_PREMIUM_KEY, handler, controller) === true;

        for (const controllerPath of controllerPaths) {
          for (const methodPath of methodPaths) {
            routes.push({
              handler,
              method,
              path: normalizePath(joinPaths(controllerPath, methodPath)),
              isPublic,
              roles,
              premium,
            });
          }
        }
      }
    }
  }
  return routes;
}

function metadataOverride<T>(key: string, handler: object, controller: object): T | undefined {
  const handlerValue = Reflect.getMetadata(key, handler) as T | undefined;
  return handlerValue === undefined
    ? (Reflect.getMetadata(key, controller) as T | undefined)
    : handlerValue;
}

function metadataPaths(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) {
    const paths = value.filter((item): item is string => typeof item === 'string');
    return paths.length ? paths : [''];
  }
  if (value && typeof value === 'object' && 'path' in value) {
    return metadataPaths((value as { path?: unknown }).path);
  }
  return [''];
}

function toHttpMethod(value: RequestMethod | undefined): HttpMethod | undefined {
  const mapping: Partial<Record<RequestMethod, HttpMethod>> = {
    [RequestMethod.GET]: 'get',
    [RequestMethod.POST]: 'post',
    [RequestMethod.PUT]: 'put',
    [RequestMethod.PATCH]: 'patch',
    [RequestMethod.DELETE]: 'delete',
    [RequestMethod.HEAD]: 'head',
    [RequestMethod.OPTIONS]: 'options',
  };
  return value === undefined ? undefined : mapping[value];
}

function joinPaths(left: string, right: string): string {
  return `${left}/${right}`;
}

function normalizePath(path: string): string {
  const normalized = `/${path}`
    .replace(/\/+/g, '/')
    .replace(/:([A-Za-z0-9_]+)(?:\([^)]*\))?\??/g, '{$1}')
    .replace(/\/$/, '');
  return normalized || '/';
}

function shapeOf(path: string): string {
  return normalizePath(path).replace(/\{[^}]+\}/g, '{}');
}

function operationAt(
  document: OpenAPIObject,
  path: string,
  method: HttpMethod,
): ExtendedOperation | undefined {
  return document.paths[path]?.[method] as ExtendedOperation | undefined;
}

function applySecurity(operation: ExtendedOperation, route: RouteMetadata): void {
  if (route.isPublic) {
    operation.security = [];
    operation['x-auth-level'] = 'public';
    return;
  }
  operation.security = [{ bearer: [] }];
  if (route.roles.length) {
    operation['x-auth-level'] = `roles:${route.roles.join(',')}`;
    operation['x-required-roles'] = [...route.roles];
  } else if (route.premium) {
    operation['x-auth-level'] = 'premium';
  } else {
    operation['x-auth-level'] = 'authenticated';
  }
}

function applyGlobalErrors(operation: ExtendedOperation, path: string, route: RouteMetadata): void {
  operation.responses ??= {};
  const schema = path.startsWith('/api/v1/') ? ref('LegacyApiError') : ref('ApiErrorV2');
  addResponse(operation, '400', 'Bad request', schema);
  addResponse(operation, '422', 'Request validation failed', schema);
  addResponse(operation, '429', 'Rate limit exceeded', schema);
  addResponse(operation, '503', 'Service temporarily unavailable', schema);
  if (!route.isPublic) addResponse(operation, '401', 'Authentication required', schema);
  if (!route.isPublic && (route.roles.length > 0 || route.premium)) {
    addResponse(operation, '403', 'Insufficient role or entitlement', schema);
  }
}

function addResponse(
  operation: ExtendedOperation,
  status: string,
  description: string,
  schema: ReferenceObject,
): void {
  if (operation.responses[status]) return;
  operation.responses[status] = {
    description,
    content: { 'application/json': { schema } },
  };
}

function hasSuccessSchema(operation: ExtendedOperation): boolean {
  return Object.entries(operation.responses ?? {}).some(
    ([status, response]) =>
      status.startsWith('2') && response !== undefined && responseHasSchema(response),
  );
}

function responseHasSchema(response: ResponseObject | ReferenceObject): boolean {
  if ('$ref' in response) return true;
  return Object.values(response.content ?? {}).some((media) => Boolean(media.schema));
}

function hasNoContentSuccess(operation: ExtendedOperation): boolean {
  return Object.entries(operation.responses ?? {}).some(
    ([status, response]) =>
      status === '204' && response !== undefined && !('$ref' in response) && !response.content,
  );
}

function isVerifiedEmptyBody(route: RouteMetadata): boolean {
  return (
    route.method === 'delete' && /^\/api\/v[12]\/cap5\/watchlist\/\{symbol\}$/.test(route.path)
  );
}

function markEmptySuccess(operation: ExtendedOperation): void {
  operation.responses ??= {};
  const status = Object.keys(operation.responses).find((item) => item.startsWith('2')) ?? '200';
  operation.responses[status] = {
    description: 'Successful operation with an empty response body',
  };
}

function applySpecialSuccessResponse(operation: ExtendedOperation, route: RouteMetadata): boolean {
  if (route.method === 'get' && /\/auth\/(?:verify-email|reset-password)$/.test(route.path)) {
    setSuccessMediaSchema(operation, 'text/html', { type: 'string' });
    return true;
  }
  if (route.method === 'get' && route.path.endsWith('/admin/audit/export')) {
    setSuccessMediaSchema(operation, 'text/csv', { type: 'string' });
    return true;
  }
  if (route.method === 'get' && route.path === '/api/v2/media/{token}') {
    const binary: SchemaObject = { type: 'string', format: 'binary' };
    setSuccessMediaSchema(operation, 'application/octet-stream', binary);
    operation.responses['206'] ??= {
      description: 'Requested byte range',
      content: { 'application/octet-stream': { schema: binary } },
    };
    operation.responses['416'] ??= {
      description: 'Requested byte range is not satisfiable',
      headers: {
        'Content-Range': {
          description: 'The valid byte range for the resource.',
          schema: { type: 'string', example: 'bytes */1024' },
        },
      },
    };
    return true;
  }
  return false;
}

/**
 * Nest cannot infer request bodies from Fastify's raw multipart request or
 * from the intentionally provider-shaped screening payload. Keep these
 * request contracts here so generated clients see the fields the frontend
 * actually sends while provider responses remain extensible JSON values.
 */
function applyV2RequestMetadata(document: OpenAPIObject): void {
  const query = (
    path: string,
    fields: Record<string, SchemaObject>,
    method: HttpMethod = 'get',
  ) => {
    const operation = document.paths[path]?.[method] as OperationObject | undefined;
    if (!operation) return;
    const existing = operation.parameters ?? [];
    for (const [name, schema] of Object.entries(fields)) {
      const current = existing.find(
        (parameter) =>
          !('$ref' in parameter) && parameter.in === 'query' && parameter.name === name,
      );
      if (current && !('$ref' in current)) current.schema = schema;
      else existing.push({ in: 'query', name, required: false, schema });
    }
    operation.parameters = existing;
  };
  const str = (enumValues?: string[]): SchemaObject => ({
    type: 'string',
    ...(enumValues ? { enum: enumValues } : {}),
  });
  const int = (defaultValue?: number, minimum?: number, maximum?: number): SchemaObject => ({
    type: 'integer',
    ...(defaultValue === undefined ? {} : { default: defaultValue }),
    ...(minimum === undefined ? {} : { minimum }),
    ...(maximum === undefined ? {} : { maximum }),
  });
  query('/api/v2/market-data/overview/market-index', { symbols: str() });
  for (const path of [
    '/api/v2/market-data/overview/foreign',
    '/api/v2/market-data/overview/foreign/top',
  ]) {
    query(path, {
      group: str(['ALL', 'HOSE', 'HNX', 'UPCOM']),
      time_frame: str(['ONE_DAY', 'ONE_WEEK', 'ONE_MONTH', 'YTD', 'ONE_YEAR']),
      from_ts: int(),
      to_ts: int(),
    });
  }
  query('/api/v2/market-data/news/ai', {
    kind: str(['business', 'topic', 'exchange']),
    page: int(1, 1),
    page_size: int(20, 1, 99),
    ticker: str(),
    industry: str(),
    topic: str(),
    source: str(),
    sentiment: str(),
    update_from: str(),
    update_to: str(),
  });
  query('/api/v2/market-data/macro/economy/{indicator}', {
    start_year: int(),
    end_year: int(),
    period: str(),
  });
  query('/api/v2/market-data/global/crypto/{symbol}/ohlc', { interval: str(), limit: int() });
  query('/api/v2/market-data/global/crypto/{symbol}/depth', { limit: int() });
  const screening = document.paths['/api/v2/market-data/screening/search']?.post as
    (OperationObject & { requestBody?: Record<string, unknown> }) | undefined;
  if (screening) {
    screening.requestBody = {
      required: true,
      content: {
        'application/json': { schema: ref('ScreeningRequest') },
      },
    };
  }
  for (const path of [
    '/api/v2/admin/lessons/courses/{courseId}/thumbnail',
    '/api/v2/admin/lessons/episodes/{episodeId}/file',
  ]) {
    const operation = document.paths[path]?.post as
      (OperationObject & { requestBody?: Record<string, unknown> }) | undefined;
    if (!operation) continue;
    operation.requestBody = {
      required: true,
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            required: ['file'],
            additionalProperties: false,
            properties: { file: { type: 'string', format: 'binary' } },
          },
        },
      },
    };
  }
}

function setSuccessMediaSchema(
  operation: ExtendedOperation,
  mediaType: string,
  schema: SchemaObject,
): void {
  operation.responses ??= {};
  const successStatus =
    Object.keys(operation.responses).find((status) => status.startsWith('2')) ?? '200';
  const current = operation.responses[successStatus];
  if (!current || '$ref' in current) {
    operation.responses[successStatus] = {
      description: 'Success',
      content: { [mediaType]: { schema } },
    };
    return;
  }
  current.content ??= {};
  current.content[mediaType] = { schema };
}

function setSuccessSchema(
  operation: ExtendedOperation,
  schema: SchemaObject | ReferenceObject,
): void {
  operation.responses ??= {};
  const successStatus =
    Object.keys(operation.responses).find((status) => status.startsWith('2')) ?? '200';
  const current = operation.responses[successStatus];
  if (!current || '$ref' in current) {
    operation.responses[successStatus] = {
      description: current ? 'Successful response' : 'Success',
      content: { 'application/json': { schema } },
    };
    return;
  }
  current.content ??= {};
  current.content['application/json'] ??= {};
  current.content['application/json'].schema = schema;
}

function responseSchemaForRoute(
  route: RouteMetadata,
  routesByHandler: Map<object, RouteMetadata[]>,
):
  | {
      schema: SchemaObject | ReferenceObject;
      status: 'legacy-mapped' | 'v2-declared';
    }
  | undefined {
  const localSchema = verifiedLocalResponseSchema(route.path, route.method);
  if (localSchema) return { schema: localSchema, status: 'v2-declared' };

  const reportSchema = unifiedReportSchema(route.path, route.method);
  if (reportSchema) return { schema: reportSchema, status: 'v2-declared' };

  const direct = legacyResponseSchema(route.path, route.method);
  if (direct) return { schema: direct, status: 'legacy-mapped' };

  // A controller declared with both /v1 and /v2 prefixes executes the exact
  // same handler and therefore returns the same shape. Separate v2 adapters
  // are intentionally not inferred from similarly named legacy routes.
  const sibling = routesByHandler
    .get(route.handler)
    ?.filter((candidate) => candidate.path.startsWith('/api/v1/'))
    .map((candidate) => legacyResponseSchema(candidate.path, candidate.method))
    .find((schema): schema is SchemaObject | ReferenceObject => schema !== undefined);
  return sibling ? { schema: sibling, status: 'legacy-mapped' } : undefined;
}

function groupRoutesByHandler(routes: RouteMetadata[]): Map<object, RouteMetadata[]> {
  const result = new Map<object, RouteMetadata[]>();
  for (const route of routes) {
    const grouped = result.get(route.handler) ?? [];
    grouped.push(route);
    result.set(route.handler, grouped);
  }
  return result;
}

function legacyResponseSchema(
  path: string,
  method: HttpMethod,
): SchemaObject | ReferenceObject | undefined {
  if (!path.startsWith('/api/v1/')) return undefined;
  const paths = legacyDocument.paths ?? {};
  const matchingPath = Object.keys(paths).find((candidate) => shapeOf(candidate) === shapeOf(path));
  if (!matchingPath) return undefined;
  const operation = paths[matchingPath]?.[method];
  if (!operation || typeof operation !== 'object') return undefined;
  const responses = (operation as JsonRecord).responses;
  if (!responses || typeof responses !== 'object') return undefined;
  for (const [status, response] of Object.entries(responses as JsonRecord)) {
    if (!status.startsWith('2') || !response || typeof response !== 'object') continue;
    const content = (response as JsonRecord).content;
    if (!content || typeof content !== 'object') continue;
    const json = (content as JsonRecord)['application/json'];
    if (!json || typeof json !== 'object') continue;
    const schema = (json as JsonRecord).schema;
    if (schema && typeof schema === 'object') {
      return rewriteLegacyRefs(schema) as SchemaObject | ReferenceObject;
    }
  }
  return undefined;
}

/** Schemas verified directly against local controller/service return values. */
function verifiedLocalResponseSchema(
  path: string,
  method: HttpMethod,
): SchemaObject | ReferenceObject | undefined {
  if (/^\/api\/v[12]\/admin\/system\/status$/.test(path) && method === 'get')
    return ref('AdminSystemStatusV2');
  if (/^\/api\/v[12]\/admin\/system\/jobs\/\{jobId\}\/run$/.test(path) && method === 'post')
    return ref('AdminJobQueuedV2');
  if (/^\/api\/v[12]\/market-data\/screening\/search$/.test(path) && method === 'post') {
    return ref('MarketScreeningResponse');
  }
  if (/^\/api\/v[12]\/market-data\/trading\/price-board$/.test(path) && method === 'post') {
    return ref('MarketPriceBoardResponse');
  }
  if (/^\/api\/v[12]\/market-data\/news\/ai$/.test(path) && method === 'get') {
    return ref('AiNewsResponse');
  }
  if (/^\/api\/v[12]\/market-data\/news\/ai\/detail\/\{slug\}$/.test(path) && method === 'get') {
    return ref('AiNewsDetailResponse');
  }
  if (/^\/api\/v[12]\/market-data\/news\/ai\/audio\/\{newsId\}$/.test(path) && method === 'get') {
    return ref('AiNewsAudioResponse');
  }
  if (
    /^\/api\/v[12]\/market-data\/(?:overview|reference|sectors|screening|macro|funds|news|sheets|global)(?:\/|$)/.test(
      path,
    )
  ) {
    return ref('MarketProviderEnvelope');
  }
  if (/^\/api\/v[12]\/admin\/vt\/accounts$/.test(path) && method === 'get') {
    return ref('AdminVtAccountPage');
  }
  if (
    /^\/api\/v[12]\/(?:admin\/vt\/accounts\/\{accountId\}\/reset|admin\/vt\/reset-all|virtual-trading\/admin\/users\/\{userId\}\/reset|virtual-trading\/admin\/reset-all)$/.test(
      path,
    ) &&
    method === 'post'
  ) {
    return ref('AdminVtResetResult');
  }
  if (
    /^\/api\/v[12]\/(?:admin\/vt|virtual-trading\/admin)\/config$/.test(path) &&
    (method === 'get' || method === 'patch')
  ) {
    return ref('AdminVtConfig');
  }
  if (/^\/api\/v[12]\/virtual-trading\/ledger$/.test(path) && method === 'get') {
    return ref('TradingLedgerPage');
  }
  if (/^\/api\/v[12]\/admin\/alerts\/factor-library$/.test(path) && method === 'get') {
    return ref('AlertFactorLibrary');
  }
  if (/^\/api\/v[12]\/admin\/alerts\/signals\/\{key\}$/.test(path) && method === 'delete') {
    return ref('DeletedResult');
  }
  if (/^\/api\/v[12]\/admin\/alerts\/telegram\/webhook$/.test(path) && method === 'post') {
    return ref('TelegramWebhookResult');
  }
  if (path === '/api/v2/watchlists' && method === 'get') return ref('WatchlistPageV2');
  if (path === '/api/v2/watchlists' && method === 'post') return ref('WatchlistItemResponseV2');
  if (path === '/api/v2/watchlists/reorder' && method === 'put') {
    return ref('WatchlistReorderResponseV2');
  }
  if (path === '/api/v2/watchlists/{symbol}/status' && method === 'get') {
    return ref('WatchlistStatusResponseV2');
  }
  if (/^\/api\/v2\/chart-drawings\/\{symbol\}$/.test(path) && ['get', 'put'].includes(method)) {
    return ref('ChartDrawingResponseV2');
  }
  if (/^\/api\/v2\/portfolio-manager\/(?:analyze|report)$/.test(path)) {
    return ref('PortfolioReport');
  }
  if (/^\/api\/v[12]\/ai\/forecast\/ranking$/.test(path) && method === 'get') {
    return ref('ForecastRanking');
  }
  if (/^\/api\/v[12]\/ai\/forecast\/symbols\/\{symbol\}$/.test(path) && method === 'get') {
    return ref('ForecastSymbol');
  }
  if (/^\/api\/v[12]\/ai\/patterns\/(?:candles|charts)$/.test(path) && method === 'get') {
    return ref('PatternResults');
  }
  if (/^\/api\/v[12]\/ai\/patterns\/\{kind\}\/symbols$/.test(path) && method === 'get') {
    return ref('PatternSymbols');
  }
  if (/^\/api\/v[12]\/ai\/dashboard\/analyze$/.test(path) && method === 'post') {
    return ref('AiTextAnalysis');
  }
  if (/^\/api\/v[12]\/ai\/industry\/analyze$/.test(path) && method === 'post') {
    return ref('AiIndustryAnalysis');
  }
  if (/^\/api\/v[12]\/ai\/industry\/analyze-batch$/.test(path) && method === 'post') {
    return ref('AiIndustryBatch');
  }
  if (/^\/api\/v[12]\/ai\/insight\/analyze$/.test(path) && method === 'post') {
    return ref('AiInsight');
  }
  if (/^\/api\/v[12]\/ai\/insight\/\{symbol\}$/.test(path) && method === 'get') {
    return objectWithSingleRef('data', 'AiInsight');
  }
  if (/^\/api\/v[12]\/ai\/bctc\/\{symbol\}$/.test(path) && method === 'get') {
    return objectWithSingleRef('data', 'AiBctcAnalysis');
  }
  if (/^\/api\/v[12]\/ai\/bctc-dashboard\/\{symbol\}$/.test(path) && method === 'get') {
    return objectWithSingleRef('data', 'AiBctcNarrative');
  }
  if (/^\/api\/v[12]\/bot\/status$/.test(path) && method === 'get') {
    return ref('BotStatus');
  }
  if (/^\/api\/v[12]\/admin\/journey\/identity\/qa-grants$/.test(path) && method === 'post') {
    return ref('JourneyQaGrantResult');
  }
  if (
    /^\/api\/v[12]\/cap2\/alerts\/\{alert_id\}\/(?:claim|check|dismiss|snooze)$/.test(path) &&
    method === 'post'
  ) {
    if (path.endsWith('/claim')) return ref('Cap2AlertClaimResult');
    if (path.endsWith('/check')) return ref('Cap2AlertCheckResult');
    return ref('Cap2AlertActionResult');
  }
  if (path === '/api/v2/cap7/progress' && method === 'get') {
    return ref('Cap7ProgressResponseV2');
  }
  if (/^\/api\/v2\/cap7\/(?:enter|graduate)$/.test(path) && method === 'post') {
    return ref('Cap7ProgressMutationResponseV2');
  }
  if (path === '/api/v2/cap7/portfolio' && method === 'get') {
    return ref('Cap7PortfolioResponseV2');
  }
  if (path === '/api/v2/cap8/progress' && method === 'get') {
    return ref('Cap8ProgressResponseV2');
  }
  if (/^\/api\/v2\/cap8\/(?:enter|graduate)$/.test(path) && method === 'post') {
    return ref('Cap8ProgressMutationResponseV2');
  }
  if (path === '/api/v2/cap8/positions/{symbol}/exit-context' && method === 'get') {
    return ref('Cap8ExitContextResponseV2');
  }
  if (path === '/api/v2/cap8/positions/{symbol}/sync-plan' && method === 'post') {
    return ref('Cap8SyncedPlanResponseV2');
  }
  if (path === '/api/v2/cap8/positions/{symbol}/dynamic-stop' && method === 'patch') {
    return ref('Cap8DynamicStopResponseV2');
  }
  if (path === '/api/v2/cap8/exits' && method === 'post') {
    return ref('Cap8ExitResponseV2');
  }
  return undefined;
}

function objectWithSingleRef(property: string, component: string): SchemaObject {
  return {
    type: 'object',
    additionalProperties: false,
    required: [property],
    properties: { [property]: ref(component) },
  };
}

function unifiedReportSchema(
  path: string,
  method: HttpMethod,
): SchemaObject | ReferenceObject | undefined {
  if (!/^\/api\/v[12]\/market-analysis\/\{type\}/.test(path)) return undefined;
  if (method === 'post' && path.endsWith('/run')) return ref('Legacy_GenerateResult');
  if (method !== 'get') return undefined;
  if (path.startsWith('/api/v2/')) {
    return path.endsWith('/{type}')
      ? { type: 'array', items: ref('MarketReportV2') }
      : ref('MarketReportV2');
  }
  if (path.endsWith('/{type}')) {
    return { type: 'array', items: ref('Legacy_AnalysisListItem') };
  }
  return ref('Legacy_AnalysisOut');
}

function installComponents(document: OpenAPIObject): void {
  document.components ??= {};
  document.components.schemas ??= {};
  document.components.securitySchemes ??= {};
  document.components.securitySchemes.bearer ??= {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: 'IQX access token',
  };

  for (const [name, schema] of Object.entries(legacyDocument.components?.schemas ?? {})) {
    document.components.schemas[`Legacy_${name}`] ??= rewriteLegacyRefs(schema) as SchemaObject;
  }
  document.components.schemas.LegacyApiError ??= legacyErrorSchema();
  document.components.schemas.ApiErrorV2 ??= v2ErrorSchema();
  document.components.schemas.MarketReportV2 ??= marketReportV2Schema();
  for (const [name, schema] of Object.entries(localResponseSchemas())) {
    document.components.schemas[name] ??= schema;
  }
}

function rewriteLegacyRefs(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(rewriteLegacyRefs);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as JsonRecord).map(([key, item]) => {
      if (key === '$ref' && typeof item === 'string') {
        return [key, item.replace('#/components/schemas/', '#/components/schemas/Legacy_')];
      }
      return [key, rewriteLegacyRefs(item)];
    }),
  );
}

function ref(name: string): ReferenceObject {
  return { $ref: `#/components/schemas/${name}` };
}

function legacyErrorSchema(): SchemaObject {
  return {
    type: 'object',
    required: ['detail'],
    additionalProperties: false,
    properties: {
      detail: {
        oneOf: [
          { type: 'string' },
          { type: 'array', items: { type: 'object', additionalProperties: true } },
        ],
      },
      code: { type: 'string' },
    },
  };
}

function v2ErrorSchema(): SchemaObject {
  return {
    type: 'object',
    required: ['error', 'request_id'],
    additionalProperties: false,
    properties: {
      error: {
        type: 'object',
        required: ['code', 'message'],
        additionalProperties: false,
        properties: {
          code: { type: 'string' },
          message: { type: 'string' },
          details: {
            type: 'array',
            items: {
              type: 'object',
              required: ['path', 'message'],
              properties: {
                path: { type: 'string' },
                message: { type: 'string' },
              },
            },
          },
        },
      },
      request_id: { type: 'string' },
    },
  };
}

function marketReportV2Schema(): SchemaObject {
  const jsonObject: SchemaObject = { type: 'object', additionalProperties: ref('JsonValue') };
  const jsonArray: SchemaObject = { type: 'array', items: ref('JsonValue') };
  return {
    type: 'object',
    additionalProperties: false,
    required: [
      'id',
      'sessionDate',
      'sessionType',
      'reportType',
      'generatedAt',
      'headline',
      'tagline',
      'paragraphs',
      'scenarios',
      'watchlist',
      'unexplained',
      'meta',
      'published',
      'generationStatus',
      'generationError',
    ],
    properties: {
      id: { type: 'string' },
      sessionDate: { type: 'string', format: 'date' },
      sessionType: { type: 'string' },
      reportType: { type: 'string', enum: ['daily', 'midday', 'premarket'] },
      generatedAt: { type: 'string', format: 'date-time' },
      headline: { type: 'string' },
      tagline: jsonObject,
      paragraphs: jsonObject,
      scenarios: jsonArray,
      watchlist: { oneOf: [jsonArray, { type: 'null' }] },
      unexplained: { oneOf: [{ type: 'string' }, { type: 'null' }] },
      meta: { oneOf: [jsonObject, { type: 'null' }] },
      published: { type: 'boolean' },
      generationStatus: {
        type: 'string',
        enum: ['generating', 'published', 'failed'],
      },
      generationError: { oneOf: [{ type: 'string' }, { type: 'null' }] },
    },
  };
}

function localResponseSchemas(): Record<string, SchemaObject> {
  const string = (): SchemaObject => ({ type: 'string' });
  const integer = (): SchemaObject => ({ type: 'integer' });
  const number = (): SchemaObject => ({ type: 'number' });
  const boolean = (): SchemaObject => ({ type: 'boolean' });
  const dateTime = (): SchemaObject => ({ type: 'string', format: 'date-time' });
  const date = (): SchemaObject => ({ type: 'string', format: 'date' });
  const nullable = (schema: SchemaObject | ReferenceObject): SchemaObject => ({
    oneOf: [schema, { type: 'null' }],
  });
  const array = (items: SchemaObject | ReferenceObject): SchemaObject => ({ type: 'array', items });
  const object = (
    properties: Record<string, SchemaObject | ReferenceObject>,
    required = Object.keys(properties),
    additionalProperties: boolean | SchemaObject | ReferenceObject = false,
  ): SchemaObject => ({ type: 'object', properties, required, additionalProperties });
  const envelope = (
    data: SchemaObject | ReferenceObject,
    meta: SchemaObject = emptyMeta(),
  ): SchemaObject => object({ data, meta });

  const pageFields: Record<string, SchemaObject> = {
    total: integer(),
    page: integer(),
    page_size: integer(),
  };
  const cap7Portfolio = object({
    nav_vnd: number(),
    cash_vnd: nullable(number()),
    cash_weight_pct: nullable(number()),
    positions: array(
      object({
        symbol: string(),
        market_value_vnd: nullable(number()),
        weight_pct: nullable(number()),
        sector: nullable(string()),
      }),
    ),
    sectors: array(
      object({ sector: string(), market_value_vnd: number(), weight_pct: nullable(number()) }),
    ),
    held_symbol_count: integer(),
    known_sector_count: integer(),
    max_symbol: nullable(string()),
    max_symbol_weight_pct: nullable(number()),
    max_sector: nullable(string()),
    max_sector_weight_pct: nullable(number()),
    unpriced_symbols: array(string()),
    unknown_sector_symbols: array(string()),
    data_complete: boolean(),
    can_doi_ok: boolean(),
  });
  const cap7Progress = object({
    id: { type: 'string', format: 'uuid' },
    user_id: { type: 'string', format: 'uuid' },
    entered_at: dateTime(),
    can_doi_ok: boolean(),
    so_ma_dang_giu: integer(),
    so_nganh_dang_giu: integer(),
    ma_ty_trong_cao_nhat: nullable(string()),
    ty_trong_ma_cao_nhat_pct: nullable(number()),
    nganh_ty_trong_cao_nhat: nullable(string()),
    ty_trong_nganh_cao_nhat_pct: nullable(number()),
    ma_chua_co_gia: array(string()),
    ma_chua_ro_nganh: array(string()),
    du_lieu_day_du: boolean(),
    nguong_ty_trong_ma_pct: number(),
    nguong_ty_trong_nganh_pct: number(),
    toi_thieu_ma: integer(),
    toi_thieu_nganh: integer(),
    graduated_at: nullable(dateTime()),
    time_to_graduate_hours: nullable(number()),
  });
  const cap8Progress = object({
    id: { type: 'string', format: 'uuid' },
    user_id: { type: 'string', format: 'uuid' },
    entered_at: dateTime(),
    so_lenh_thoat_dung_ke_hoach: integer(),
    muc_tieu_thoat_dung_ke_hoach: integer(),
    graduated_at: nullable(dateTime()),
    time_to_graduate_hours: nullable(number()),
  });
  const cap8Exit = object({
    id: { type: 'string', format: 'uuid' },
    symbol: string(),
    matched_buy_order_id: nullable({ type: 'string', format: 'uuid' }),
    sell_order_id: { type: 'string', format: 'uuid' },
    exited_at: dateTime(),
    quantity: integer(),
    filled_price_vnd: number(),
    remaining_position_pct: number(),
    exit_method: string(),
    original_stop_vnd: nullable(number()),
    original_take_profit_vnd: nullable(number()),
    effective_stop_vnd: nullable(number()),
    dung_ke_hoach: boolean(),
    ban_cam_xuc: boolean(),
    classification_reason: string(),
  });

  return {
    JsonValue: {
      oneOf: [
        string(),
        number(),
        boolean(),
        { type: 'null' },
        array(ref('JsonValue')),
        { type: 'object', additionalProperties: ref('JsonValue') },
      ],
    },
    AdminSystemStatusV2: object({
      version: string(),
      environment: string(),
      scheduler_running: boolean(),
      jobs: array(
        object(
          {
            name: string(),
            description: string(),
            enabled: boolean(),
            tradingDay: boolean(),
            handlerRegistered: boolean(),
            nextRunAt: dateTime(),
            pattern: string(),
            everyMs: integer(),
          },
          ['name', 'description', 'enabled', 'tradingDay', 'handlerRegistered'],
        ),
      ),
      db_stats: { type: 'object', additionalProperties: integer() },
      last_ipn_received_at: nullable(dateTime()),
      last_ipn_processed_count_24h: integer(),
      generated_at: dateTime(),
    }),
    AdminJobQueuedV2: object({
      job_id: string(),
      jobId: string(),
      name: string(),
      state: { type: 'string', enum: ['queued'] },
      ran_at: dateTime(),
    }),
    ScreeningRequest: object(
      {
        page: integer(),
        pageSize: integer(),
        sortFields: array(string()),
        sortOrders: array({ type: 'string', enum: ['ASC', 'DESC'] }),
        filter: array(
          object(
            {
              name: string(),
              conditionOptions: array(
                object(
                  { type: string(), value: string(), from: number(), to: number() },
                  [],
                  ref('JsonValue'),
                ),
              ),
              extraName: string(),
            },
            ['name'],
          ),
        ),
      },
      [],
    ),
    MarketProviderEnvelope: object(
      {
        data: ref('JsonValue'),
        meta: ref('MarketDataMeta'),
        source_url: string(),
      },
      ['data', 'meta'],
      ref('JsonValue'),
    ),
    MarketDataMeta: object(
      {
        source: string(),
        source_priority: integer(),
        fallback_used: boolean(),
        as_of: dateTime(),
        raw_endpoint: string(),
        request_id: string(),
      },
      ['source', 'source_priority', 'fallback_used', 'as_of'],
      ref('JsonValue'),
    ),
    MarketPriceBoardResponse: object({
      data: array(
        object(
          {
            symbol: string(),
            exchange: string(),
            reference_price: nullable(number()),
            open_price: nullable(number()),
            high_price: nullable(number()),
            low_price: nullable(number()),
            close_price: nullable(number()),
            average_price: nullable(number()),
            total_volume: nullable(number()),
            total_value: nullable(number()),
            bid_prices: array(ref('JsonValue')),
            ask_prices: array(ref('JsonValue')),
            price_change: nullable(number()),
            percent_change: nullable(number()),
          },
          ['symbol'],
          ref('JsonValue'),
        ),
      ),
      meta: ref('MarketDataMeta'),
    }),
    MarketScreeningResponse: object({
      data: object({
        content: array(ref('JsonValue')),
        total_elements: integer(),
        total_pages: integer(),
        page: integer(),
        page_size: integer(),
        first: boolean(),
        last: boolean(),
        empty: boolean(),
      }),
      meta: ref('MarketDataMeta'),
      source_url: string(),
    }),
    AiNewsItemV2: object({
      id: string(),
      slug: string(),
      ticker: string(),
      industry: string(),
      title: string(),
      short_content: string(),
      source_link: string(),
      image_url: string(),
      update_date: string(),
      source: string(),
      source_name: string(),
      sentiment: string(),
      score: number(),
      topic_name: string(),
      raw_type: string(),
    }),
    AiNewsResponse: object(
      {
        data: array(ref('AiNewsItemV2')),
        meta: ref('MarketDataMeta'),
        source_url: string(),
        total_records: integer(),
        kind: string(),
        page: integer(),
        page_size: integer(),
      },
      ['data', 'meta'],
      ref('JsonValue'),
    ),
    AiNewsDetailResponse: object({
      data: object(
        {
          id: string(),
          slug: string(),
          title: string(),
          news_full_content_html: string(),
          news_full_content_text: string(),
          file_attachments: array(ref('JsonValue')),
          news_type: string(),
        },
        [],
        ref('JsonValue'),
      ),
      meta: ref('MarketDataMeta'),
      source_url: string(),
    }),
    AiNewsAudioResponse: object({
      data: object({ male_url: string(), female_url: string() }),
      meta: ref('MarketDataMeta'),
      source_url: string(),
    }),
    DatabaseRow: {
      type: 'object',
      description: 'Database row returned by an administrative inspection endpoint.',
      additionalProperties: ref('JsonValue'),
    },
    EmptyMeta: emptyMeta(),
    AdminVtAccountPage: object(
      {
        items: array(ref('DatabaseRow')),
        ...pageFields,
        total_pages: integer(),
      },
      ['items', 'total', 'page', 'page_size', 'total_pages'],
    ),
    AdminVtResetResult: object({ accounts_reset: integer(), dry_run: boolean() }),
    AdminVtConfig: object({
      id: { type: 'string', format: 'uuid' },
      initial_cash_vnd: { oneOf: [integer(), string()] },
      buy_fee_rate_bps: integer(),
      sell_fee_rate_bps: integer(),
      sell_tax_rate_bps: integer(),
      settlement_mode: { type: 'string', enum: ['T0', 'T2'] },
      board_lot_size: integer(),
      trading_enabled: boolean(),
      holidays: array(date()),
      is_active: boolean(),
      created_by: nullable({ type: 'string', format: 'uuid' }),
      updated_by: nullable({ type: 'string', format: 'uuid' }),
      created_at: dateTime(),
      updated_at: dateTime(),
    }),
    TradingLedgerEntry: object({
      id: string(),
      amount_vnd: number(),
      balance_after_vnd: number(),
      kind: string(),
      reference_type: nullable(string()),
      reference_id: nullable(string()),
      note: nullable(string()),
      created_at: dateTime(),
    }),
    TradingLedgerPage: object({
      items: array(ref('TradingLedgerEntry')),
      ...pageFields,
    }),
    AlertFactor: object({
      id: string(),
      label: string(),
      side: { type: 'string', enum: ['buy', 'sell'] },
      group: string(),
      group_label: string(),
      kind: { type: 'string', enum: ['bin', 'num'] },
      indicator: string(),
      op: string(),
      default: nullable({ oneOf: [number(), string()] }),
      editable: boolean(),
      min: nullable(number()),
      max: nullable(number()),
      step: nullable(number()),
      unit: string(),
      is_percent: boolean(),
      desc: string(),
    }),
    AlertFactorGroup: object({
      group: string(),
      group_label: string(),
      factors: array(ref('AlertFactor')),
    }),
    AlertFactorLibrary: object({
      buy: array(ref('AlertFactorGroup')),
      sell: array(ref('AlertFactorGroup')),
      count: integer(),
    }),
    DeletedResult: object({ deleted: { type: 'boolean', enum: [true] } }),
    TelegramWebhookResult: object({
      configured: boolean(),
      url: { type: 'string', format: 'uri' },
    }),
    WatchlistItemV2: watchlistItemSchema(),
    WatchlistPageV2: envelope(
      array(ref('WatchlistItemV2')),
      object({ count: integer(), limit: integer() }),
    ),
    WatchlistItemResponseV2: envelope(ref('WatchlistItemV2')),
    WatchlistReorderResponseV2: envelope(
      array(ref('WatchlistItemV2')),
      object({ count: integer() }),
    ),
    WatchlistStatusResponseV2: envelope(object({ symbol: string(), watched: boolean() })),
    ChartDrawingV2: object({
      symbol: string(),
      state: nullable({ type: 'object', additionalProperties: ref('JsonValue') }),
      updatedAt: nullable(dateTime()),
    }),
    ChartDrawingResponseV2: envelope(ref('ChartDrawingV2')),
    PortfolioAnalysis: portfolioAnalysisSchema(),
    PortfolioNarrative: portfolioNarrativeSchema(),
    PortfolioReport: object({
      analysis: ref('PortfolioAnalysis'),
      narrative: nullable(ref('PortfolioNarrative')),
      meta: object(
        {
          valid: boolean(),
          cached: boolean(),
          persisted: boolean(),
          model: string(),
          session_date: date(),
          period_number: integer(),
        },
        ['valid', 'cached', 'persisted', 'model', 'session_date'],
      ),
    }),
    ForecastItem: object({
      rank: integer(),
      symbol: string(),
      expectedReturn: number(),
      projectedPrice: nullable(number()),
      upProbability: nullable(number()),
    }),
    ForecastRanking: object({
      horizon: string(),
      horizonDays: integer(),
      count: integer(),
      items: array(ref('ForecastItem')),
    }),
    ForecastPoint: object({
      horizon: string(),
      horizonDays: integer(),
      projectedPrice: nullable(number()),
      expectedReturn: nullable(number()),
      upProbability: nullable(number()),
    }),
    ForecastSymbol: object({ symbol: string(), forecasts: array(ref('ForecastPoint')) }),
    PatternItem: object({
      symbol: string(),
      name: string(),
      signal: { type: 'string', enum: ['bullish', 'bearish', 'neutral'] },
      signalLabel: nullable(string()),
      state: nullable(string()),
      meaning: nullable(string()),
      action: nullable(string()),
      illustration: nullable(string()),
    }),
    PatternResults: object({
      symbol: string(),
      kind: { type: 'string', enum: ['candles', 'charts'] },
      items: array(ref('PatternItem')),
      count: integer(),
    }),
    PatternSymbols: object({
      kind: { type: 'string', enum: ['candles', 'charts'] },
      symbols: array(string()),
      count: integer(),
    }),
    AiTextAnalysis: aiTextAnalysisSchema(),
    AiIndustryAnalysis: aiIndustryAnalysisSchema(),
    AiIndustryBatch: aiIndustryBatchSchema(),
    AiNewsItem: object({ tieu_de: string(), tag: string() }, ['tieu_de', 'tag'], ref('JsonValue')),
    AiInsightLayerL1: aiLayerSchema(['xu_huong', 'statusLabel', 'diff']),
    AiInsightLayerL2: aiLayerSchema(['thanh_khoan', 'statusLabel', 'diff']),
    AiInsightLayerL3: aiLayerSchema(['khoi_ngoai', 'tu_doanh', 'statusLabel', 'diff']),
    AiInsightLayerL4: aiLayerSchema(['noi_bo', 'statusLabel', 'diff']),
    AiInsightLayerL5: aiLayerSchema(['tong_quan', 'statusLabel', 'diff'], {
      tin_material: array(ref('AiNewsItem')),
      tin_filler: array(ref('AiNewsItem')),
    }),
    AiInsightBriefing: aiInsightBriefingSchema(),
    AiInsight: aiInsightSchema(),
    AiBctcAnalysis: aiBctcAnalysisSchema(),
    AiBctcNarrative: aiBctcNarrativeSchema(),
    BotIssue: object({ code: string(), symbol: nullable(string()), detail: nullable(string()) }),
    BotStatus: object({
      status: { type: 'string', enum: ['idle', 'running', 'succeeded', 'failed'] },
      latest_run_id: nullable({ type: 'string', format: 'uuid' }),
      last_updated_at: nullable(dateTime()),
      processed_unseen_sessions: integer(),
      issues: array(ref('BotIssue')),
    }),
    JourneyQaGrantResult: object({
      accepted: { type: 'boolean', enum: [true] },
      target_user_id: { type: 'string', format: 'uuid' },
      mascot_id: string(),
    }),
    Cap2Alert: cap2AlertSchema(),
    Cap2AlertClaimResult: object({
      alert: ref('Cap2Alert'),
      claimed: { type: 'boolean', enum: [true] },
    }),
    Cap2AlertCheckResult: object({ alert: ref('Cap2Alert'), eligible: boolean() }),
    Cap2AlertActionResult: object({
      alert: ref('Cap2Alert'),
      next_step: { type: 'string', enum: ['confirm_ato_sell', 'none'] },
    }),
    Cap7Portfolio: cap7Portfolio,
    Cap7Progress: cap7Progress,
    Cap7ProgressResponseV2: envelope(nullable(ref('Cap7Progress'))),
    Cap7ProgressMutationResponseV2: envelope(ref('Cap7Progress')),
    Cap7PortfolioResponseV2: envelope(ref('Cap7Portfolio')),
    Cap8Progress: cap8Progress,
    Cap8ProgressResponseV2: envelope(nullable(ref('Cap8Progress'))),
    Cap8ProgressMutationResponseV2: envelope(ref('Cap8Progress')),
    Cap8ExitContextResponseV2: envelope(
      object({
        symbol: string(),
        quantity_total: integer(),
        quantity_sellable: integer(),
        avg_cost_vnd: number(),
        current_price_vnd: nullable(number()),
        source_buy_order_id: nullable({ type: 'string', format: 'uuid' }),
        original_stop_vnd: nullable(number()),
        original_take_profit_vnd: nullable(number()),
        dynamic_stop_vnd: nullable(number()),
        dynamic_stop_set_at: nullable(dateTime()),
        can_update_dynamic_stop: boolean(),
        board_lot_size: integer(),
        proposed_sale_quantity: integer(),
        sector_impact: ref('Cap7Portfolio'),
      }),
    ),
    Cap8SyncedPlanResponseV2: envelope(
      object({
        symbol: string(),
        source_buy_order_id: { type: 'string', format: 'uuid' },
        original_stop_vnd: number(),
        original_take_profit_vnd: number(),
        dynamic_stop_vnd: { type: 'null' },
        dynamic_stop_set_at: { type: 'null' },
      }),
    ),
    Cap8DynamicStopResponseV2: envelope(
      object({ symbol: string(), dynamic_stop_vnd: number(), dynamic_stop_set_at: dateTime() }),
    ),
    Cap8Exit: cap8Exit,
    Cap8ExitResponseV2: envelope(ref('Cap8Exit')),
  };
}

function emptyMeta(): SchemaObject {
  return { type: 'object', additionalProperties: false };
}

function watchlistItemSchema(): SchemaObject {
  const nullableString: SchemaObject = { oneOf: [{ type: 'string' }, { type: 'null' }] };
  const nullableInteger: SchemaObject = { oneOf: [{ type: 'integer' }, { type: 'null' }] };
  const nullableBoolean: SchemaObject = { oneOf: [{ type: 'boolean' }, { type: 'null' }] };
  return {
    type: 'object',
    additionalProperties: false,
    required: [
      'id',
      'symbol',
      'sortOrder',
      'createdAt',
      'updatedAt',
      'instrument',
      'provenance',
      'consensus',
    ],
    properties: {
      id: { type: 'string', format: 'uuid' },
      symbol: { type: 'string' },
      sortOrder: { type: 'integer' },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
      instrument: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'shortName', 'exchange', 'assetType', 'logoUrl', 'isActive'],
        properties: {
          name: nullableString,
          shortName: nullableString,
          exchange: nullableString,
          assetType: nullableString,
          logoUrl: nullableString,
          isActive: nullableBoolean,
        },
      },
      provenance: {
        type: 'object',
        additionalProperties: false,
        required: ['huntFilter', 'huntSignal', 'huntAt'],
        properties: {
          huntFilter: nullableString,
          huntSignal: nullableString,
          huntAt: nullableString,
        },
      },
      consensus: {
        type: 'object',
        additionalProperties: false,
        required: [
          'supportingLayers',
          'previousSupportingLayers',
          'evaluatedLayers',
          'evaluatedAt',
          'status',
        ],
        properties: {
          supportingLayers: nullableInteger,
          previousSupportingLayers: nullableInteger,
          evaluatedLayers: nullableInteger,
          evaluatedAt: nullableString,
          status: nullableString,
        },
      },
    },
  };
}

function portfolioAnalysisSchema(): SchemaObject {
  const number = (): SchemaObject => ({ type: 'number' });
  const integer = (): SchemaObject => ({ type: 'integer' });
  const string = (): SchemaObject => ({ type: 'string' });
  const boolean = (): SchemaObject => ({ type: 'boolean' });
  const nullable = (schema: SchemaObject): SchemaObject => ({ oneOf: [schema, { type: 'null' }] });
  const array = (items: SchemaObject | ReferenceObject): SchemaObject => ({ type: 'array', items });
  const object = (properties: Record<string, SchemaObject | ReferenceObject>): SchemaObject => ({
    type: 'object',
    additionalProperties: false,
    properties,
    required: Object.keys(properties),
  });
  const cash = object({
    available: string(),
    reserved: string(),
    pending: string(),
    total: string(),
  });
  const priceSource: SchemaObject = { type: 'string', enum: ['symbol_snapshot', 'daily_close'] };
  const holding = object({
    ticker: string(),
    sector: string(),
    weight: nullable(number()),
    pnl: string(),
    price_source: priceSource,
    price_as_of: string(),
    price_age_days: nullable(number()),
    price_stale: boolean(),
  });
  const allocation = object({ sector: string(), weight: number() });
  const attribution = object({ ticker: string(), pnl: string() });
  const correlation = object({ a: string(), b: string(), value: number() });
  const missing = object({ pe: array(string()), pb: array(string()), roe: array(string()) });
  return object({
    meta: object({
      portfolio_id: string(),
      date: { type: 'string', format: 'date' },
      mode: { type: 'string', enum: ['full_changed'] },
      period_number: integer(),
      data_quality: object({
        complete_risk_history: boolean(),
        aligned_benchmark: boolean(),
        fundamentals_complete: boolean(),
        discipline_evidence_complete: boolean(),
        valuation_prices: array(
          object({
            ticker: string(),
            source: priceSource,
            as_of: string(),
            age_days: nullable(number()),
            stale: boolean(),
          }),
        ),
        cash_components: cash,
      }),
    }),
    overview: object({
      nav: string(),
      cash,
      cash_pct: nullable(number()),
      n_positions: integer(),
      total_return: nullable(number()),
      total_pnl: string(),
      positions: array(holding),
    }),
    allocation: array(allocation),
    concentration: object({
      top1: number(),
      top3: number(),
      effective_n: nullable(number()),
      largest_sector: number(),
    }),
    performance: object({
      portfolio_return: nullable(number()),
      benchmark_return: nullable(number()),
      excess_return: nullable(number()),
      max_drawdown: nullable(number()),
      method: nullable({ type: 'string', enum: ['date_aligned_market_history'] }),
      observations: integer(),
    }),
    risk: object({
      beta: nullable(number()),
      volatility: nullable(number()),
      max_drawdown: nullable(number()),
      correlation: array(correlation),
      data_quality: object({
        complete: boolean(),
        holdings_total: integer(),
        holdings_with_history: integer(),
        common_price_observations: integer(),
        benchmark_aligned_observations: integer(),
        beta_available: boolean(),
        missing_history: array(string()),
        history_alignment_complete: boolean(),
      }),
    }),
    attribution: array(attribution),
    quality: object({
      pe: nullable(number()),
      pb: nullable(number()),
      roe: nullable(number()),
      coverage: object({ pe: number(), pb: number(), roe: number() }),
      score_eligible: boolean(),
      missing,
    }),
    behavior: object({
      losing_count: integer(),
      disposition_flag: nullable(boolean()),
      evidence: object({
        evaluated: boolean(),
        closed_winner_quantity: integer(),
        closed_loser_quantity: integer(),
        average_winner_days: nullable(number()),
        average_loser_days: nullable(number()),
        closed_quantity: integer(),
      }),
    }),
    scores: object({
      pillars: object({
        performance: nullable(integer()),
        risk: nullable(integer()),
        diversification: nullable(integer()),
        quality: nullable(integer()),
        discipline: nullable(integer()),
      }),
      overall: nullable(number()),
      available_pillars: integer(),
    }),
  });
}

function portfolioNarrativeSchema(): SchemaObject {
  return {
    type: 'object',
    required: ['title', 'verdict', 'lede', 'layers', 'actions', 'watch', 'closing'],
    properties: {
      title: { type: 'string' },
      verdict: { type: 'string' },
      lede: { type: 'string' },
      layers: { type: 'object', additionalProperties: { type: 'string' } },
      actions: {
        type: 'array',
        maxItems: 3,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'detail'],
          properties: { title: { type: 'string' }, detail: { type: 'string' } },
        },
      },
      watch: { type: 'array', items: ref('JsonValue') },
      closing: { type: 'string' },
      progress_text: { type: 'string' },
      insight: {
        type: 'object',
        additionalProperties: false,
        required: ['text'],
        properties: { text: { type: 'string' } },
      },
      low_data_note: { type: 'string' },
      meta: { type: 'object', additionalProperties: ref('JsonValue') },
    },
    additionalProperties: ref('JsonValue'),
  };
}

function aiTextAnalysisSchema(): SchemaObject {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['type', 'input', 'analysis', 'model', 'prompt_version', 'input_hash', 'as_of'],
    properties: {
      type: { type: 'string', enum: ['dashboard', 'industry'] },
      input: {
        type: 'object',
        additionalProperties: false,
        required: ['identifier', 'language'],
        properties: {
          identifier: { type: 'string' },
          language: { type: 'string', enum: ['vi', 'en'] },
        },
      },
      analysis: { type: 'string' },
      model: { type: 'string' },
      prompt_version: { type: 'string' },
      input_hash: { type: 'string' },
      as_of: { type: 'string', format: 'date-time' },
      payload: { type: 'object', additionalProperties: ref('JsonValue') },
    },
  };
}

function aiIndustryAnalysisSchema(): SchemaObject {
  const base = aiTextAnalysisSchema();
  return {
    ...base,
    required: [...(base.required ?? []), 'icb_code'],
    properties: { ...base.properties, icb_code: { type: 'integer' } },
  };
}

function aiIndustryBatchSchema(): SchemaObject {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['results'],
    properties: {
      results: {
        type: 'array',
        items: {
          oneOf: [
            ref('AiIndustryAnalysis'),
            {
              type: 'object',
              additionalProperties: false,
              required: ['icb_code', 'error'],
              properties: { icb_code: { type: 'integer' }, error: { type: 'string' } },
            },
          ],
        },
      },
    },
  };
}

function aiLayerSchema(
  requiredStrings: string[],
  additional: Record<string, SchemaObject | ReferenceObject> = {},
): SchemaObject {
  return {
    type: 'object',
    required: [...requiredStrings, ...Object.keys(additional)],
    properties: {
      ...Object.fromEntries(requiredStrings.map((field) => [field, { type: 'string' }])),
      ...additional,
    },
    // The provider may include source evidence alongside the validated fields.
    additionalProperties: ref('JsonValue'),
  };
}

function aiInsightBriefingSchema(): SchemaObject {
  return {
    type: 'object',
    required: [
      'trend',
      'status',
      'timeframe',
      'narrative',
      'diff',
      'recommendation',
      'observations',
      'watchLevels',
    ],
    properties: {
      trend: { type: 'string' },
      status: { type: 'string' },
      timeframe: { type: 'string' },
      narrative: { type: 'string' },
      diff: { type: 'string' },
      recommendation: {
        type: 'string',
        enum: ['Chờ điểm mua', 'Có thể mua thử', 'Quan sát thêm', 'Nên giảm bớt', 'Bán bớt'],
      },
      observations: {
        type: 'object',
        additionalProperties: ref('JsonValue'),
        required: ['liquidity', 'moneyFlow', 'insider', 'news', 'supportResistance'],
        properties: {
          liquidity: { type: 'string' },
          moneyFlow: { type: 'string' },
          insider: { type: 'string' },
          news: { type: 'string' },
          supportResistance: { type: 'string' },
        },
      },
      watchLevels: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: ref('JsonValue'),
          required: ['tag', 'description'],
          properties: { tag: { type: 'string' }, description: { type: 'string' } },
        },
      },
    },
    additionalProperties: ref('JsonValue'),
  };
}

function aiInsightSchema(): SchemaObject {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['symbol', 'updatedAt', 'header', 'briefing', 'layers', 'dataSummary'],
    properties: {
      symbol: { type: 'string' },
      updatedAt: { type: 'string', format: 'date-time' },
      header: {
        type: 'object',
        additionalProperties: false,
        required: ['symbol', 'sector', 'exchange', 'price', 'changePercent', 'isLive'],
        properties: {
          symbol: { type: 'string' },
          sector: { oneOf: [{ type: 'string' }, { type: 'null' }] },
          exchange: { oneOf: [{ type: 'string' }, { type: 'null' }] },
          price: { oneOf: [{ type: 'number' }, { type: 'null' }] },
          changePercent: { oneOf: [{ type: 'number' }, { type: 'null' }] },
          isLive: { type: 'boolean' },
        },
      },
      briefing: ref('AiInsightBriefing'),
      layers: {
        type: 'object',
        additionalProperties: false,
        required: ['L1', 'L2', 'L3', 'L4', 'L5'],
        properties: {
          L1: ref('AiInsightLayerL1'),
          L2: ref('AiInsightLayerL2'),
          L3: ref('AiInsightLayerL3'),
          L4: ref('AiInsightLayerL4'),
          L5: ref('AiInsightLayerL5'),
        },
      },
      dataSummary: {
        type: 'object',
        additionalProperties: false,
        required: ['model', 'as_of', 'input_hash'],
        properties: {
          model: { type: 'string' },
          as_of: { type: 'string', format: 'date-time' },
          input_hash: { type: 'string' },
        },
      },
      payload: { type: 'object', additionalProperties: ref('JsonValue') },
    },
  };
}

function aiBctcAnalysisSchema(): SchemaObject {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['type', 'input', 'analysis', 'model', 'prompt_version', 'input_hash', 'as_of'],
    properties: {
      type: { type: 'string', enum: ['bctc'] },
      input: {
        type: 'object',
        additionalProperties: false,
        required: ['symbol', 'term_type', 'language'],
        properties: {
          symbol: { type: 'string' },
          term_type: { type: 'integer', enum: [1, 2] },
          language: { type: 'string', enum: ['vi', 'en'] },
        },
      },
      analysis: {
        type: 'object',
        additionalProperties: false,
        required: ['memo', 'modules'],
        properties: {
          memo: { type: 'string' },
          modules: { type: 'object', additionalProperties: { type: 'string' } },
        },
      },
      model: { type: 'string' },
      prompt_version: { type: 'string' },
      input_hash: { type: 'string' },
      as_of: { type: 'string', format: 'date-time' },
    },
  };
}

function aiBctcNarrativeSchema(): SchemaObject {
  return {
    type: 'object',
    required: ['verdict_oneliner', 'story', 'blocks'],
    properties: {
      verdict_oneliner: { type: 'string' },
      story: {
        type: 'object',
        additionalProperties: ref('JsonValue'),
        required: ['paragraphs'],
        properties: {
          paragraphs: { type: 'array', minItems: 3, maxItems: 3, items: ref('JsonValue') },
        },
      },
      blocks: {
        type: 'object',
        description:
          'Template-specific financial narrative blocks; each populated block contains an answer.',
        additionalProperties: {
          type: 'object',
          additionalProperties: ref('JsonValue'),
          required: ['answer'],
          properties: { answer: { type: 'string' } },
        },
      },
    },
    additionalProperties: ref('JsonValue'),
  };
}

function cap2AlertSchema(): SchemaObject {
  const nullableString: SchemaObject = { oneOf: [{ type: 'string' }, { type: 'null' }] };
  const nullableNumber: SchemaObject = { oneOf: [{ type: 'number' }, { type: 'null' }] };
  const nullableInteger: SchemaObject = { oneOf: [{ type: 'integer' }, { type: 'null' }] };
  return {
    type: 'object',
    description:
      'Persisted Cấp 2 alert. Additional fields are immutable database evidence retained by the alert service.',
    additionalProperties: ref('JsonValue'),
    required: [
      'id',
      'user_id',
      'alert_type',
      'symbol',
      'session_date',
      'observed_price_vnd',
      'status',
      'impression_count',
      'breach_session_no',
    ],
    properties: {
      id: { type: 'string', format: 'uuid' },
      user_id: { type: 'string', format: 'uuid' },
      alert_type: { type: 'string' },
      symbol: { type: 'string' },
      session_date: { type: 'string', format: 'date' },
      observed_price_vnd: { type: 'number' },
      threshold_price_vnd: nullableNumber,
      loss_pct: nullableNumber,
      status: { type: 'string' },
      escalation: nullableString,
      impression_count: { type: 'integer' },
      action: nullableString,
      acted_at: nullableString,
      intended_quantity: nullableInteger,
      intended_order_type: nullableString,
      intended_limit_price_vnd: nullableNumber,
      violation_confirmed_at: nullableString,
      breach_session_no: { type: 'integer' },
      suppression_reason: nullableString,
      plan_started_at: nullableString,
      position_quantity: nullableInteger,
      position_avg_cost_vnd: nullableNumber,
      official_close_session_date: nullableString,
      first_shown_at: nullableString,
      last_shown_at: nullableString,
    },
  };
}

function summarizeQuality(document: OpenAPIObject): QualitySummary {
  const summary: QualitySummary = {
    operations: 0,
    responseSchemas: 0,
    noContentResponses: 0,
    untypedResponses: 0,
    publicOperations: 0,
    authenticatedOperations: 0,
  };
  for (const pathItem of Object.values(document.paths)) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem?.[method] as ExtendedOperation | undefined;
      if (!operation) continue;
      summary.operations += 1;
      if (hasSuccessSchema(operation)) summary.responseSchemas += 1;
      else if (
        hasNoContentSuccess(operation) ||
        operation['x-response-schema-status'] === 'no-content'
      )
        summary.noContentResponses += 1;
      else summary.untypedResponses += 1;
      if (operation.security?.length === 0) summary.publicOperations += 1;
      else summary.authenticatedOperations += 1;
    }
  }
  return summary;
}
