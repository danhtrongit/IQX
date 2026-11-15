import { commands, ui, type InteractKind } from "../../bridge.ts"
import { useStore } from "../../use-store.ts"
import { isTouchDevice } from "../utils.ts"

const PLACES: {
  kind: InteractKind
  icon: string
  name: string
  text: string
}[] = [
  {
    kind: "thantai",
    icon: "🙏",
    name: "Thần Tài",
    text: "Mỗi ngày một lượt trước 11:30: lắc ống xăm gieo quẻ Kinh Dịch, dự đoán VNINDEX, cầu tối đa 3 mã và xem cả sàn đang nghĩ gì.",
  },
  {
    kind: "posts",
    icon: "📋",
    name: "SACO NHẬN ĐỊNH",
    text: "Bảng trên tường: nhận định mới nhất của các SACO trong ngày. Đọc bài, thả tim, bình luận và nhắn SACO.",
  },
  {
    kind: "market",
    icon: "📊",
    name: "Bảng điện",
    text: "Chỉ số VN-Index, VN30, HNX, UPCoM cập nhật trong phiên.",
  },
]

export function ReceptionPanel() {
  const guest = useStore(ui.guest)
  const go = (kind: InteractKind): void => {
    ui.panel.set(null)
    commands.emit("goTo", kind)
  }
  return (
    <div className="reception">
      <p>
        Chào mừng tới <b>Khu Giao Dịch IQX</b>!{" "}
        {isTouchDevice()
          ? "Chạm vào sàn để đi, chạm vào đồ vật hoặc người để tương tác."
          : "Nhấn chuột hoặc dùng WASD để đi, nhấn E khi đứng cạnh đồ vật."}{" "}
        Cần SACO hướng dẫn thì bấm <b>Chat SACO</b> ở góc dưới bên phải.
      </p>
      {guest && (
        <p className="muted small">
          Bạn đang vào bằng nhân vật khách. Đăng nhập để xin quẻ Thần Tài, thả
          tim và bình luận nhận định.
        </p>
      )}
      <ul className="places">
        {PLACES.map((p) => (
          <li key={p.kind}>
            <span className="place-icon" aria-hidden="true">
              {p.icon}
            </span>
            <div>
              <b>{p.name}</b>
              <p className="muted small">{p.text}</p>
            </div>
            <button
              type="button"
              className="btn ghost small"
              onClick={() => go(p.kind)}
            >
              Đi tới
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
