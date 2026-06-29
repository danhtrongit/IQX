import type { AnalysisJSON } from "../types"

interface HealthPillarsProps {
  pillars: AnalysisJSON["scores"]["pillars"]
}

const PILLAR_LABELS: Record<keyof AnalysisJSON["scores"]["pillars"], string> = {
  performance: "Hiệu suất",
  risk: "Rủi ro",
  diversification: "Phân tán rủi ro",
  quality: "Chất lượng",
  discipline: "Kỷ luật",
}

const PILLAR_DESCRIPTORS: Record<keyof AnalysisJSON["scores"]["pillars"], string> = {
  performance: "Vẫn vượt thị trường",
  risk: "Cải thiện, còn nghiêng về thị trường lên",
  diversification: "Đỡ hơn, còn cặp ngân hàng trùng lặp",
  quality: "Định giá hợp lý, doanh nghiệp tốt",
  discipline: "Giữ mã lỗ quá lâu",
}

const PILLAR_KEYS: (keyof AnalysisJSON["scores"]["pillars"])[] = [
  "performance",
  "risk",
  "diversification",
  "quality",
  "discipline",
]

export function HealthPillars({ pillars }: HealthPillarsProps) {
  return (
    <table className="health">
      <thead>
        <tr>
          <th>Khía cạnh</th>
          <th>Đánh giá</th>
          <th>Một dòng</th>
        </tr>
      </thead>
      <tbody>
        {PILLAR_KEYS.map((key) => {
          const score = pillars[key]
          const isLow = score <= 2

          return (
            <tr key={key}>
              <td>{PILLAR_LABELS[key]}</td>
              <td>
                <div className="dots">
                  {[1, 2, 3, 4, 5].map((i) => {
                    const filled = i <= score
                    let cls = "dot5"
                    if (filled) {
                      cls += " on"
                      if (isLow) cls += " lo"
                    }
                    return <i key={i} className={cls} />
                  })}
                </div>
              </td>
              <td>{PILLAR_DESCRIPTORS[key]}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
