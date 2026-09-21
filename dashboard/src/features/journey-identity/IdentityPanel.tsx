import { LOP_DEFS } from "@/features/cap4/doc5Lop"
import { useIdentity } from "./hooks"
import { MascotAvatar } from "./mascot-2d/MascotAvatar"
import "./mascot-2d/mascot2d.css"

const COMPANION_COPY = {
  bach_ho: "Bạch Hổ đồng hành cùng cách bạn quan sát cấu trúc giá và xu hướng.",
  thanh_long: "Thanh Long đồng hành cùng cách bạn theo dõi sự dịch chuyển của dòng vốn.",
  loc_huou: "Lộc Hươu đồng hành cùng cách bạn quan sát thông tin công khai từ doanh nghiệp.",
  phung_hoang: "Phụng Hoàng đồng hành cùng cách bạn đọc tin tức và bối cảnh mới.",
  kim_quy: "Kim Quy đồng hành cùng cách bạn tìm hiểu giá trị doanh nghiệp.",
} as const

export function IdentityPanel() {
  const { data, isError, isPending, refetch } = useIdentity()
  const mascot = data?.mascot
  const isLegacy = mascot?.assignment_basis === "legacy_order_snapshot"
  const comparisonLabel = isLegacy ? "bộ nhận định đã lưu" : "bộ đối chiếu hợp lệ"
  const layerName = LOP_DEFS.find(layer => layer.lop === mascot?.dominant_layer)?.label
  const tieNames = mascot?.tied_layers.map(id => LOP_DEFS.find(layer => layer.lop === id)?.label ?? id).join(", ")
  const run = data?.bot_run
  return <div className="identity-panel">
    <h2>Linh thú của tôi</h2>
    {isPending ? <p>Đang tải hành trình…</p> : isError ? <p role="alert">Chưa tải được hồ sơ Linh thú. Vui lòng thử lại.</p>
      : mascot ? <>
        <div className="identity-profile-heading">
          <MascotAvatar mascotId={mascot.id} variant="body" size={112} />
          <div><span className="identity-profile-label">ĐỒNG HÀNH CÙNG BẠN</span><h2>{mascot.name}</h2><p>{COMPANION_COPY[mascot.id]}</p></div>
        </div>
        {isLegacy && <p className="identity-legacy-provenance">Linh thú được khôi phục từ các bản tự chấm và nhận định AI đã lưu trong hành trình Cấp 4–6.</p>}
          {mascot.assignment_basis === "zero_match_tie_break" || (isLegacy && Math.max(...Object.values(mascot.match_counts)) === 0)
          ? <p>Trong {mascot.valid_pair_count} {comparisonLabel}, chưa có lớp nào cùng đánh giá với AI. Bạch Hổ được xác định theo thứ tự cố định. Góc nhìn khác AI không có nghĩa là sai.</p>
          : <p>{layerName} có nhiều lần cùng đánh giá với AI nhất: <strong>{mascot.match_counts[mascot.dominant_layer]} lần</strong> trong {mascot.valid_pair_count} {comparisonLabel}.
            {(mascot.assignment_basis === "stable_tie_break" || (isLegacy && mascot.tied_layers.length > 1)) && ` Các lớp ${tieNames} cùng có ${mascot.match_counts[mascot.dominant_layer]} lần; IQX chọn ${mascot.name} theo thứ tự ổn định đã quy định. Đây không phải xếp hạng năng lực.`}</p>}
        <table><caption>Kết quả đối chiếu năm lớp</caption><thead><tr><th scope="col">Lớp đánh giá</th><th scope="col">Số lần cùng AI</th></tr></thead>
          <tbody>{LOP_DEFS.map(layer => <tr key={layer.lop}><td>{layer.label}<span className="identity-match-track" aria-hidden="true"><i style={{ width: `${mascot.match_counts[layer.lop] / mascot.valid_pair_count * 100}%` }} /></span></td><td>{mascot.match_counts[layer.lop]}<span className="identity-match-total"> / {mascot.valid_pair_count}</span></td></tr>)}</tbody></table>
        <p>Dữ liệu từ {new Date(mascot.window_start).toLocaleDateString("vi-VN", { timeZone: data!.timezone })} đến lúc hoàn tất Cấp 6 ({new Date(mascot.window_end).toLocaleDateString("vi-VN", { timeZone: data!.timezone })}). Linh thú đã xác định sẽ được giữ nguyên.</p>
        <p>Linh thú đồng hành cùng bạn; không quyết định chiến lược giao dịch Bot.</p>
      </> : data?.lifecycle === "pending_data_repair"
        ? <p>IQX đang hoàn thiện dữ liệu đối chiếu để xác định Linh thú của bạn.</p>
        : <p>Trứng ADN đồng hành qua Cấp 0–6. Sau khi hoàn tất Cấp 6, Linh thú được xác định từ những bản tự chấm 5 lớp hợp lệ của bạn.</p>}
    {data?.cap6_graduated_at && <div className="identity-panel-status" role="status">
      <strong>Trạng thái Bot</strong>
      <p>{!run?.connected ? "Chưa có phiên xử lý Bot được kết nối. IQX sẽ hiển thị trạng thái khi có dữ liệu vận hành."
        : run.status === "running" ? "Bot đang xử lý dữ liệu phiên."
          : run.status === "failed" ? "Bot chưa xử lý xong phiên. Dữ liệu hoặc việc ghi nhận cần được kiểm tra."
            : run.processed_unseen_sessions > 1 ? `Bot đã xử lý ${run.processed_unseen_sessions} phiên khi bạn vắng mặt.`
              : run.status === "succeeded" ? "Bot đã xử lý xong phiên. Đây không phải thông báo có lãi." : "Bot đang chờ phiên tiếp theo."}</p>
      {run?.issues.map((issue, i) => <p key={`${issue.code}-${i}`}>{issue.symbol ? `${issue.symbol}: ` : ""}{issue.detail ?? "Một phần dữ liệu phiên cần được kiểm tra."}</p>)}
    </div>}
    <button type="button" onClick={() => void refetch()}>Làm mới</button>
  </div>
}
