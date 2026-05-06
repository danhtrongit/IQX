import {
  Header,
  MarketBar,
  CenterPanel,
  RightSidebar,
  RightToolbar,
  Footer,
} from "@/components/layout"
import { NewsMarkPopover } from "@/components/chart/news-mark-popover"
import { SymbolProvider } from "@/contexts/symbol-context"
import { MarketDataProvider } from "@/contexts/market-data-context"
import { toast } from "sonner"
import { Lightbulb } from "lucide-react"
import { useSEO } from "@/hooks/use-seo"
import { useState } from "react"

export default function DashboardPage() {
  useSEO({
    title: "IQX Dashboard - Toàn Cảnh Thị Trường",
    description: "Nhận định diễn biến thị trường tỷ đô, VN-Index, dòng tiền và tin tức tác động đến thị trường chứng khoán Việt Nam.",
    url: "https://beta.iqx.vn/dashboard",
  });
  const handleActionClick = (id: string) => {
    if (id === "ai-insight") {
      toast("AI Phân tích chưa khả dụng", {
        description:
          "Vui lòng chọn một mã cổ phiếu cụ thể (VD: VCB, FPT, HPG) để sử dụng tính năng AI Phân tích.",
        icon: <Lightbulb className="size-4 text-amber-500" />,
        duration: 4000,
      })
    }
  }

  const [activeMarkId, setActiveMarkId] = useState<string | number | null>(null)

  return (
    <MarketDataProvider>
      <SymbolProvider symbol="VNINDEX">
        <div id="dashboard-root" className="flex h-svh flex-col overflow-hidden bg-background">
          <Header />
          <MarketBar />

          <div className="flex flex-1 min-h-0 pb-[52px] md:pb-0">
            <CenterPanel onMarkClick={setActiveMarkId} />
            <RightSidebar />
            <RightToolbar onActionClick={handleActionClick} />
          </div>

          <Footer />

          {/* News Mark Popover */}
          <NewsMarkPopover
            symbol="VNINDEX"
            markId={activeMarkId}
            onClose={() => setActiveMarkId(null)}
          />
        </div>
      </SymbolProvider>
    </MarketDataProvider>
  )
}
