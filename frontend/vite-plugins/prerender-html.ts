// Pure HTML helpers for build-time prerendering (no Vite / Node imports so they
// can be unit-tested from the app test suite).

export type PrerenderHead = {
  lang: string
  theme: string
  title: string
  description: string
}

export type ManifestChunk = {
  file: string
  css?: string[]
  imports?: string[]
}

export type Manifest = Record<string, ManifestChunk>

export function escapeHtml(value: string): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

/** CSS and JS chunks (transitively) needed by the shell entry plus a route chunk. */
export function collectAssets(manifest: Manifest, routeKey: string | undefined) {
  const css = new Set<string>()
  const js = new Set<string>()
  const seen = new Set<string>()
  const visit = (name: string) => {
    const chunk = manifest[name]
    if (seen.has(name) || !chunk) return
    seen.add(name)
    js.add(chunk.file)
    for (const file of chunk.css ?? []) css.add(file)
    for (const imported of chunk.imports ?? []) visit(imported)
  }
  visit("index.html")
  if (routeKey) visit(routeKey)
  return { css: [...css], js: [...js] }
}

/** Inject head metadata, asset links and the rendered markup into the client template. */
export function injectPage(options: {
  template: string
  html: string
  head: PrerenderHead
  path: string
  assets: { css: string[]; js: string[] }
}): string {
  const { template, html, head, path, assets } = options
  const fresh = (file: string) => !template.includes(`/${file}"`)
  const links = [
    ...assets.css.filter(fresh).map((href) => `<link rel="stylesheet" crossorigin href="/${href}">`),
    ...assets.js.filter(fresh).map((href) => `<link rel="modulepreload" crossorigin href="/${href}">`),
  ].join("\n    ")
  return template
    .replace(/<html lang="[^"]*"/, () => `<html lang="${escapeHtml(head.lang)}" class="${escapeHtml(head.theme)}"`)
    .replace(/<title>[^<]*<\/title>/, () => `<title>${escapeHtml(head.title)}</title>`)
    .replace(
      /<meta name="description" content="[^"]*"\s*\/?>/,
      () => `<meta name="description" content="${escapeHtml(head.description)}" />`
    )
    .replace("</head>", () => `    ${links}\n  </head>`)
    .replace('<div id="root"></div>', () => `<div id="root" data-ssr="${escapeHtml(path)}">${html}</div>`)
}
