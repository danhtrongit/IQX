import { Header, Footer } from "@/components/layout"
import { MarketDataProvider } from "@/contexts/market-data-context"
import { SymbolProvider } from "@/contexts/symbol-context"
import { PremiumGate } from "@/components/premium/premium-gate"
import { ForecastPage } from "@/components/forecast/forecast-page"
import { useSEO } from "@/hooks/use-seo"

export default function DuBaoPage() {
  useSEO({
    title: "Đề xuất đầu tư | IQX",
    description: "Bảng xếp hạng AI dự báo lợi nhuận cổ phiếu T+3 / T+5 / T+10 kèm phân tích 5 lớp dữ liệu, chỉ số BCTC và AI mẫu hình.",
    url: "https://iqx.vn/du-bao",
  })

  return (
    <MarketDataProvider>
      <SymbolProvider symbol="VNINDEX">
        <div className="flex h-svh flex-col overflow-hidden bg-background">
          <Header />
          <div className="flex-1 min-h-0 overflow-hidden">
            <PremiumGate
              featureName="Mô hình dự báo"
              description="Bảng xếp hạng cổ phiếu theo dự báo lợi nhuận T+3/T+5/T+10."
            >
              <ForecastPage />
            </PremiumGate>
          </div>
          <Footer />
        </div>
      </SymbolProvider>
    </MarketDataProvider>
  )
}
