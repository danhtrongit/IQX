import type { TestProject } from "vitest/node"

import { render } from "../../entry-server"

// react-dom/server must not run inside the jsdom environment (it clobbers the
// client renderer state), so the prerendered markup is produced once in plain
// Node here and handed to src/hydration.test.tsx through `inject`.
export default async function setup(project: TestProject) {
  const pages: Record<string, string> = {}
  for (const path of ["/", "/about"]) {
    pages[path] = (await render(new Request(`http://localhost${path}`))).html
  }
  project.provide("prerenderedPages", pages)
}

declare module "vitest" {
  export interface ProvidedContext {
    prerenderedPages: Record<string, string>
  }
}
