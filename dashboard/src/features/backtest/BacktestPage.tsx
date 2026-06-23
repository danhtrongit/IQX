import { useParams } from "react-router"
import { PremiumGate } from "@/features/premium"
import { BacktestLab } from "./BacktestLab"

export function BacktestPage() {
  const { symbol } = useParams<{ symbol?: string }>()
  return (
    <PremiumGate
      featureName="IQX Backtester"
      description="Mô phỏng chiến lược giao dịch trên dữ liệu lịch sử đã điều chỉnh, với KPI, đường vốn và lịch sử lệnh."
    >
      <div className="flex h-screen flex-col">
        <BacktestLab initialSymbol={(symbol ?? "FPT").toUpperCase()} />
      </div>
    </PremiumGate>
  )
}

export default BacktestPage
