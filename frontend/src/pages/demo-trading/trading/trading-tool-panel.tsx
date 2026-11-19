/**
 * LUYỆN TẬP → Giao dịch panel (layout v1.3 §3): the Đặt lệnh, Danh mục and Tin tức panels as tabs of one
 * panel titled "Giao dịch". A tab replaces the whole panel content; a tab stays mounted once opened, so the
 * order form keeps what was typed while another tab is on screen or the panel is collapsed.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react"

import { SidebarPanelGroupContext } from "@/components/layout/sidebar-panel-group"
import { cn } from "@/lib/utils"
import { TRADING_TABS, type TradingTab } from "../content-tabs-state"
import { NewsPanel } from "../market/news-panel"
import { PortfolioPanel } from "../portfolio/portfolio-panel"
import { OrderPanel } from "./order-panel"

export const TRADING_PANEL_TITLE = "Giao dịch"

const tabId = (base: string, instance: TradingTab, tab: TradingTab) => `${base}-${instance}-tab-${tab}`
const panelId = (base: string, tab: TradingTab) => `${base}-panel-${tab}`

function TradingTabBar({ base, instance, active, mounted, onSelect }: {
  base: string
  /** The tab whose panel holds this bar (each mounted panel has its own copy). */
  instance: TradingTab
  active: TradingTab
  mounted: ReadonlySet<TradingTab>
  onSelect: (tab: TradingTab, viaKeyboard: boolean) => void
}) {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
    event.preventDefault()
    const index = TRADING_TABS.findIndex((tab) => tab.id === active)
    const step = event.key === "ArrowRight" ? 1 : -1
    onSelect(TRADING_TABS[(index + step + TRADING_TABS.length) % TRADING_TABS.length].id, true)
  }
  return (
    <div role="tablist" aria-label={TRADING_PANEL_TITLE} onKeyDown={onKeyDown} className="grid shrink-0 grid-cols-3 border-b border-border bg-card">
      {TRADING_TABS.map((tab) => {
        const selected = tab.id === active
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={tabId(base, instance, tab.id)}
            aria-selected={selected}
            aria-controls={mounted.has(tab.id) ? panelId(base, tab.id) : undefined}
            tabIndex={selected ? 0 : -1}
            data-trading-tab={tab.id}
            onClick={() => onSelect(tab.id, false)}
            className={cn(
              "relative h-10 min-w-0 truncate px-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
              selected
                ? "text-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

export function TradingToolPanel({ tab, onTabChange, symbol, onSymbolChange, onNavigate }: {
  tab: TradingTab
  onTabChange: (tab: TradingTab) => void
  symbol: string
  onSymbolChange: (symbol: string) => void
  /** Links between the panels and to other tools (e.g. a holding opens Đặt lệnh with its symbol). */
  onNavigate: (panel: string, symbol?: string) => void
}) {
  const base = useId()
  const [mounted, setMounted] = useState<ReadonlySet<TradingTab>>(() => new Set([tab]))
  if (!mounted.has(tab)) setMounted(new Set([...mounted, tab]))
  // Arrow keys move the focus with the selection; the selected tab lives in the bar of the new panel.
  const focusAfterSwitch = useRef<TradingTab | null>(null)
  useEffect(() => {
    if (focusAfterSwitch.current !== tab) return
    focusAfterSwitch.current = null
    document.getElementById(tabId(base, tab, tab))?.focus()
  }, [base, tab])

  function select(next: TradingTab, viaKeyboard: boolean) {
    if (viaKeyboard) focusAfterSwitch.current = next
    if (next !== tab) onTabChange(next)
  }

  return TRADING_TABS.filter((item) => mounted.has(item.id)).map((item) => {
    const active = item.id === tab
    return (
      <div
        key={item.id}
        id={panelId(base, item.id)}
        role="tabpanel"
        aria-labelledby={tabId(base, item.id, item.id)}
        hidden={!active}
        data-trading-panel={item.id}
        className={cn("min-h-0 flex-1 flex-col", active ? "flex" : "hidden")}
      >
        <SidebarPanelGroupContext.Provider
          value={{ title: TRADING_PANEL_TITLE, tabs: <TradingTabBar base={base} instance={item.id} active={tab} mounted={mounted} onSelect={select} /> }}
        >
          {item.id === "dat-lenh" ? (
            <OrderPanel symbol={symbol} onSymbolChange={onSymbolChange} />
          ) : item.id === "danh-muc" ? (
            <PortfolioPanel symbol={symbol} onSymbolChange={onSymbolChange} onNavigate={onNavigate} />
          ) : (
            <NewsPanel symbol={symbol} />
          )}
        </SidebarPanelGroupContext.Provider>
      </div>
    )
  })
}
