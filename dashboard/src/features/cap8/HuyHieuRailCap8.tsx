import "@/features/cap0/cap0.css"
import { Badge, LEVELS } from "@/features/cap0/Badge"
import "./cap8-journey.css"

export interface HuyHieuRailCap8Props {
  /** `true` khi `cap8_progress.graduated_at` đã có — ô Cấp 8 chuyển sang `done`. */
  graduated: boolean
  /** Cỡ mỗi huy hiệu (px). Tab Hành trình 34; màn tốt nghiệp 26 (gọn hơn). */
  size?: number
  /**
   * Tiền tố `data-testid` của từng ô. Đổi được vì rail này mount ĐỒNG THỜI ở hai
   * chỗ trong một phiên thật (tab Hành trình + màn tốt nghiệp đè lên trên), và
   * hai bộ testid trùng nhau sẽ làm mọi truy vấn theo testid trở nên nhập nhằng.
   */
  testIdPrefix?: string
  /** `data-testid` của cả rail. */
  testId?: string
  /** Dòng chú thích dưới rail. `null` = bỏ hẳn (màn tốt nghiệp đã có copy riêng). */
  note?: React.ReactNode
  title?: string
}

const DEFAULT_NOTE = (
  <>
    Trọn mạch <strong>Nhập môn → Quản trị rủi ro danh mục</strong>. Cấp 8 là cấp cao nhất hiện có;
    các cấp theo chủ đề (Cấp 9+) sẽ mở dần khi ra mắt.
  </>
)

/**
 * Rail huy hiệu ĐẦY ĐỦ 0-8 — mốc "trọn mạch 0-8" của spec §10, dùng ở CẢ HAI nơi
 * spec gọi tên: tab Hành trình (đích của nút `Xem hồ sơ hành trình →`, spec §3)
 * và màn tốt nghiệp Cấp 8. Một component duy nhất, vì hai bản copy-paste sẽ lệch
 * nhau đúng vào ngày một cấp đổi màu.
 *
 * ★ Màu và fill lấy THẲNG từ `LEVELS` (`cap0/Badge.tsx`) — nguồn duy nhất mà
 * `iqx-badges.html` (roadmap §D gọi là "mockup chuẩn" cho rail), mọi thẻ cấp và
 * mọi màn tốt nghiệp đã dùng. Khai một bảng màu thứ hai ở đây thì đúng đến ngày
 * một cấp đổi màu, và rail sẽ nói khác thẻ cấp.
 *
 * ★ Cấp 0-7 là `done` KHÔNG PHẢI vì component đoán: rail này chỉ render bên trong
 * Cấp 8, mà `POST /cap8/enter` đòi Cấp 7 đã tốt nghiệp (và Cấp 7 đòi Cấp 6, …).
 * Ô Cấp 8 mới là ô phụ thuộc dữ liệu: `current` cho tới khi có `graduated_at`
 * thật — KHÔNG tô sẵn "done" cho một cấp chưa tốt nghiệp.
 *
 * ★ KHÔNG có ô "Cấp 9" nào ở đây, kể cả một ô mờ: Cấp 9+ chưa tồn tại, và một ô
 * xám trong rail là một lời hứa về thứ chưa có (spec §3 — "sắp ra mắt" chỉ là
 * CHỮ, không có gì bấm vào). Rail cũng KHÔNG có ô nào bấm được: nó là hồ sơ, chứ
 * không phải menu điều hướng.
 */
export function HuyHieuRailCap8({
  graduated,
  size = 34,
  testIdPrefix = "cap8-rail",
  testId = "cap8-journey-rail",
  note = DEFAULT_NOTE,
  title = "Huy hiệu cấp · 0-8",
}: HuyHieuRailCap8Props) {
  return (
    <div className="cap8-rail" data-testid={testId}>
      <div className="cap8-rail-title">{title}</div>
      <div className="cap8-rail-row">
        {LEVELS.map((level) => {
          const state = level.n < 8 || graduated ? "done" : "current"
          return (
            <div
              key={level.n}
              className="cap8-rail-cell"
              data-testid={`${testIdPrefix}-${level.n}`}
              data-state={state}
              title={`Cấp ${level.n} «${level.name}»`}
            >
              <Badge n={level.n} color={level.color} fill={level.fill} size={size} />
              <span className="cap8-rail-num">{level.n}</span>
            </div>
          )
        })}
      </div>
      {note ? <p className="cap8-rail-note">{note}</p> : null}
    </div>
  )
}
