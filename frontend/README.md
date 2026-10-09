# React + TypeScript + Vite + shadcn/ui

This is a template for a new Vite project with React, TypeScript, and shadcn/ui.

## Adding components

To add components to your app, run the following command:

```bash
npx shadcn@latest add button
```

This will place the ui components in the `src/components` directory.

## Using components

To use the components in your app, import them as follows:

```tsx
import { Button } from "@/components/ui/button"
```

## Build-time prerendering (public pages)

`/` (Vietnamese introduction) and `/about` (English company page) are prerendered
at build time so their full content is in static HTML without JavaScript, then
hydrated on the client. Every other route stays a client-only SPA.

- `src/App.tsx` exports `routes`, shared by the browser router and the server.
- `src/app-providers.tsx` is the provider tree used by both `src/main.tsx` and
  `src/entry-server.tsx` (keep them identical so hydration matches).
- `vite-plugins/prerender.ts` runs after the client build. It bundles
  `src/entry-server.tsx` in a nested SSR build (temp dir under
  `node_modules/.cache`, removed afterwards), calls `render()` for `/` and
  `/about`, and injects markup, title, description, `lang`/theme class and the
  route's CSS/JS preloads (from `dist/.vite/manifest.json`) via
  `vite-plugins/prerender-html.ts`. The build fails if a route cannot render.
- `src/main.tsx` hydrates only when `#root[data-ssr]` equals the current path;
  otherwise it does a plain client render.

`npm run build` produces static files in `dist/`:

- `index.html` prerendered `/`; `about/index.html` prerendered `/about`.
- `app.html` the untouched SPA shell. nginx must use it as the fallback for all
  other routes (`try_files $uri $uri/ /app.html`), because `index.html` now
  carries the home page markup. `app.html` needs the same no-cache rule as
  `index.html`. See `backend/deploy/iqx-v2.tpl` / `.stpl`.

No Node process runs in production.
