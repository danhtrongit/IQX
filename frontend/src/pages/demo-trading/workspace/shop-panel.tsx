import { Store } from "lucide-react"

import { SidebarPanel } from "@/components/layout/sidebar-panel"

/**
 * «Shop» tool panel (xu học tập và linh thú).
 *
 * The wallet and the mascot catalog are not connected yet, so this shows an
 * honest empty state instead of a balance or a price list.
 */
export function ShopPanel() {
  return (
    <SidebarPanel title="Shop" description="Xu học tập và linh thú">
      <div className="flex flex-col items-center gap-2 px-4 py-14 text-center" data-testid="shop-empty">
        <Store className="size-6 text-muted-foreground/60" aria-hidden="true" />
        <p className="text-sm font-medium">Shop chưa sẵn sàng</p>
        <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
          Số dư xu, lịch sử xu và các linh thú có thể sở hữu sẽ hiển thị tại đây khi Shop được mở. Linh thú hiện tại vẫn đồng
          hành cùng bạn.
        </p>
      </div>
    </SidebarPanel>
  )
}
