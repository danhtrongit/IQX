import {
  ChartCandlestick,
  ClipboardList,
  Inbox,
  Landmark,
  MessagesSquare,
  PenLine,
  Pencil,
  type LucideIcon,
} from "lucide-react"
import { useNavigate } from "react-router"

import { useAuth } from "@/hooks/use-auth"

import {
  commands,
  openPanel,
  openInteract,
  ui,
  world,
  type InteractKind,
} from "../bridge.ts"
import { chat, chatSaco, unreadAsSaco, unreadAsUser } from "../net/chat.ts"
import {
  formatIndex,
  formatIndexChange,
  formatPercent,
} from "../net/market/format.ts"
import { PRICE_COLORS, indexTone } from "../net/market/tone.ts"
import { useStore } from "../use-store.ts"
import { isTouchDevice, SACO_POSTS_PATH, cx } from "./utils.ts"

const SHORTCUTS: { kind: InteractKind; icon: LucideIcon; label: string }[] = [
  { kind: "thantai", icon: Landmark, label: "Thần Tài" },
  { kind: "posts", icon: ClipboardList, label: "Nhận định" },
  { kind: "market", icon: ChartCandlestick, label: "Bảng điện" },
]

export function Hud({ onEditProfile }: { onEditProfile: () => void }) {
  const navigate = useNavigate()
  const { openAuth } = useAuth()
  const guest = useStore(ui.guest)
  const profile = useStore(ui.profile)
  const online = useStore(ui.online)
  const connection = useStore(ui.connection)
  const hint = useStore(ui.hint)
  const panel = useStore(ui.panel)
  const indices = useStore(world.indices)
  const inbox = useStore(chat.inbox)
  const userUnread = unreadAsUser(inbox)
  const saco = inbox?.saco?.active ? inbox.saco : null
  const sacoUnread = unreadAsSaco(inbox)
  const vn = indices?.find((q) => q.code === "VNINDEX")
  const touch = isTouchDevice()

  return (
    <div className="hud">
      <div className="hud-top">
        <button
          type="button"
          className="chip brand"
          onClick={() => openPanel("market")}
          aria-label="Mở bảng thị trường"
        >
          <b>IQX</b>
          <span className="brand-name">Khu Giao Dịch</span>
          {vn && (
            <span
              className="index-mini"
              style={{ color: PRICE_COLORS[indexTone(vn)] }}
            >
              VNINDEX {formatIndex(vn.value)}{" "}
              <small>
                {formatIndexChange(vn.change)} ({formatPercent(vn.pct)})
              </small>
            </span>
          )}
        </button>
        <div className="hud-right">
          <span
            className={`chip online ${connection}`}
            title={connection === "online" ? "Đang kết nối" : "Mất kết nối"}
          >
            <i className="dot" /> {connection === "online" ? online : "…"}
            <span className="online-label">
              {connection === "online"
                ? "trực tuyến"
                : connection === "connecting"
                  ? "Đang nối"
                  : "Ngoại tuyến"}
            </span>
          </span>
          {guest && (
            <button
              type="button"
              className="chip"
              onClick={() => openAuth("login")}
              aria-label="Đăng nhập tài khoản IQX"
            >
              Đăng nhập
            </button>
          )}
          <button
            type="button"
            className="chip me"
            onClick={onEditProfile}
            aria-label="Đổi tên hoặc nhân vật"
          >
            <span className="me-name">{profile?.name}</span>{" "}
            <Pencil size={14} aria-hidden="true" />
          </button>
        </div>
      </div>

      {hint && !panel && (
        <button
          type="button"
          className="hint"
          onClick={() => openInteract(hint.kind, hint.data)}
        >
          <span>{hint.label}</span>
          <kbd>{touch ? "Chạm để mở" : "E"}</kbd>
        </button>
      )}

      <nav className="shortcuts" aria-label="Đi nhanh">
        {SHORTCUTS.map((s) => (
          <button
            key={s.kind}
            type="button"
            className="shortcut"
            onClick={() => commands.emit("goTo", s.kind)}
            title={`Đi tới ${s.label}`}
          >
            <s.icon size={20} aria-hidden="true" />
            <small>{s.label}</small>
          </button>
        ))}
      </nav>

      <div className="emote-wrap">
        {saco && (
          <>
            <button
              type="button"
              className="pill saco-pill write-pill"
              onClick={() => navigate(SACO_POSTS_PATH)}
            >
              <span className="pill-ico" aria-hidden="true">
                <PenLine size={19} />
              </span>
              <span className="pill-label">Viết nhận định</span>
            </button>
            <button
              type="button"
              className="pill saco-pill"
              onClick={() => openPanel("chat", { side: "saco" })}
              aria-label={`Hộp thư SACO, ${saco.onDuty ? "đang trực" : "vắng"}${sacoUnread ? `, ${sacoUnread} tin chưa đọc` : ""}`}
            >
              <span className="pill-ico" aria-hidden="true">
                <Inbox size={19} />
              </span>
              <span className="pill-label">Hộp thư SACO</span>
              <i
                className={cx("duty-dot", saco.onDuty && "on")}
                aria-hidden="true"
              />
              {sacoUnread > 0 && <span className="count">{sacoUnread}</span>}
            </button>
          </>
        )}
        <button
          type="button"
          className="pill chat-pill"
          onClick={chatSaco}
          aria-label={`Chat SACO${userUnread ? `, ${userUnread} tin chưa đọc` : ""}`}
        >
          <span className="pill-ico" aria-hidden="true">
            <MessagesSquare size={20} strokeWidth={2.2} />
          </span>
          <span className="pill-label">Chat SACO</span>
          {userUnread > 0 && <span className="count">{userUnread}</span>}
        </button>
      </div>

      {!touch && (
        <p className="help">
          Nhấn chuột để đi · WASD/mũi tên · E để mở · cuộn để phóng to
        </p>
      )}
    </div>
  )
}
