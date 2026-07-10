import { useNavigate } from "react-router"
import { IconArrowRise } from "@arco-design/web-react/icon"
import { AnalysisEntryView } from "./AnalysisEntryView"

export function StockAnalysisView() {
  const navigate = useNavigate()
  return (
    <AnalysisEntryView
      icon={<IconArrowRise />}
      title="Phân tích cổ phiếu"
      subtitle="6 lớp dữ liệu · Cập nhật theo phiên giao dịch"
      placeholder="Nhập mã cổ phiếu..."
      emptyIcon={<IconArrowRise />}
      emptyTitle="Nhập mã cổ phiếu để bắt đầu"
      emptyDesc="Hệ thống sẽ phân tích cổ phiếu qua 6 lớp dữ liệu: kỹ thuật, giao dịch nước ngoài, tự doanh CTCK, giao dịch nội bộ, tin tức & sự kiện, và cơ bản – định giá."
      onSubmit={(sym) => navigate(`/co-phieu/${sym}`)}
    />
  )
}
