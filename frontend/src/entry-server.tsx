import { renderToReadableStream } from "react-dom/server"
import {
  createStaticHandler,
  createStaticRouter,
  matchRoutes,
  StaticRouterProvider,
} from "react-router"

import { routes, type PreloadableComponent } from "./App"
import { AppProviders, createAppQueryClient } from "./app-providers"
import { ABOUT_SEO } from "@/pages/about/about-content"
import { INTRODUCTION_SEO } from "@/pages/introduction/introduction-seo"

export type RenderResult = {
  html: string
  status: number
  head: { title: string; description: string; lang: string; theme: "light" | "dark" }
  /** Pathname after normalisation (no trailing slash except "/"). */
  pathname: string
}

const handler = createStaticHandler(routes)

function headFor(pathname: string): RenderResult["head"] {
  if (pathname === "/about") {
    return { ...ABOUT_SEO, lang: "en", theme: "light" }
  }
  return { ...INTRODUCTION_SEO, lang: "vi", theme: "light" }
}

export async function render(
  input: Request | { url: string }
): Promise<RenderResult> {
  const request =
    input instanceof Request ? input : new Request(input.url, { method: "GET" })
  const context = await handler.query(request)
  if (context instanceof Response) {
    // Redirects are not expected for the SSR paths; let the caller fall back.
    throw new Error(`Unexpected response ${context.status} while rendering`)
  }
  // Resolve the lazy page modules first so the shell renders the real page
  // (no Suspense fallback + out-of-order inline script that needs JS).
  await Promise.all(
    (matchRoutes(routes, new URL(request.url).pathname) ?? []).map((match) =>
      (match.route.Component as PreloadableComponent | undefined)?.preload?.()
    )
  )
  const router = createStaticRouter(handler.dataRoutes, context)
  const url = new URL(request.url)
  const pathname =
    url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname
  const queryClient = createAppQueryClient()

  let failure: unknown
  const stream = await renderToReadableStream(
    <AppProviders pathname={pathname} queryClient={queryClient}>
      <StaticRouterProvider
        router={router}
        context={context}
        hydrate={false}
      />
    </AppProviders>,
    {
      // Never outline large Suspense boundaries into out-of-order segments that
      // need inline scripts: the full page must be plain HTML.
      progressiveChunkSize: Number.POSITIVE_INFINITY,
      onError(error) {
        failure ??= error
      },
    }
  )
  await stream.allReady
  if (failure) throw failure
  const html = await new Response(stream).text()
  return { html, status: context.statusCode, head: headFor(pathname), pathname }
}
