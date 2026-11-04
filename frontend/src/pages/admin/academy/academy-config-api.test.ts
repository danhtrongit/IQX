import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  createAcademyConfig,
  deleteAcademyConfig,
  fetchAcademyConfigLogs,
  fetchAcademyConfigs,
  previewAcademyConfig,
  saveAcademyConfig,
} from "./academy-config-api"

const mocks = vi.hoisted(() => ({ api: vi.fn() }))

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: mocks.api,
}))

beforeEach(() => {
  mocks.api.mockReset().mockResolvedValue({})
})

const lastCall = () => {
  const [path, init] = mocks.api.mock.calls.at(-1) as [string, RequestInit]
  return { path, method: init.method, body: init.body ? JSON.parse(String(init.body)) : undefined }
}

describe("academy config api", () => {
  it("lists the configs", async () => {
    await fetchAcademyConfigs()
    expect(lastCall()).toEqual({ path: "/admin/academy-configs", method: "GET", body: undefined })
  })

  it("previews a draft without saving anything", async () => {
    await previewAcademyConfig({ mode: "sequential", chapter_ids: ["ch01", "ch03"] })
    expect(lastCall()).toEqual({
      path: "/admin/academy-configs/preview",
      method: "POST",
      body: { mode: "sequential", chapter_ids: ["ch01", "ch03"] },
    })
  })

  it("creates the own config of a team lead", async () => {
    await createAcademyConfig({ leader_id: "lead-1", mode: "free", chapter_ids: ["ch01"] })
    expect(lastCall()).toEqual({
      path: "/admin/academy-configs",
      method: "POST",
      body: { leader_id: "lead-1", mode: "free", chapter_ids: ["ch01"] },
    })
  })

  it("saves a config by id", async () => {
    await saveAcademyConfig("cfg-1", { mode: "free", chapter_ids: ["ch02"] })
    expect(lastCall()).toEqual({
      path: "/admin/academy-configs/cfg-1",
      method: "PUT",
      body: { mode: "free", chapter_ids: ["ch02"] },
    })
  })

  it("deletes an own config by id", async () => {
    await deleteAcademyConfig("cfg-1")
    expect(lastCall()).toEqual({ path: "/admin/academy-configs/cfg-1", method: "DELETE", body: undefined })
  })

  it("reads the change log with a limit", async () => {
    await fetchAcademyConfigLogs("cfg-1")
    expect(lastCall()).toEqual({ path: "/admin/academy-configs/cfg-1/logs?limit=50", method: "GET", body: undefined })
  })
})
