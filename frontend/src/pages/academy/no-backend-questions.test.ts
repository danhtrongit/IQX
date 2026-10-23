import { describe, expect, it } from "vitest"

/**
 * The private question banks (`backend/src/modules/academy/content/v3/questions/*.private.json`)
 * hold the answer keys. No frontend file may import or read them, tests included: the renderer
 * integration test reads only `content/v3/lessons` and `catalog.json`.
 */
const sources = import.meta.glob(["/src/**/*.{ts,tsx,js,mjs,json}", "/e2e/**/*.{ts,tsx}", "/scripts/**/*.{js,mjs,ts}"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>

const SELF = "/src/pages/academy/no-backend-questions.test.ts"
/** The Playwright spec answers through the real backend and may read the banks on the Node side (design §9). */
const ALLOWED = new Set(["/e2e/academy-v33.spec.ts"])

describe("frontend never touches the private question banks", () => {
  it("scans the frontend sources", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(100)
    expect(Object.keys(sources)).toContain("/src/pages/academy/charts/real-content.test.tsx")
  })

  it("has no import, glob or path to content/v3/questions or a .private.json file", () => {
    const offenders = Object.entries(sources)
      .filter(([file]) => file !== SELF && !ALLOWED.has(file))
      .filter(([, text]) => /content\/v3\/questions|academy\/content\/v3\/\*\*|\.private\.json/.test(text))
      .map(([file]) => file)
    expect(offenders).toEqual([])
  })
})
