import { useEffect, useState } from "react"
import { Button, Drawer } from "@arco-design/web-react"
import { IconApps } from "@arco-design/web-react/icon"
import { SymbolProvider, useSymbol } from "@/shared/contexts/symbol-context"
import { isIndexSymbol } from "@/features/stock"
import { HomeMarketView } from "@/features/market-overview/HomeMarketView"
import { HomeSidePanel } from "./HomeSidePanel"
import { HomeIconRail } from "./HomeIconRail"
import { useInitialSymbol, persistLastViewedSymbol } from "./useInitialSymbol"
import { useMediaQuery } from "./useMediaQuery"
import type { HomeTab } from "./types"

function WorkspaceBody() {
  const { symbol } = useSymbol()
  const isIndex = isIndexSymbol(symbol)
  const [active, setActive] = useState<HomeTab>("order")
  const [drawerOpen, setDrawerOpen] = useState(false)
  const isDesktop = useMediaQuery("(min-width: 1024px)")

  useEffect(() => {
    persistLastViewedSymbol(symbol)
  }, [symbol])

  const market = (
    <div className="min-h-0 overflow-y-auto">
      <HomeMarketView />
    </div>
  )

  return (
    <div className="h-full">
      {isDesktop ? (
        <div className="h-full grid grid-cols-[1fr_320px_64px] xl:grid-cols-[1fr_360px_64px]">
          {market}
          <HomeSidePanel active={active} />
          <HomeIconRail active={active} onSelect={setActive} isIndex={isIndex} />
        </div>
      ) : (
        <div className="h-full">
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
            width={Math.min(
              360,
              typeof window !== "undefined" ? window.innerWidth : 360,
            )}
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
      )}
    </div>
  )
}

export function HomeWorkspace() {
  const resolved = useInitialSymbol()
  const [initial] = useState(resolved)
  return (
    <SymbolProvider symbol={initial}>
      <WorkspaceBody />
    </SymbolProvider>
  )
}
