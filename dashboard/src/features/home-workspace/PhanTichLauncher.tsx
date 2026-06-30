import { Button } from "@arco-design/web-react"
import { useNavigate } from "react-router"
import { useSymbol } from "@/shared/contexts/symbol-context"
import { isIndexSymbol } from "@/features/stock"
import { IconBulb } from "@/shared/icons"

/** Shared "choose a stock" empty state (Phân tích + Mẫu nến tabs, spec §6.3). */
export function SelectStockEmptyState({ what = "phân tích" }: { what?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-[var(--color-text-3)]">
      <span className="text-2xl" aria-hidden>↑</span>
      <p className="text-sm">📊 Hãy chọn mã CK ở header bên trên để bắt đầu {what}.</p>
    </div>
  )
}

export function PhanTichLauncher() {
  const { symbol } = useSymbol()
  const navigate = useNavigate()

  if (isIndexSymbol(symbol)) {
    return <SelectStockEmptyState what="phân tích" />
  }

  return (
    <div className="px-3 py-4">
      <div className="rounded-lg border border-[var(--color-border-2)] bg-[var(--color-bg-1)] p-4">
        <div className="mb-1 inline-flex items-center gap-1.5 rounded bg-[var(--color-primary-light-1)] px-2 py-0.5 text-[10px] font-semibold text-[rgb(var(--primary-6))]">
          <IconBulb /> Phân tích bởi IQX AI
        </div>
        <h4 className="mt-1 text-sm font-bold text-[var(--color-text-1)]">Phân tích chuyên sâu {symbol}</h4>
        <p className="mt-1 text-xs text-[var(--color-text-3)]">
          Xu hướng, vùng giá quan trọng, chỉ báo kỹ thuật và định giá — tổng hợp trên trang mã.
        </p>
        <Button
          type="primary"
          long
          className="mt-3"
          onClick={() => navigate(`/co-phieu/${symbol.toUpperCase()}`)}
        >
          Mở phân tích chuyên sâu
        </Button>
      </div>
    </div>
  )
}
