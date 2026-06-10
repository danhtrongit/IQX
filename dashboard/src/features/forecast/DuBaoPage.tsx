import { useEffect } from "react"
import { PremiumGate } from "@/features/premium"
import { ForecastView } from "./components/ForecastView"

const SEO = {
  title: "Đề xuất đầu tư | IQX",
}

/**
 * Full-page forecast view (`/du-bao`). Premium-gated (AI). The app shell owns the
 * header/footer chrome, so this page renders only the gated forecast surface.
 * Ported from `dashboard-bak/src/pages/du-bao.tsx`.
 */
export function DuBaoPage() {
  useEffect(() => {
    const prevTitle = document.title
    document.title = SEO.title
    return () => {
      document.title = prevTitle
    }
  }, [])

  return (
    <div className="h-full min-h-0 overflow-hidden">
      <PremiumGate
        featureName="Mô hình dự báo"
        description="Bảng xếp hạng cổ phiếu theo dự báo lợi nhuận T+3/T+5/T+10."
      >
        <ForecastView />
      </PremiumGate>
    </div>
  )
}

export default DuBaoPage
