import { useEffect, useState } from "react"

import { openPanel } from "../bridge.ts"
import {
  answerInvite,
  cancelFind,
  CHAT_RULES,
  chat,
  findSaco,
} from "../net/chat.ts"
import { useStore } from "../use-store.ts"

/** Re-renders every `ms` while `on`, for countdowns. */
function useTicker(on: boolean, ms = 100): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!on) return
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [on, ms])
  return now
}

/** Chat SACO progress: asking SACOs one by one, or nobody free. */
export function MatchOverlay() {
  const match = useStore(chat.match)
  const inbox = useStore(chat.inbox)
  const now = useTicker(match?.state === "asking")
  if (!match) return null

  if (match.state === "none") {
    const close = (): void => chat.match.set(null)
    return (
      <div
        className="chat-ov"
        role="dialog"
        aria-modal="true"
        aria-label="Chưa có SACO rảnh"
      >
        <div className="chat-ov-box">
          <div className="big-emoji" aria-hidden="true">
            😴
          </div>
          <h3>Chưa có SACO rảnh</h3>
          <p className="muted small">
            Các SACO đang bận hoặc vắng. Bạn thử lại sau ít phút nhé.
          </p>
          <div className="row-center">
            <button type="button" className="btn ghost small" onClick={close}>
              Đóng
            </button>
            {(inbox?.asUser.length ?? 0) > 0 && (
              <button
                type="button"
                className="btn ghost small"
                onClick={() => {
                  close()
                  openPanel("chat", { side: "user" })
                }}
              >
                Xem tin nhắn cũ
              </button>
            )}
            <button
              type="button"
              className="btn gold small"
              onClick={() => {
                close()
                void findSaco()
              }}
            >
              Thử lại
            </button>
          </div>
        </div>
      </div>
    )
  }

  const left =
    match.state === "asking"
      ? Math.max(0, match.deadline - now)
      : CHAT_RULES.inviteMs
  return (
    <div
      className="chat-ov"
      role="dialog"
      aria-modal="true"
      aria-label="Đang tìm SACO"
    >
      <div className="chat-ov-box">
        <div className="spin" aria-hidden="true" />
        <h3>Đang tìm SACO cho bạn…</h3>
        <p className="muted small">
          {match.state === "asking" ? `Lượt hỏi ${match.turn}. ` : ""}Mỗi SACO
          có {CHAT_RULES.inviteMs / 1000} giây để nhận lời.
        </p>
        <div className="pbar" aria-hidden="true">
          <i style={{ width: `${(left / CHAT_RULES.inviteMs) * 100}%` }} />
        </div>
        <button
          type="button"
          className="btn ghost small"
          onClick={() => void cancelFind()}
        >
          Huỷ
        </button>
      </div>
    </div>
  )
}

/** A user wants a SACO: accept within 5 seconds or the invite moves on. */
export function InviteCard() {
  const invite = useStore(chat.invite)
  const now = useTicker(Boolean(invite))
  const inviteId = invite?.id
  useEffect(() => {
    if (inviteId !== undefined) navigator.vibrate?.(200)
  }, [inviteId])
  if (!invite) return null
  const left = Math.max(0, invite.deadline - now)
  const sec = Math.ceil(left / 1000)
  const r = 23
  const c = 2 * Math.PI * r
  return (
    <div className="invite-card" role="alertdialog" aria-label="Lời mời chat">
      <div className="invite-row">
        <div className="ring" aria-hidden="true">
          <svg width="54" height="54" viewBox="0 0 54 54">
            <circle cx="27" cy="27" r={r} className="ring-bg" />
            <circle
              cx="27"
              cy="27"
              r={r}
              className="ring-fg"
              strokeDasharray={c}
              strokeDashoffset={c * (1 - left / CHAT_RULES.inviteMs)}
            />
          </svg>
          <b>{sec}</b>
        </div>
        <div>
          <h3>{invite.userName} muốn chat với SACO</h3>
          <p className="muted small">
            Đồng ý trong {sec} giây, nếu không lời mời chuyển cho SACO kế tiếp.
          </p>
        </div>
      </div>
      <div className="invite-actions">
        <button
          type="button"
          className="btn small decline"
          onClick={() => void answerInvite(false)}
        >
          Từ chối
        </button>
        <button
          type="button"
          className="btn small accept"
          onClick={() => void answerInvite(true)}
        >
          Đồng ý
        </button>
      </div>
    </div>
  )
}
