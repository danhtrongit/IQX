import { useNavigate } from "react-router"
import { IconFile } from "@arco-design/web-react/icon"
import { AnalysisEntryView } from "./AnalysisEntryView"

export function FinancialAnalysisView() {
  const navigate = useNavigate()
  return (
    <AnalysisEntryView
      icon={<IconFile />}
      title="Phân tích BCTC"
      subtitle="Báo cáo tài chính · Theo quý và cả năm"
      placeholder="Nhập mã cổ phiếu..."
      emptyIcon={<IconFile />}
      emptyTitle="Nhập mã cổ phiếu để bắt đầu"
      emptyDesc="Hệ thống sẽ phân tích báo cáo tài chính của doanh nghiệp — kết quả kinh doanh, cân đối kế toán, lưu chuyển tiền tệ và các chỉ số tài chính quan trọng theo từng quý."
      onSubmit={(sym) => navigate(`/co-phieu/${sym}?tab=financials`)}
    />
  )
}
