import { useState } from "react"
import { signedPct, vnd } from "../format"

const SCENARIOS: Record<number, string> = {
  5: "Một nhịp giảm nhẹ 5% của thị trường",
  10: "Một nhịp giảm 10% như hồi tháng 4 năm ngoái",
  15: "Một nhịp giảm mạnh 15% như giai đoạn căng thẳng",
}

interface StressTestProps {
  beta: number
  nav: number
  managerVoice: string
}

export function StressTest({ beta, nav, managerVoice }: StressTestProps) {
  const [d, setD] = useState<5 | 10 | 15>(10)

  const loss = d * beta
  const vndAmount = nav * loss / 100
  const barWidth = Math.min(loss * 4, 100)
  const lossPct = signedPct(-loss / 100)
  const scenText = SCENARIOS[d]

  return (
    <div>
      <div className="stress">
        <div className="stress-head">
          <div className="st">Bài kiểm tra sức chịu đựng</div>
          <div className="sd">
            Danh mục của bạn hiện nhạy hơn thị trường khoảng{" "}
            {Math.round((beta - 1) * 100)}% (độ nhạy {beta.toFixed(2).replace(".", ",")}).
          </div>
        </div>
        <div className="stress-body">
          <div className="seg">
            {([5, 10, 15] as const).map((val) => (
              <button
                key={val}
                data-d={val}
                className={d === val ? "on" : undefined}
                onClick={() => setD(val)}
              >
                {val === 5 ? "VN-Index −5,0%" : `−${val},0%`}
              </button>
            ))}
          </div>
          <div className="stress-out">
            <div className="stress-num">
              <span>{lossPct}</span>
              <span className="vnd">≈ {vnd(-vndAmount)}</span>
            </div>
            <div className="stress-expl">
              {scenText} sẽ kéo danh mục của bạn xuống khoảng{" "}
              <b style={{ color: "#fff" }}>{lossPct}</b>. Phần lớn mức giảm đến từ các vị thế lớn nhất và những mã nhạy nhất với thị trường.
            </div>
          </div>
          <div className="stress-bar">
            <i style={{ width: `${barWidth}%` }} />
          </div>
        </div>
      </div>
      <div className="mgr">{managerVoice}</div>
    </div>
  )
}
