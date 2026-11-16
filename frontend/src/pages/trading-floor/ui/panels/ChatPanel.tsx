import {
  Ban,
  ChevronLeft,
  Ellipsis,
  ImagePlus,
  MessageCircle,
  SquarePen,
  Undo2,
  X,
} from "lucide-react"
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react"
import { createPortal } from "react-dom"

import {
  CHAT_RULES,
  chat,
  IMAGE_TYPES,
  NEW_THREAD,
  NO_SACO_TEXT,
  openDirectChat,
  recallMessage,
  resetFresh,
  sendFresh,
  sendImage,
  sendText,
  setDuty,
  takeRestore,
  uploads,
  view,
  type FreshThread,
} from "../../net/chat.ts"
import {
  canRecall,
  chatImageUrl,
  imageBox,
  messagePreview,
  RECALLED_TEXT,
} from "../../net/chat-preview.ts"
import { floorSacos, sendTyping } from "../../net/presence.ts"
import type {
  ChatImage,
  ChatMessage,
  ConvDetail,
  ConvSummary,
  SacoSelf,
} from "../../net/types.ts"
import { useStore } from "../../use-store.ts"
import { clock, cx } from "../utils.ts"

/** Stand-in summary of the "new conversation" thread before a SACO has it. */
const FRESH_SUMMARY: ConvSummary = {
  id: NEW_THREAD,
  side: "user",
  peerName: "Chat SACO",
  peerIcon: "",
  matched: false,
  writable: true,
  online: false,
  last: null,
  unread: 0,
}

/**
 * Lifts the chat above the on-screen keyboard: while a field in the chat has focus, `--kb` on the floor
 * root holds the height the keyboard covers (visual viewport vs layout viewport); the CSS pads the sheet.
 */
function useKeyboardInset(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const vv = window.visualViewport
    const el = ref.current
    const root = el?.closest<HTMLElement>(".tf-root")
    if (!vv || !el || !root) return
    const apply = (): void => {
      const active = document.activeElement
      const typing =
        !!active &&
        el.contains(active) &&
        (active.tagName === "INPUT" || active.tagName === "TEXTAREA")
      const layout = Math.max(
        window.innerHeight,
        document.documentElement.clientHeight
      )
      const covered = Math.round(layout - vv.height - vv.offsetTop)
      // Small differences are browser bars, not a keyboard.
      root.style.setProperty(
        "--kb",
        `${typing && covered > 80 ? covered : 0}px`
      )
    }
    const later = (): void => {
      requestAnimationFrame(apply)
    }
    apply()
    vv.addEventListener("resize", apply)
    vv.addEventListener("scroll", apply)
    el.addEventListener("focusin", later)
    el.addEventListener("focusout", later)
    return () => {
      vv.removeEventListener("resize", apply)
      vv.removeEventListener("scroll", apply)
      el.removeEventListener("focusin", later)
      el.removeEventListener("focusout", later)
      root.style.removeProperty("--kb")
    }
  }, [ref])
}

/** Chat SACO (side "user") or the SACO inbox (side "saco"). One list, one open thread. */
export function ChatPanel({
  side,
  convId,
}: {
  side: "user" | "saco"
  convId?: string
}) {
  const inbox = useStore(chat.inbox)
  const fresh = useStore(chat.fresh)
  const [selected, setSelected] = useState<string | null>(convId ?? null)
  const [seenConvId, setSeenConvId] = useState(convId)
  const root = useRef<HTMLDivElement>(null)
  const list = (side === "user" ? inbox?.asUser : inbox?.asSaco) ?? []
  // The new thread shows its real conversation once a SACO has it.
  const realId = selected === NEW_THREAD ? fresh.convId : selected

  // The panel can be reopened on another conversation while it is on screen.
  if (seenConvId !== convId) {
    setSeenConvId(convId)
    setSelected(convId ?? null)
  }

  useEffect(() => {
    view(realId)
    return () => view(null)
  }, [realId])

  useKeyboardInset(root)

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
          <div className="big-icon" aria-hidden="true">
            <Ban size={40} />
          </div>
          <b>Tài khoản này không còn quyền SACO</b>
          <p className="muted small">
            Các cuộc chat cũ được giữ nguyên ở dạng chỉ đọc cho người dùng.
          </p>
        </div>
      )
    }
    return (
      <div className="chat" ref={root}>
        <SacoBar saco={saco} />
        <ChatBody
          side={side}
          list={list}
          selected={selected}
          fresh={fresh}
          onSelect={setSelected}
        />
      </div>
    )
  }

  return (
    <div className="chat" ref={root}>
      <ChatBody
        side={side}
        list={list}
        selected={selected}
        fresh={fresh}
        onSelect={setSelected}
        canStart={!inbox?.matchedConvId}
      />
    </div>
  )
}

function SacoBar({ saco }: { saco: SacoSelf }) {
  return (
    <div className="saco-bar">
      <span className="chat-av" aria-hidden="true">
        {saco.name.trim().charAt(0).toUpperCase()}
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
  fresh: FreshThread
  onSelect: (id: string | null) => void
  /** The visitor has no matched SACO: a new Chat SACO conversation can be started. */
  canStart?: boolean
}

function ChatBody({
  side,
  list,
  selected,
  fresh,
  onSelect,
  canStart,
}: BodyProps) {
  const threads = useStore(chat.threads)
  const isNew = selected === NEW_THREAD
  const realId = isNew ? fresh.convId : selected
  const summary = list.find((c) => c.id === realId)
  const thread = realId !== null ? threads[realId] : undefined
  const current = thread ?? summary ?? (isNew ? FRESH_SUMMARY : undefined)
  const startNew = (): void => {
    resetFresh()
    onSelect(NEW_THREAD)
  }

  return (
    <div className={cx("chat-body", selected !== null && "has-thread")}>
      <aside className="chat-list" aria-label="Cuộc trò chuyện">
        {side === "user" && canStart && (
          <button
            type="button"
            className={cx("find-saco", isNew && "on")}
            onClick={startNew}
          >
            <span className="ico-line">
              <SquarePen size={14} aria-hidden="true" />
              Cuộc trò chuyện mới
            </span>
            <small>
              {fresh.state === "pending"
                ? "Đang kết nối SACO…"
                : "Nhắn ngay, SACO sẽ trả lời bạn"}
            </small>
          </button>
        )}
        {list.map((c) => (
          <ConvItem
            key={c.id}
            c={c}
            on={c.id === realId}
            onClick={() => onSelect(c.id)}
          />
        ))}
        {list.length === 0 && !(side === "user" && canStart) && (
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
            key={isNew ? NEW_THREAD : selected}
            c={current}
            summary={summary}
            thread={thread}
            fresh={isNew ? fresh : undefined}
            onBack={() => onSelect(null)}
          />
        ) : side === "user" ? (
          <div className="chat-welcome">
            <div className="big-icon" aria-hidden="true">
              <MessageCircle size={40} />
            </div>
            <b>Cần SACO hướng dẫn?</b>
            <p className="muted small">
              Nhắn câu hỏi của bạn, SACO sẽ trả lời ngay khi nhận tin. Bạn cũng
              có thể nhắn đích danh một SACO từ thẻ nhận định.
            </p>
            {canStart && (
              <button type="button" className="btn gold" onClick={startNew}>
                <span className="ico-line">
                  <SquarePen size={16} aria-hidden="true" />
                  Nhắn SACO ngay
                </span>
              </button>
            )}
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
  return (mine ? "Bạn: " : "") + messagePreview(m)
}

function avatarText(c: ConvSummary): string {
  // A SACO shows the same "SACO" pill as on the floor (no emoji); a user shows an initial.
  return c.side === "user" ? "SACO" : c.peerName.slice(0, 1).toUpperCase()
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
        className={cx("chat-av xs", c.side === "saco" ? "user" : "saco-tag")}
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

function status(c: ConvSummary, fresh?: FreshThread): string {
  if (c.id === NEW_THREAD) {
    return fresh?.state === "pending"
      ? "Đang kết nối SACO…"
      : "Nhắn trước, SACO sẽ trả lời bạn sớm"
  }
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
  /** Set on the "new conversation" thread of Chat SACO. */
  fresh?: FreshThread
  onBack: () => void
}

function Thread({ c, summary, thread, fresh, onBack }: ThreadProps) {
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
  // The new thread before a SACO has it: only what the visitor sent so far.
  const waiting = fresh !== undefined && fresh.convId === null
  const local: ChatMessage[] =
    fresh && !thread
      ? fresh.sent.map((m) => ({
          id: -m.key,
          from: "u",
          text: m.text,
          at: m.at,
        }))
      : []
  const messages = thread?.messages ?? local
  const typing = typingUntil > now
  // Summary carries the live writable/online state; the thread may be a moment older.
  const live = summary ?? c
  const restore = fresh?.restore ?? ""
  // The real conversation behind this thread (none yet while the new thread waits for a SACO).
  const convId = fresh ? fresh.convId : c.id
  const uploadMap = useStore(uploads)
  const uploading = convId === null ? undefined : uploadMap[convId]
  const fileInput = useRef<HTMLInputElement>(null)
  const [viewer, setViewer] = useState<ChatImage | null>(null)

  useEffect(() => {
    const wait = typingUntil - Date.now()
    if (wait <= 0) return
    const t = setTimeout(() => setNow(Date.now()), wait + 50)
    return () => clearTimeout(t)
  }, [typingUntil])

  useLayoutEffect(() => {
    const el = box.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [messages.length, typing, waiting])

  // A new conversation opens ready to type (after the sheet has taken focus for itself).
  const autoFocus = fresh !== undefined
  useEffect(() => {
    if (!autoFocus) return
    const t = setTimeout(() => input.current?.focus(), 30)
    return () => clearTimeout(t)
  }, [autoFocus])

  // Nobody took the messages: they come back into the composer (then the store forgets them).
  const [seenRestore, setSeenRestore] = useState("")
  if (restore !== seenRestore) {
    setSeenRestore(restore)
    if (restore) setDraft((d) => d || restore)
  }
  useEffect(() => {
    if (restore) takeRestore()
  }, [restore])

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    const text = draft.trim()
    if (!text || busy) return
    setBusy(true)
    stick.current = true
    const ok = fresh ? await sendFresh(text) : await sendText(c.id, text)
    if (ok) setDraft("")
    setBusy(false)
    input.current?.focus()
  }

  const pickImage = async (file: File): Promise<void> => {
    if (convId === null) return
    stick.current = true
    await sendImage(convId, file)
  }

  const recall = (messageId: number): void => {
    if (convId !== null) void recallMessage(convId, messageId)
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
          <ChevronLeft size={22} aria-hidden="true" />
        </button>
        <span
          className={cx(
            "chat-av xs",
            c.side === "saco" ? "user" : c.id !== NEW_THREAD && "saco-tag"
          )}
          aria-hidden="true"
        >
          {c.id === NEW_THREAD ? (
            <MessageCircle size={16} aria-hidden="true" />
          ) : (
            avatarText(c)
          )}
        </span>
        <div className="thread-who">
          <b>{c.peerName}</b>
          <small className="muted">
            {live.online && live.writable && (
              <i className="live-dot" aria-hidden="true" />
            )}
            {status(live, fresh)}
          </small>
        </div>
      </header>
      {/* Before sending, the visitor can also pick one of the SACOs standing on the floor. */}
      {waiting && fresh.state !== "pending" && <PresentSacos />}
      <div
        className="msgs"
        ref={box}
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
        }}
      >
        {!thread && !fresh && <p className="muted small center">Đang tải…</p>}
        {messages.length === 0 && (thread || waiting) && (
          <p className="muted small center">
            {waiting
              ? "Gửi câu hỏi của bạn, SACO sẽ nhận và trả lời ngay khi có thể."
              : `Gửi tin nhắn đầu tiên cho ${c.side === "user" ? "SACO" : "khách"}.`}
          </p>
        )}
        {messages.map((m, k) => (
          <Bubble
            key={m.id}
            m={m}
            me={m.from === mine}
            seen={k === lastMine && (thread?.peerReadAt ?? 0) >= m.at}
            recallable={canRecall(m, c.side)}
            onRecall={recall}
            onOpenImage={setViewer}
          />
        ))}
        {waiting && fresh.state === "pending" && (
          <div className="sys connecting">Đang kết nối SACO…</div>
        )}
        {waiting && fresh.state === "none" && (
          <div className="sys warn">{NO_SACO_TEXT}</div>
        )}
      </div>
      <div className="typing" aria-live="polite">
        {typing ? `${c.peerName} đang soạn tin…` : ""}
      </div>
      {uploading !== undefined && (
        <div
          className="upload-bar"
          role="progressbar"
          aria-label="Đang gửi ảnh"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={uploading}
        >
          <span style={{ width: `${uploading}%` }} />
          <small>
            {uploading < 100
              ? `Đang gửi ảnh… ${uploading}%`
              : "Đang xử lý ảnh…"}
          </small>
        </div>
      )}
      {live.writable ? (
        <form className="composer" onSubmit={(e) => void submit(e)}>
          {convId !== null && (
            <>
              <input
                ref={fileInput}
                type="file"
                accept={IMAGE_TYPES.join(",")}
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ""
                  if (file) void pickImage(file)
                }}
              />
              <button
                type="button"
                className="icon-btn attach"
                aria-label="Gửi ảnh"
                title="Gửi ảnh (JPG, PNG, WebP, tối đa 5 MB)"
                disabled={uploading !== undefined}
                onClick={() => fileInput.current?.click()}
              >
                <ImagePlus size={22} aria-hidden="true" />
              </button>
            </>
          )}
          <input
            ref={input}
            value={draft}
            maxLength={CHAT_RULES.maxText}
            autoComplete="off"
            enterKeyHint="send"
            placeholder={
              waiting
                ? "Nhập câu hỏi cho SACO…"
                : c.side === "user"
                  ? "Nhắn tin…"
                  : "Trả lời…"
            }
            aria-label="Nội dung tin nhắn"
            onPaste={(e) => {
              // A screenshot pasted on desktop is sent as an image.
              const file = Array.from(e.clipboardData.files).find((f) =>
                f.type.startsWith("image/")
              )
              if (!file || convId === null) return
              e.preventDefault()
              void pickImage(file)
            }}
            onChange={(e) => {
              setDraft(e.target.value)
              if (waiting) return
              const t = Date.now()
              if (t - lastTyping.current > 1200) {
                lastTyping.current = t
                sendTyping(c.id)
              }
            }}
          />
          <button
            type="submit"
            className="btn gold small send"
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
      {viewer && <ImageViewer image={viewer} onClose={() => setViewer(null)} />}
    </>
  )
}

/** Full-screen view of a chat image. Escape and the close button close it (not the chat under it). */
function ImageViewer({
  image,
  onClose,
}: {
  image: ChatImage
  onClose: () => void
}) {
  const close = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)
  useLayoutEffect(() => {
    onCloseRef.current = onClose
  })
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    close.current?.focus()
    // Capture phase on window: runs before the Sheet's own Escape handler, which then sees it handled.
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Escape") return
      e.preventDefault()
      e.stopPropagation()
      onCloseRef.current()
    }
    window.addEventListener("keydown", onKey, true)
    return () => {
      window.removeEventListener("keydown", onKey, true)
      before?.focus()
    }
  }, [])
  const host = document.querySelector(".tf-root") ?? document.body
  return createPortal(
    <div
      className="img-viewer"
      role="dialog"
      aria-modal="true"
      aria-label="Xem ảnh"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <button
        ref={close}
        type="button"
        className="img-viewer-close"
        aria-label="Đóng ảnh"
        onClick={onClose}
      >
        <X size={24} aria-hidden="true" />
      </button>
      <img
        src={chatImageUrl(image.id)}
        alt="Ảnh trong cuộc trò chuyện"
        width={image.w}
        height={image.h}
      />
    </div>,
    host
  )
}

/** "SACO đang có mặt": SACOs standing on the floor right now; a tap opens the chat with one of them. */
function PresentSacos() {
  const sacos = useStore(floorSacos)
  if (sacos.length === 0) return null
  return (
    <div className="saco-present" role="group" aria-label="SACO đang có mặt">
      <span className="saco-present-label">SACO đang có mặt</span>
      <div className="saco-present-list">
        {sacos.map((s) => (
          <button
            key={s.sacoId}
            type="button"
            className="saco-chip"
            onClick={() => void openDirectChat(s.sacoId)}
          >
            <span className="saco-chip-av" aria-hidden="true">
              {s.name.trim().charAt(0).toUpperCase()}
            </span>
            <span className="saco-chip-name">{s.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function Bubble({
  m,
  me,
  seen,
  recallable,
  onRecall,
  onOpenImage,
}: {
  m: ChatMessage
  me: boolean
  seen: boolean
  recallable: boolean
  onRecall: (messageId: number) => void
  onOpenImage: (image: ChatImage) => void
}) {
  const [step, setStep] = useState<"idle" | "menu" | "confirm">("idle")
  // The actions of the last message open under the fold of the thread: bring them into view.
  if (m.from === "x") {
    return (
      <div className="sys">
        {m.text} · {clock(m.at)}
      </div>
    )
  }
  if (m.recalled) {
    return (
      <div className={cx("bubble recalled", me && "me")}>
        {RECALLED_TEXT}
        <time>{clock(m.at)}</time>
      </div>
    )
  }
  const image = m.image
  const box = image ? imageBox(image.w, image.h) : null
  const bubble = (
    <div className={cx("bubble", me && "me", image && "has-image")}>
      {image && box && (
        <button
          type="button"
          className="bubble-img"
          style={{ width: box.width, aspectRatio: `${image.w} / ${image.h}` }}
          aria-label="Xem ảnh lớn"
          onClick={() => onOpenImage(image)}
        >
          <img
            src={chatImageUrl(image.id)}
            alt="Ảnh đã gửi"
            loading="lazy"
            width={box.width}
            height={box.height}
          />
        </button>
      )}
      {m.text}
      <time>{clock(m.at)}</time>
    </div>
  )
  return (
    <>
      {recallable ? (
        <div className={cx("bubble-row", me && "me")}>
          {bubble}
          <button
            type="button"
            className="bubble-more"
            aria-label="Tuỳ chọn tin nhắn"
            aria-expanded={step !== "idle"}
            onClick={() => setStep((s) => (s === "idle" ? "menu" : "idle"))}
          >
            <Ellipsis size={18} aria-hidden="true" />
          </button>
        </div>
      ) : (
        bubble
      )}
      {step === "menu" && (
        <div className={cx("bubble-actions", me && "me")} ref={reveal}>
          <button
            type="button"
            className="btn ghost small"
            onClick={() => setStep("confirm")}
          >
            <Undo2 size={16} aria-hidden="true" />
            Thu hồi
          </button>
        </div>
      )}
      {step === "confirm" && (
        <div
          className={cx("bubble-actions confirm", me && "me")}
          role="alert"
          ref={reveal}
        >
          <span>Thu hồi tin này? Cả hai bên sẽ không xem được nữa.</span>
          <span className="bubble-actions-row">
            <button
              type="button"
              className="btn ghost small"
              onClick={() => setStep("idle")}
            >
              Huỷ
            </button>
            <button
              type="button"
              className="btn small danger"
              onClick={() => {
                setStep("idle")
                onRecall(m.id)
              }}
            >
              Thu hồi
            </button>
          </span>
        </div>
      )}
      {seen && <div className="seen">Đã xem</div>}
    </>
  )
}

function reveal(node: HTMLElement | null): void {
  node?.scrollIntoView({ block: "nearest" })
}
