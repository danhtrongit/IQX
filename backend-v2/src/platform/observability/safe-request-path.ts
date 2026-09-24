/** Remove credentials embedded in callback paths, in addition to query strings. */
export function safeRequestPath(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return url
    .split('?')[0]
    ?.replace(/(\/api\/v[12]\/telegram\/webhook\/)[^/]+/g, '$1[REDACTED]')
    .replace(/(\/api\/v2\/media\/)[^/]+/g, '$1[REDACTED]');
}
