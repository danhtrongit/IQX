import { useEffect, useState } from "react"

import { answerInvite, CHAT_RULES, chat } from "../net/chat.ts"
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

/** A user wants a SACO: accept within 5 seconds or the invite moves on. Shows what they already wrote. */
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
        <div className="invite-text">
          <h3>{invite.userName} muốn chat với SACO</h3>
          <p className="muted small">
            Đồng ý trong {sec} giây, nếu không lời mời chuyển cho SACO kế tiếp.
          </p>
        </div>
      </div>
      {invite.preview && (
        <p className="invite-preview" aria-label="Tin nhắn của khách">
          {invite.preview}
        </p>
      )}
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
