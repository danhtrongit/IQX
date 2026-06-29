import type { AnalysisJSON } from "../types"
import { num, pct, signedPct } from "../format"

interface QualityProps {
  quality: AnalysisJSON["quality"]
  managerVoice: string
}

export function QualitySector({ quality, managerVoice }: QualityProps) {
  const sb = quality.sector_benchmark

  // Scale sbrow fill widths: the max of your_return vs industry_return
  const maxReturn =
    sb !== null
      ? Math.max(Math.abs(sb.your_return), Math.abs(sb.industry_return), 0.01)
      : 0.01

  return (
    <div>
      <div className="chips">
        <div className="chip">
          <div className="v">{quality.pe !== null ? num(quality.pe, 1) : "—"}</div>
          <div className="k">Giá / lợi nhuận</div>
        </div>
        <div className="chip">
          <div className="v">{quality.pb !== null ? num(quality.pb, 1) : "—"}</div>
          <div className="k">Giá / sổ sách</div>
        </div>
        <div className="chip">
          <div className="v">{quality.roe !== null ? pct(quality.roe, 0) : "—"}</div>
          <div className="k">Sinh lời vốn chủ</div>
        </div>
        <div className="chip">
          <div className="v">{quality.dividend !== null ? pct(quality.dividend, 1) : "—"}</div>
          <div className="k">Cổ tức</div>
        </div>
      </div>

      {sb !== null && (
        <div className="sectorbench">
          <div className="sbt">
            Nhóm {sb.sector} của bạn vs trung bình ngành
          </div>
          <div className="sbrow you">
            <span className="nm">Của bạn</span>
            <span className="track">
              <i style={{ width: `${(Math.abs(sb.your_return) / maxReturn) * 100}%` }} />
            </span>
            <span className="v">{signedPct(sb.your_return)}</span>
          </div>
          <div className="sbrow ind">
            <span className="nm">Trung bình ngành</span>
            <span className="track">
              <i style={{ width: `${(Math.abs(sb.industry_return) / maxReturn) * 100}%` }} />
            </span>
            <span className="v">{signedPct(sb.industry_return)}</span>
          </div>
        </div>
      )}

      <div className="mgr">{managerVoice}</div>
    </div>
  )
}
