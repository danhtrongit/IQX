import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { sectionOfSearch, sectionSearch, useWorkspaceMemory, workspaceMemory } from "./workspace-sections"

const STORAGE_KEY = "iqx.workspace.sections.v1"

beforeEach(() => {
  workspaceMemory.reset()
  sessionStorage.clear()
})

describe("sectionOfSearch", () => {
  it.each([
    ["", "demo"],
    ["?view=trading", "demo"],
    ["?view=news&content=board", "demo"],
    ["?view=hunt", "demo"],
    ["?view=unknown", "demo"],
    ["?view=academy", "academy"],
    ["?view=bot&symbol=FPT", "academy"],
    ["?view=shop", "academy"],
    // Retired journey links are read through the loader's rewrite.
    ["?view=journey", "academy"],
    ["?view=identity", "academy"],
  ])("%s is in the %s section", (search, section) => {
    expect(sectionOfSearch(search)).toBe(section)
  })
})

describe("workspaceMemory", () => {
  it("remembers only the section's own params", () => {
    workspaceMemory.remember("demo", "?view=portfolio&content=board&symbol=VNM&tour=bantin")
    workspaceMemory.remember("academy", "?view=bot&lesson=ch01-l01&practice=p1&content=board&symbol=VNM")
    expect(workspaceMemory.get().demo?.params).toBe("view=portfolio&content=board")
    expect(workspaceMemory.get().academy?.params).toBe("view=bot&lesson=ch01-l01&practice=p1")
  })

  it("remembers the last DEMO TRADING tab, but never Insight", () => {
    workspaceMemory.remember("demo", "?content=market")
    expect(workspaceMemory.get().demo?.lastTab).toBe("market")
    workspaceMemory.remember("demo", "?content=insight")
    expect(workspaceMemory.get().demo?.lastTab).toBe("market")
    workspaceMemory.remember("demo", "")
    expect(workspaceMemory.get().demo?.lastTab).toBe("chart")
    workspaceMemory.remember("academy", "?view=bot&content=board")
    expect(workspaceMemory.get().academy?.lastTab).toBeUndefined()
  })

  it("tracks the collapsed panel tool per section", () => {
    workspaceMemory.setCollapsedTool("demo", "trading")
    expect(workspaceMemory.get().demo?.collapsedTool).toBe("trading")
    expect(workspaceMemory.get().academy).toBeUndefined()
    workspaceMemory.setCollapsedTool("demo", null)
    expect(workspaceMemory.get().demo?.collapsedTool).toBeNull()
  })

  it("persists in sessionStorage and forgets everything on reset", () => {
    workspaceMemory.remember("academy", "?view=shop")
    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY)!)).toMatchObject({ academy: { params: "view=shop" } })
    workspaceMemory.reset()
    expect(workspaceMemory.get()).toEqual({})
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it("keeps working when sessionStorage throws", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota")
    })
    expect(() => workspaceMemory.remember("demo", "?view=news")).not.toThrow()
    expect(workspaceMemory.get().demo?.params).toBe("view=news")
    spy.mockRestore()
  })

  it("does not publish a new snapshot when nothing changed", () => {
    workspaceMemory.remember("demo", "?view=news")
    const before = workspaceMemory.get()
    workspaceMemory.remember("demo", "?view=news")
    expect(workspaceMemory.get()).toBe(before)
  })

  it("re-renders hook users when the memory changes", () => {
    const { result } = renderHook(() => useWorkspaceMemory())
    expect(result.current).toEqual({})
    act(() => workspaceMemory.remember("academy", "?view=shop"))
    expect(result.current.academy?.params).toBe("view=shop")
  })
})

describe("sectionSearch", () => {
  it("opens the section's default tool when nothing is remembered", () => {
    expect(sectionSearch("demo", "", {})).toBe("?view=trading")
    expect(sectionSearch("academy", "", {})).toBe("?view=academy")
  })

  it("keeps shared params and drops the other section's own params", () => {
    expect(sectionSearch("academy", "?view=trading&content=board&symbol=VNM&tour=bantin&analysis=stock", {}))
      .toBe("?symbol=VNM&tour=bantin&view=academy")
    expect(sectionSearch("demo", "?view=bot&lesson=ch01-l01&symbol=VNM", {})).toBe("?symbol=VNM&view=trading")
  })

  it("applies the remembered params", () => {
    workspaceMemory.remember("academy", "?view=shop")
    workspaceMemory.remember("demo", "?view=news&content=market")
    expect(sectionSearch("academy", "?view=trading&symbol=FPT", workspaceMemory.get())).toBe("?symbol=FPT&view=shop")
    expect(sectionSearch("demo", "?view=bot&symbol=FPT", workspaceMemory.get())).toBe("?symbol=FPT&view=news&content=market")
  })

  it("ignores a remembered tool that belongs to the other section", () => {
    const saved = { academy: { params: "view=trading" }, demo: { params: "view=bot" } }
    expect(sectionSearch("academy", "", saved)).toBe("?view=academy")
    expect(sectionSearch("demo", "", saved)).toBe("?view=trading")
  })
})
