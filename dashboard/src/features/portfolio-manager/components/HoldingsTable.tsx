import type { AnalysisJSON, NarrativeJSON } from "../types"
import { pct, vndShort } from "../format"

interface HoldingsTableProps {
  positions: AnalysisJSON["overview"]["positions"]
  cash_pct: AnalysisJSON["overview"]["cash_pct"]
  managerVoice: NarrativeJSON["layers"]["overview"]
}

export function HoldingsTable({ positions, cash_pct, managerVoice }: HoldingsTableProps) {
  return (
    <>
      <table className="hold">
        <thead>
          <tr>
            <th>Mã</th>
            <th>Ngành</th>
            <th>Tỷ trọng</th>
            <th>Lãi/lỗ</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((pos) => (
            <tr key={pos.ticker}>
              <td>
                {pos.ticker}
                {pos.low_confidence && (
                  <span className="flag">mới · ít dữ liệu</span>
                )}
              </td>
              <td>{pos.sector}</td>
              <td>{pct(pos.weight)}</td>
              <td>
                <span className={pos.pnl >= 0 ? "pos" : "neg"}>
                  {vndShort(pos.pnl)}
                </span>
              </td>
            </tr>
          ))}
          <tr className="cash">
            <td>Tiền mặt</td>
            <td>—</td>
            <td>{pct(cash_pct)}</td>
            <td>0</td>
          </tr>
        </tbody>
      </table>
      <div className="mgr">{managerVoice}</div>
    </>
  )
}
