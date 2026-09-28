import { createContext, useContext, type ReactNode } from "react"
import { useMatches, useSearchParams } from "react-router"

import {
  emptyChrome,
  type RailItem,
  type RouteChrome,
} from "@/config/chrome"

type RailContextValue = {
  chrome: RouteChrome
  activeId: string
  activeItem: RailItem | undefined
  activeContentId: string | null
  setActive: (id: string) => void
}

const RailContext = createContext<RailContextValue | null>(null)

type Handle = { chrome?: RouteChrome }

function useChromeFromRoute(): RouteChrome {
  const matches = useMatches()
  for (let i = matches.length - 1; i >= 0; i--) {
    const chrome = (matches[i].handle as Handle | undefined)?.chrome
    if (chrome) return chrome
  }
  return emptyChrome
}

export function RailProvider({ children }: { children: ReactNode }) {
  const chrome = useChromeFromRoute()
  const [params, setParams] = useSearchParams()
  const fromUrl = params.get(chrome.param)
  const activeId =
    fromUrl && chrome.items.some((item) => item.id === fromUrl && item.affects === "sidebar")
      ? fromUrl
      : chrome.defaultId
  const activeItem = chrome.items.find((item) => item.id === activeId)
  const activeContentId = params.get("content")

  function setActive(id: string) {
    const next = new URLSearchParams(params)
    if (!chrome.param) return
    const item = chrome.items.find(item => item.id === id)
    if (!item) return
    next.set(item.affects === "left" ? "content" : chrome.param, id)
    setParams(next, { replace: true })
  }

  return (
    <RailContext.Provider value={{ chrome, activeId, activeItem, activeContentId, setActive }}>
      {children}
    </RailContext.Provider>
  )
}

export function useRail() {
  const ctx = useContext(RailContext)
  if (!ctx) throw new Error("useRail must be used within RailProvider")
  return ctx
}
