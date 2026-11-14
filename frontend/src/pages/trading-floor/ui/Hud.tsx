import { useState, type FormEvent } from "react"
import { useNavigate } from "react-router"

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

const EMOTES = [
  "👋 Xin chào!",
  "🙏 Thần Tài phù hộ",
  "🚀 Lên nào!",
  "📉 Bình tĩnh nhé",
  "☕ Cà phê không?",
  "👍 Chuẩn!",
]

const SHORTCUTS: { kind: InteractKind; icon: string; label: string }[] = [
  { kind: "thantai", icon: "🙏", label: "Thần Tài" },
  { kind: "posts", icon: "📋", label: "Nhận định" },
  { kind: "leaderboard", icon: "🏆", label: "Vinh danh" },
]

export function Hud({ onEditProfile }: { onEditProfile: () => void }) {
  const navigate = useNavigate()
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
  const [emoteOpen, setEmoteOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const vn = indices?.find((q) => q.code === "VNINDEX")
  const touch = isTouchDevice()

  const say = (text: string): void => {
    const t = text.trim()
    if (!t) return
    commands.emit("emote", t.slice(0, 60))
    setDraft("")
    setEmoteOpen(false)
  }

  const submitEmote = (e: FormEvent): void => {
    e.preventDefault()
    say(draft)
  }

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
          <button
            type="button"
            className="chip me"
            onClick={onEditProfile}
            aria-label="Đổi tên hoặc nhân vật"
          >
            <span className="me-name">{profile?.name}</span>{" "}
            <span aria-hidden="true">✎</span>
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
            <span aria-hidden="true">{s.icon}</span>
            <small>{s.label}</small>
          </button>
        ))}
      </nav>

      <div className="emote-wrap">
        {!emoteOpen && saco && (
          <>
            <button
              type="button"
              className="pill saco-pill write-pill"
              onClick={() => navigate(SACO_POSTS_PATH)}
            >
              <span className="pill-ico" aria-hidden="true">
                📝
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
                💼
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
        {!emoteOpen && (
          <button
            type="button"
            className="pill chat-pill"
            onClick={chatSaco}
            aria-label={`Chat SACO${userUnread ? `, ${userUnread} tin chưa đọc` : ""}`}
          >
            <span className="pill-ico" aria-hidden="true">
              🧑‍💼
            </span>
            <span className="pill-label">Chat SACO</span>
            {userUnread > 0 && <span className="count">{userUnread}</span>}
          </button>
        )}
        {emoteOpen && (
          <div className="emote-pop">
            {EMOTES.map((e) => (
              <button
                key={e}
                type="button"
                className="emote"
                onClick={() => say(e)}
              >
                {e}
              </button>
            ))}
            <form className="emote-form" onSubmit={submitEmote}>
              <input
                value={draft}
                maxLength={60}
                placeholder="Nói gì đó…"
                aria-label="Nội dung muốn nói"
                onChange={(e) => setDraft(e.target.value)}
              />
              <button type="submit" className="btn gold small">
                Gửi
              </button>
            </form>
          </div>
        )}
        <button
          type="button"
          className="fab"
          onClick={() => setEmoteOpen(!emoteOpen)}
          aria-expanded={emoteOpen}
          aria-label="Nói chuyện"
        >
          💬
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
