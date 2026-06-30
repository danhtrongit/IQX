import { useState } from "react"
import { Button, Drawer } from "@arco-design/web-react"
import { IconApps } from "@arco-design/web-react/icon"
import { SymbolProvider, useSymbol } from "@/shared/contexts/symbol-context"
import { isIndexSymbol } from "@/features/stock"
import { MarketDailyPage } from "@/features/market-overview/daily/MarketDailyPage"
import { HomeSidePanel } from "./HomeSidePanel"
import { HomeIconRail } from "./HomeIconRail"
import { useInitialSymbol } from "./useInitialSymbol"
import type { HomeTab } from "./types"

function WorkspaceBody() {
  const { symbol } = useSymbol()
  const isIndex = isIndexSymbol(symbol)
  const [active, setActive] = useState<HomeTab>("order")
  const [drawerOpen, setDrawerOpen] = useState(false)

  const market = (
    <div className="min-h-0 overflow-y-auto">
      <MarketDailyPage />
    </div>
  )

  return (
    <div className="h-full">
      {/* Desktop / laptop: 3-column grid */}
      <div className="hidden h-full lg:grid lg:grid-cols-[1fr_320px_64px] xl:grid-cols-[1fr_360px_64px]">
        {market}
        <HomeSidePanel active={active} />
        <HomeIconRail active={active} onSelect={setActive} isIndex={isIndex} />
      </div>

      {/* Mobile / tablet: market full-width + FAB → drawer */}
      <div className="h-full lg:hidden">
        {market}
        <Button
          shape="circle"
          type="primary"
          size="large"
          aria-label="Mở bảng giao dịch"
          icon={<IconApps />}
          className="!fixed bottom-5 right-5 z-40 shadow-lg"
          onClick={() => setDrawerOpen(true)}
        />
        <Drawer
          visible={drawerOpen}
          placement="right"
          width={360}
          title={null}
          footer={null}
          onCancel={() => setDrawerOpen(false)}
          bodyStyle={{ padding: 0 }}
        >
          <div className="flex h-full">
            <div className="min-w-0 flex-1">
              <HomeSidePanel active={active} />
            </div>
            <HomeIconRail active={active} onSelect={setActive} isIndex={isIndex} />
          </div>
        </Drawer>
      </div>
    </div>
  )
}

export function HomeWorkspace() {
  const initial = useInitialSymbol()
  return (
    <SymbolProvider symbol={initial}>
      <WorkspaceBody />
    </SymbolProvider>
  )
}
