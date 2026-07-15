import { useState } from "react"
import { IconFile } from "@arco-design/web-react/icon"
import { BctcDashboard } from "@/features/stock/bctc-dashboard"
import { AnalysisEntryView } from "./AnalysisEntryView"

export function FinancialAnalysisView() {
  const [symbol, setSymbol] = useState<string | null>(null)
  return (
    <AnalysisEntryView
      icon={<IconFile />}
      title="Phân tích BCTC"
      subtitle="Báo cáo tài chính · Theo quý và cả năm"
      placeholder="Nhập mã cổ phiếu..."
      emptyIcon={<IconFile />}
      emptyTitle="Nhập mã cổ phiếu để bắt đầu"
      emptyDesc="Hệ thống sẽ phân tích báo cáo tài chính của doanh nghiệp — kết quả kinh doanh, cân đối kế toán, lưu chuyển tiền tệ và các chỉ số tài chính quan trọng theo từng quý."
      onSubmit={setSymbol}
      result={
        symbol ? (
          <div className="pt-6">
            {/* key=symbol forces a remount on symbol change, same reason as StockAnalysisView:
                avoids stale data from the previous symbol lingering after a resubmit. */}
            <BctcDashboard key={symbol} symbol={symbol} />
          </div>
        ) : undefined
      }
    />
  )
}
