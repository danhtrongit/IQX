import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react"

import {
  CHAT_RULES,
  chat,
  findSaco,
  sendText,
  setDuty,
  view,
} from "../../net/chat.ts"
import { sendTyping } from "../../net/presence.ts"
import type {
  ChatMessage,
  ConvDetail,
  ConvSummary,
  SacoSelf,
} from "../../net/types.ts"
import { useStore } from "../../use-store.ts"
import { clock, cx } from "../utils.ts"

/** Chat SACO (side "user") or the SACO inbox (side "saco"). One list, one open thread. */
export function ChatPanel({
  side,
  convId,
}: {
  side: "user" | "saco"
  convId?: string
}) {
  const inbox = useStore(chat.inbox)
  const [selected, setSelected] = useState<string | null>(convId ?? null)
  const [seenConvId, setSeenConvId] = useState(convId)
  const list = (side === "user" ? inbox?.asUser : inbox?.asSaco) ?? []

  // The panel can be reopened on another conversation while it is on screen.
  if (seenConvId !== convId) {
    setSeenConvId(convId)
    setSelected(convId ?? null)
  }

  useEffect(() => {
    view(selected)
    return () => view(null)
  }, [selected])

  if (side === "saco") {
    const saco = inbox?.saco
    if (!inbox) return <p className="muted center">Đang tải…</p>
    if (!saco) {
      return (
        <p className="muted center">Tài khoản này không phải tài khoản SACO.</p>
      )
    }
    if (!saco.active) {
      return (
        <div className="chat-gone">
          <div className="big-emoji" aria-hidden="true">
            🚫
          </div>
          <b>Tài khoản này không còn quyền SACO</b>
          <p className="muted small">
            Các cuộc chat cũ được giữ nguyên ở dạng chỉ đọc cho người dùng.
          </p>
        </div>
      )
    }
    return (
      <div className="chat">
        <SacoBar saco={saco} />
        <ChatBody
          side={side}
          list={list}
          selected={selected}
          onSelect={setSelected}
        />
      </div>
    )
  }

  return (
    <div className="chat">
      <ChatBody
        side={side}
        list={list}
        selected={selected}
        onSelect={setSelected}
        finder={!inbox?.matchedConvId}
      />
    </div>
  )
}

function SacoBar({ saco }: { saco: SacoSelf }) {
  return (
    <div className="saco-bar">
      <span className="chat-av" aria-hidden="true">
        {saco.icon}
      </span>
      <div className="saco-who">
        <b>{saco.name}</b>
        <small className="muted">
          {[saco.team, saco.position ? `thứ tự khớp #${saco.position}` : ""]
            .filter(Boolean)
            .join(" · ")}
          {saco.onDuty ? " · giữ trang này mở để nhận lời mời" : ""}
        </small>
      </div>
      <div className="duty" role="group" aria-label="Trạng thái trực">
        <button
          type="button"
          className={saco.onDuty ? "on good" : ""}
          aria-pressed={saco.onDuty}
          onClick={() => void setDuty(true)}
        >
          Đang trực
        </button>
        <button
          type="button"
          className={saco.onDuty ? "" : "on"}
          aria-pressed={!saco.onDuty}
          onClick={() => void setDuty(false)}
        >
          Vắng
        </button>
      </div>
    </div>
  )
}

interface BodyProps {
  side: "user" | "saco"
  list: ConvSummary[]
  selected: string | null
  onSelect: (id: string | null) => void
  finder?: boolean
}

function ChatBody({ side, list, selected, onSelect, finder }: BodyProps) {
  const threads = useStore(chat.threads)
  const summary = list.find((c) => c.id === selected)
  const thread = selected !== null ? threads[selected] : undefined
  const current = thread ?? summary

  return (
    <div className={cx("chat-body", selected !== null && "has-thread")}>
      <aside className="chat-list" aria-label="Cuộc trò chuyện">
        {side === "user" && finder && list.length > 0 && (
          <button
            type="button"
            className="find-saco"
            onClick={() => void findSaco()}
          >
            🔍 Tìm SACO đang rảnh
            <small>Khớp với một SACO đang trực để được trả lời ngay</small>
          </button>
        )}
        {list.map((c) => (
          <ConvItem
            key={c.id}
            c={c}
            on={c.id === selected}
            onClick={() => onSelect(c.id)}
          />
        ))}
        {list.length === 0 && (
          <p className="muted small chat-empty">
            {side === "user"
              ? "Chưa có cuộc trò chuyện nào."
              : "Chưa có người dùng nào nhắn."}
          </p>
        )}
      </aside>
      <section className="chat-thread">
        {selected !== null && current ? (
          <Thread
            key={selected}
            c={current}
            summary={summary}
            thread={thread}
            onBack={() => onSelect(null)}
          />
        ) : side === "user" ? (
          <div className="chat-welcome">
            <div className="big-emoji" aria-hidden="true">
              💬
            </div>
            <b>Cần SACO hướng dẫn?</b>
            <p className="muted small">
              Bấm <b>Tìm SACO đang rảnh</b> để được khớp với một SACO đang trực,
              hoặc nhắn đích danh một SACO từ thẻ nhận định.
            </p>
            <button
              type="button"
              className="btn gold"
              onClick={() => void findSaco()}
            >
              🔍 Tìm SACO đang rảnh
            </button>
          </div>
        ) : (
          <div className="chat-welcome">
            <p className="muted">Chọn một cuộc trò chuyện.</p>
          </div>
        )}
      </section>
    </div>
  )
}

function preview(c: ConvSummary): string {
  const m = c.last
  if (!m) return "Chưa có tin nhắn"
  const mine =
    (c.side === "user" && m.from === "u") ||
    (c.side === "saco" && m.from === "s")
  return (mine ? "Bạn: " : "") + m.text
}

function avatarText(c: ConvSummary): string {
  return c.peerIcon || c.peerName.slice(0, 1).toUpperCase()
}

function ConvItem({
  c,
  on,
  onClick,
}: {
  c: ConvSummary
  on: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={cx("conv", on && "on", c.unread > 0 && "unread")}
      onClick={onClick}
    >
      <span
        className={cx("chat-av xs", c.side === "saco" && "user")}
        aria-hidden="true"
      >
        {avatarText(c)}
      </span>
      <span className="conv-mid">
        <span className="conv-name">{c.peerName}</span>
        <span className="conv-tags">
          {c.matched ? (
            <span className="tag gold">
              {c.side === "user" ? "SACO khớp với bạn" : "Khớp qua Chat SACO"}
            </span>
          ) : (
            <span className="tag blue">Nhắn trực tiếp</span>
          )}
          {!c.writable && <span className="tag red">Ngừng hoạt động</span>}
        </span>
        <span className="conv-preview">{preview(c)}</span>
      </span>
      <span className="conv-right">
        {c.last && <small>{clock(c.last.at)}</small>}
        {c.unread > 0 && <span className="count">{c.unread}</span>}
      </span>
    </button>
  )
}

function status(c: ConvSummary): string {
  if (c.side === "saco") {
    return `${c.online ? "Đang online" : "Ngoại tuyến"} · ${
      c.matched ? "khớp qua Chat SACO" : "nhắn trực tiếp"
    }`
  }
  if (!c.writable) return "Không còn hoạt động"
  return `${c.online ? "Đang trực" : "Vắng · sẽ trả lời khi quay lại"} · ${
    c.matched ? "SACO khớp với bạn" : "nhắn trực tiếp"
  }`
}

interface ThreadProps {
  c: ConvSummary
  summary?: ConvSummary
  thread?: ConvDetail
  onBack: () => void
}

function Thread({ c, summary, thread, onBack }: ThreadProps) {
  const typingMap = useStore(chat.typing)
  const typingUntil = typingMap[c.id] ?? 0
  // `now` only moves when a timer says the typing line may have expired.
  const [now, setNow] = useState(() => Date.now())
  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const lastTyping = useRef(0)
  const stick = useRef(true)
  const messages = thread?.messages ?? []
  const typing = typingUntil > now
  // Summary carries the live writable/online state; the thread may be a moment older.
  const live = summary ?? c

  useEffect(() => {
    const wait = typingUntil - Date.now()
    if (wait <= 0) return
    const t = setTimeout(() => setNow(Date.now()), wait + 50)
    return () => clearTimeout(t)
  }, [typingUntil])

  useLayoutEffect(() => {
    const el = box.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [messages.length, typing])

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    const text = draft.trim()
    if (!text || busy) return
    setBusy(true)
    stick.current = true
    if (await sendText(c.id, text)) setDraft("")
    setBusy(false)
    input.current?.focus()
  }

  const mine = c.side === "user" ? "u" : "s"
  const lastMine = messages.reduce((i, m, k) => (m.from === mine ? k : i), -1)

  return (
    <>
      <header className="thread-head">
        <button
          type="button"
          className="icon-btn back"
          onClick={onBack}
          aria-label="Danh sách"
        >
          ‹
        </button>
        <span
          className={cx("chat-av xs", c.side === "saco" && "user")}
          aria-hidden="true"
        >
          {avatarText(c)}
        </span>
        <div className="thread-who">
          <b>{c.peerName}</b>
          <small className="muted">
            {live.online && live.writable && (
              <i className="live-dot" aria-hidden="true" />
            )}
            {status(live)}
          </small>
        </div>
      </header>
      <div
        className="msgs"
        ref={box}
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
        }}
      >
        {!thread && <p className="muted small center">Đang tải…</p>}
        {thread && messages.length === 0 && (
          <p className="muted small center">
            Gửi tin nhắn đầu tiên cho {c.side === "user" ? "SACO" : "khách"}.
          </p>
        )}
        {messages.map((m, k) => (
          <Bubble
            key={m.id}
            m={m}
            me={m.from === mine}
            seen={k === lastMine && (thread?.peerReadAt ?? 0) >= m.at}
          />
        ))}
      </div>
      <div className="typing" aria-live="polite">
        {typing ? `${c.peerName} đang soạn tin…` : ""}
      </div>
      {live.writable ? (
        <form className="composer" onSubmit={(e) => void submit(e)}>
          <input
            ref={input}
            value={draft}
            maxLength={CHAT_RULES.maxText}
            autoComplete="off"
            placeholder={c.side === "user" ? "Nhắn tin…" : "Trả lời…"}
            aria-label="Nội dung tin nhắn"
            onChange={(e) => {
              setDraft(e.target.value)
              const t = Date.now()
              if (t - lastTyping.current > 1200) {
                lastTyping.current = t
                sendTyping(c.id)
              }
            }}
          />
          <button
            type="submit"
            className="btn gold small"
            disabled={!draft.trim() || busy}
          >
            Gửi
          </button>
        </form>
      ) : (
        <p className="readonly">
          SACO này không còn hoạt động. Bạn vẫn xem được tin nhắn cũ.
        </p>
      )}
    </>
  )
}

function Bubble({
  m,
  me,
  seen,
}: {
  m: ChatMessage
  me: boolean
  seen: boolean
}) {
  if (m.from === "x") {
    return (
      <div className="sys">
        {m.text} · {clock(m.at)}
      </div>
    )
  }
  return (
    <>
      <div className={cx("bubble", me && "me")}>
        {m.text}
        <time>{clock(m.at)}</time>
      </div>
      {seen && <div className="seen">Đã xem</div>}
    </>
  )
}
