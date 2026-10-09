import { describe, expect, it } from "vitest"

/**
 * Học viện only reads lessons, records completion and shows progress. It has no Cấu hình, no
 * ON/OFF switch, no practice and never talks to the shared Buy/Sell configuration. This guards
 * the source of the whole tool (tests and fixtures aside), next to the DOM checks of the panel.
 */
const sources = import.meta.glob(["./**/*.{ts,tsx}", "!./**/*.test.{ts,tsx}", "!./test-*.{ts,tsx}"], { query: "?raw", import: "default", eager: true }) as Record<string, string>

describe("Học viện has no configuration surface", () => {
  it("scans the real source files", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(20)
    expect(Object.keys(sources)).toContain("./academy-panel.tsx")
    expect(Object.keys(sources)).toContain("./quiz/quiz-flow.tsx")
  })

  it("does not import the shared config, the registry, the switch component or any practice code", () => {
    for (const [file, text] of Object.entries(sources)) {
      expect(text, file).not.toMatch(/shared-config|strategy\/shared|indicator-config|config-draft|components\/ui\/switch|\/practice/)
    }
  })

  it("renders no switch, no Cấu hình / Luyện tập control and no ON/OFF wording", () => {
    for (const [file, text] of Object.entries(sources)) {
      expect(text, file).not.toMatch(/role="switch"|<Switch\b|Cấu hình|Luyện tập|"ON"|"OFF"/)
    }
  })

  it("never writes configuration, grants or wallet state: the only mutations are attempts, drafts, submits and guide completion", () => {
    const mutations = Object.entries(sources).flatMap(([file, text]) =>
      [...text.matchAll(/requestOperation\(\s*"((?:POST|PUT|PATCH|DELETE) [^"]+)"/g)].map((match) => `${file} ${match[1]}`),
    )
    expect(mutations.map((entry) => entry.split(" ").slice(1).join(" ")).sort()).toEqual([
      "POST /api/v2/academy/attempts",
      "POST /api/v2/academy/attempts/{attemptId}/submit",
      "POST /api/v2/academy/lessons/{lessonId}/complete",
      "PUT /api/v2/academy/attempts/{attemptId}/answers",
    ])
  })
})
