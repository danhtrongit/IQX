const HTTP_METHODS = new Set(['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT', 'TRACE']);

type ContractLinksInput = {
  dispositions: unknown;
  legacy: unknown;
  openApi: unknown;
};

function record(value: unknown, context: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${context} must be an object`);
  }
  return value as Record<string, unknown>;
}

function routeReference(value: unknown, context: string): { method: string; path: string } {
  if (typeof value !== 'string') {
    throw new Error(`${context} must be a string`);
  }
  const match = /^(\S+) (\/\S*)$/.exec(value);
  if (!match?.[1] || !match[2]) {
    throw new Error(`${context} must use the format "METHOD /path"`);
  }
  const method = match[1].toUpperCase();
  if (!HTTP_METHODS.has(method)) {
    throw new Error(`${context} uses unsupported HTTP method ${method}`);
  }
  return { method, path: match[2] };
}

function normalizedRouteKey(method: string, path: string): string {
  // Placeholder names are not contract identity: {symbol}, {ticker}, and
  // :symbol all describe the same path shape.
  const normalizedPath = path.replace(/\{[^/{}]+\}/g, '{}').replace(/:[^/]+/g, '{}');
  return `${method.toUpperCase()} ${normalizedPath}`;
}

function legacyRouteKeys(legacy: unknown): Set<string> {
  const routes = record(legacy, 'legacy manifest').routes;
  if (!Array.isArray(routes)) {
    throw new Error('legacy manifest routes must be an array');
  }
  const keys = new Set<string>();
  for (const [index, value] of routes.entries()) {
    const route = record(value, `legacy route ${index}`);
    const method = route.method;
    const path = route.path;
    if (typeof method !== 'string' || typeof path !== 'string') {
      throw new Error(`legacy route ${index} requires string method and path`);
    }
    keys.add(`${method.toUpperCase()} ${path}`);
  }
  return keys;
}

function openApiRouteShapes(openApi: unknown): Map<string, string[]> {
  const paths = record(record(openApi, 'OpenAPI document').paths, 'OpenAPI paths');
  const shapes = new Map<string, string[]>();
  for (const [path, rawPathItem] of Object.entries(paths)) {
    const pathItem = record(rawPathItem, `OpenAPI path ${path}`);
    for (const methodName of Object.keys(pathItem)) {
      const method = methodName.toUpperCase();
      if (!HTTP_METHODS.has(method)) continue;
      const shape = normalizedRouteKey(method, path);
      shapes.set(shape, [...(shapes.get(shape) ?? []), `${method} ${path}`]);
    }
  }
  return shapes;
}

/** Validate human migration decisions against both generated route inventories. */
export function validateImplementedReplacements({
  dispositions,
  legacy,
  openApi,
}: ContractLinksInput): void {
  const legacyKeys = legacyRouteKeys(legacy);
  const targets = openApiRouteShapes(openApi);
  const overrides = record(
    record(dispositions, 'legacy dispositions').overrides,
    'legacy disposition overrides',
  );

  for (const [sourceReference, rawDecision] of Object.entries(overrides)) {
    const source = routeReference(sourceReference, `legacy disposition key ${sourceReference}`);
    const sourceKey = `${source.method} ${source.path}`;
    if (!legacyKeys.has(sourceKey)) {
      throw new Error(`Disposition source is absent from the legacy manifest: ${sourceKey}`);
    }

    const decision = record(rawDecision, `disposition ${sourceKey}`);
    if (decision.disposition !== 'implemented') continue;
    const replacement = routeReference(
      decision.replacement,
      `implemented replacement for ${sourceKey}`,
    );
    const replacementKey = `${replacement.method} ${replacement.path}`;
    const matches = targets.get(normalizedRouteKey(replacement.method, replacement.path)) ?? [];
    if (matches.length === 0) {
      throw new Error(
        `Implemented replacement is absent from generated OpenAPI: ${replacementKey} ` +
          `(source: ${sourceKey})`,
      );
    }
    if (matches.length > 1) {
      throw new Error(
        `Implemented replacement is ambiguous after path normalization: ${replacementKey}; ` +
          `matches ${matches.join(', ')}`,
      );
    }
  }
}
