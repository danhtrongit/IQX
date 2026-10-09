import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { build, type Plugin, type ResolvedConfig } from "vite"

import { collectAssets, injectPage, type Manifest, type PrerenderHead } from "./prerender-html.ts"

type RenderResult = { html: string; head: PrerenderHead; pathname: string }

const ROUTE_CHUNKS: Record<string, string> = {
  "/": "src/pages/introduction/introduction-page.tsx",
  "/about": "src/pages/about/about-page.tsx",
}

/**
 * Build-time prerender. After the client build it bundles src/entry-server.tsx
 * in a nested SSR build, renders each route and writes static HTML into dist/:
 *   app.html          untouched client shell (SPA fallback for other routes)
 *   index.html        "/"
 *   <route>/index.html  other routes
 */
export function prerender(options: { routes: string[] }): Plugin {
  let config: ResolvedConfig
  return {
    name: "iqx-prerender",
    apply: (userConfig, env) => env.command === "build" && !userConfig.build?.ssr,
    configResolved(resolved) {
      config = resolved
    },
    async closeBundle() {
      const root = config.root
      const outDir = resolve(root, config.build.outDir)
      const tmpDir = join(root, "node_modules/.cache", `iqx-prerender-${process.pid}-${Date.now()}`)
      await rm(tmpDir, { recursive: true, force: true })
      try {
        const template = await readFile(join(outDir, "index.html"), "utf8")
        if (template.includes("data-ssr")) throw new Error("prerender: dist/index.html is already prerendered")
        const manifest = JSON.parse(
          await readFile(join(outDir, ".vite/manifest.json"), "utf8")
        ) as Manifest

        await build({
          root,
          configFile: config.configFile || false,
          mode: config.mode,
          logLevel: "warn",
          build: { ssr: "src/entry-server.tsx", outDir: tmpDir, emptyOutDir: true },
        })

        const entry = join(tmpDir, "entry-server.js")
        const { render } = (await import(pathToFileURL(entry).href)) as {
          render: (request: Request) => Promise<RenderResult>
        }

        await cp(join(outDir, "index.html"), join(outDir, "app.html"))
        for (const route of options.routes) {
          let result: RenderResult
          try {
            result = await render(new Request(`http://localhost${route}`))
          } catch (error) {
            throw new Error(`prerender: rendering ${route} failed`, { cause: error })
          }
          if (result.pathname !== route) throw new Error(`prerender: ${route} rendered as ${result.pathname}`)
          const page = injectPage({
            template,
            html: result.html,
            head: result.head,
            path: route,
            assets: collectAssets(manifest, ROUTE_CHUNKS[route]),
          })
          for (const marker of [`data-ssr="${route}"`, `<title>${result.head.title.replaceAll("&", "&amp;")}`]) {
            if (!page.includes(marker)) throw new Error(`prerender: ${route} output is missing ${marker}`)
          }
          if (result.html.length < 500) throw new Error(`prerender: ${route} rendered suspiciously little markup`)
          const file = route === "/" ? join(outDir, "index.html") : join(outDir, route, "index.html")
          await mkdir(dirname(file), { recursive: true })
          await writeFile(file, page)
          config.logger.info(`prerendered ${route} -> ${file.slice(root.length + 1)} (${page.length} bytes)`)
        }
      } finally {
        await rm(tmpDir, { recursive: true, force: true })
      }
    },
  }
}
