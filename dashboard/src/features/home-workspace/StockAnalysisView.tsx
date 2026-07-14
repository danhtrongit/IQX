import { useState } from "react"
import { IconArrowRise } from "@arco-design/web-react/icon"
import { AiInsightBriefing } from "@/features/stock"
import { PremiumGate } from "@/features/premium"
import { AnalysisEntryView } from "./AnalysisEntryView"

export function StockAnalysisView() {
  const [symbol, setSymbol] = useState<string | null>(null)
  return (
    <AnalysisEntryView
      icon={<IconArrowRise />}
      title="Phân tích cổ phiếu"
      subtitle="6 lớp dữ liệu · Cập nhật theo phiên giao dịch"
      placeholder="Nhập mã cổ phiếu..."
      emptyIcon={<IconArrowRise />}
      emptyTitle="Nhập mã cổ phiếu để bắt đầu"
      emptyDesc="Hệ thống sẽ phân tích cổ phiếu qua 6 lớp dữ liệu: kỹ thuật, giao dịch nước ngoài, tự doanh CTCK, giao dịch nội bộ, tin tức & sự kiện, và cơ bản – định giá."
      onSubmit={setSymbol}
      result={
        symbol ? (
          <div className="pt-6">
            <PremiumGate
              featureName="AI Insight"
              description="Phân tích AI đa lớp cho mã đang xem (Xu hướng, Thanh khoản, Dòng tiền, Nội bộ, Tin tức)."
            >
              <AiInsightBriefing symbol={symbol} />
            </PremiumGate>
          </div>
        ) : undefined
      }
    />
  )
}
