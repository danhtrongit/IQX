import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { sectionSearch, useWorkspaceMemory, withTool, workspaceMemory } from "./workspace-sections"

const STORAGE_KEY = "iqx.workspace.sections.v2"

beforeEach(() => {
  workspaceMemory.reset()
  sessionStorage.clear()
})

describe("workspaceMemory", () => {
  it("remembers only the section's own params", () => {
    workspaceMemory.remember("practice", "?tool=giao-dich&tab=danh-muc&content=board&symbol=VNM&tour=bantin")
    workspaceMemory.remember("flashback", "?tool=shop&symbol=VNM&tab=dat-lenh")
    expect(workspaceMemory.get().practice?.params).toBe("tool=giao-dich&tab=danh-muc&content=board")
    expect(workspaceMemory.get().flashback?.params).toBe("tool=shop")
    workspaceMemory.remember("practice", "?tool=bot&lesson=ch01-l01&practice=p1&symbol=VNM")
    expect(workspaceMemory.get().practice?.params).toBe("tool=bot&lesson=ch01-l01&practice=p1")
  })

  it("remembers the Giao dịch tabs (main area and panel) only while Giao dịch is open, never Insight", () => {
    workspaceMemory.remember("practice", "?tool=giao-dich&tab=tin-tuc&content=market")
    expect(workspaceMemory.get().practice).toMatchObject({ lastTab: "market", tradingTab: "tin-tuc" })
    workspaceMemory.remember("practice", "?tool=bot")
    expect(workspaceMemory.get().practice).toMatchObject({ lastTab: "market", tradingTab: "tin-tuc" })
    workspaceMemory.remember("practice", "?tool=giao-dich&tab=dat-lenh")
    expect(workspaceMemory.get().practice).toMatchObject({ lastTab: "chart", tradingTab: "dat-lenh" })
    workspaceMemory.remember("flashback", "?tool=shop&content=board")
    expect(workspaceMemory.get().flashback?.lastTab).toBeUndefined()
  })

  it("tracks the collapsed panel tool per section", () => {
    workspaceMemory.setCollapsedTool("practice", "giao-dich")
    expect(workspaceMemory.get().practice?.collapsedTool).toBe("giao-dich")
    expect(workspaceMemory.get().flashback).toBeUndefined()
    workspaceMemory.setCollapsedTool("flashback", "shop")
    workspaceMemory.setCollapsedTool("practice", null)
    expect(workspaceMemory.get().practice?.collapsedTool).toBeNull()
    expect(workspaceMemory.get().flashback?.collapsedTool).toBe("shop")
  })

  it("persists in sessionStorage under a new key and forgets everything on reset", () => {
    workspaceMemory.remember("flashback", "?tool=shop")
    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY)!)).toMatchObject({ flashback: { params: "tool=shop" } })
    workspaceMemory.reset()
    expect(workspaceMemory.get()).toEqual({})
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it("keeps working when sessionStorage throws", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota")
    })
    expect(() => workspaceMemory.remember("practice", "?tool=bot")).not.toThrow()
    expect(workspaceMemory.get().practice?.params).toBe("tool=bot")
    spy.mockRestore()
  })

  it("does not publish a new snapshot when nothing changed", () => {
    workspaceMemory.remember("practice", "?tool=bot")
    const before = workspaceMemory.get()
    workspaceMemory.remember("practice", "?tool=bot")
    expect(workspaceMemory.get()).toBe(before)
  })

  it("re-renders hook users when the memory changes", () => {
    const { result } = renderHook(() => useWorkspaceMemory())
    expect(result.current).toEqual({})
    act(() => workspaceMemory.remember("flashback", "?tool=shop"))
    expect(result.current.flashback?.params).toBe("tool=shop")
  })
})

describe("withTool", () => {
  const params = (search: string) => new URLSearchParams(search)

  it("drops the Giao dịch tabs for any other tool and keeps the rest", () => {
    expect(withTool(params("tool=giao-dich&tab=danh-muc&content=board&symbol=FPT&lesson=x"), "hoc-vien", undefined).toString())
      .toBe("tool=hoc-vien&symbol=FPT&lesson=x")
  })

  it("brings Giao dịch back with its remembered tabs", () => {
    const saved = { tradingTab: "tin-tuc" as const, lastTab: "board" as const }
    expect(withTool(params("tool=bot&symbol=FPT"), "giao-dich", saved).toString()).toBe("tool=giao-dich&symbol=FPT&tab=tin-tuc&content=board")
    expect(withTool(params("tool=bot"), "giao-dich", undefined).toString()).toBe("tool=giao-dich&tab=dat-lenh")
  })

  it("keeps the tabs on screen when Giao dịch is already open, unless a tab is asked for", () => {
    const saved = { tradingTab: "tin-tuc" as const, lastTab: "board" as const }
    expect(withTool(params("tool=giao-dich&tab=danh-muc&content=market"), "giao-dich", saved).toString()).toBe("tool=giao-dich&tab=danh-muc&content=market")
    expect(withTool(params("tool=giao-dich&tab=danh-muc"), "giao-dich", saved, "dat-lenh").toString()).toBe("tool=giao-dich&tab=dat-lenh")
  })
})

describe("sectionSearch", () => {
  it("opens the section's default tool when nothing is remembered", () => {
    expect(sectionSearch("practice", "", {})).toBe("?tool=candle-dojo")
    expect(sectionSearch("flashback", "", {})).toBe("?tool=flashback")
  })

  it("keeps shared params and drops the other section's own params", () => {
    expect(sectionSearch("flashback", "?tool=giao-dich&tab=danh-muc&content=board&symbol=VNM&tour=bantin&analysis=stock", {}))
      .toBe("?tool=flashback&symbol=VNM&tour=bantin")
    expect(sectionSearch("practice", "?tool=shop&symbol=VNM", {})).toBe("?tool=candle-dojo&symbol=VNM")
  })

  it("applies the remembered params of each section", () => {
    workspaceMemory.remember("flashback", "?tool=shop")
    workspaceMemory.remember("practice", "?tool=giao-dich&tab=tin-tuc&content=market")
    expect(sectionSearch("flashback", "?tool=giao-dich&symbol=FPT", workspaceMemory.get())).toBe("?tool=shop&symbol=FPT")
    expect(sectionSearch("practice", "?tool=shop&symbol=FPT", workspaceMemory.get())).toBe("?tool=giao-dich&tab=tin-tuc&content=market&symbol=FPT")
  })

  it("ignores a remembered tool that belongs to the other section", () => {
    const saved = { flashback: { params: "tool=giao-dich" }, practice: { params: "tool=shop" } }
    expect(sectionSearch("flashback", "", saved)).toBe("?tool=flashback")
    expect(sectionSearch("practice", "", saved)).toBe("?tool=candle-dojo")
  })

  it("opens a requested tool with its remembered params when it is the remembered tool", () => {
    workspaceMemory.remember("practice", "?tool=hoc-vien&lesson=ch01-l01")
    expect(sectionSearch("practice", "?tool=shop", workspaceMemory.get(), { id: "hoc-vien" })).toBe("?tool=hoc-vien&lesson=ch01-l01")
    expect(sectionSearch("practice", "?tool=shop", workspaceMemory.get(), { id: "bot" })).toBe("?tool=bot")
    expect(sectionSearch("practice", "", workspaceMemory.get(), { id: "giao-dich", tab: "danh-muc" })).toBe("?tool=giao-dich&tab=danh-muc")
  })
})
