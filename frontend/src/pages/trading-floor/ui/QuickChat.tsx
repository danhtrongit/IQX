import { useEffect, useRef, useState, type KeyboardEvent } from "react"

import { appDialogOpen, commands, typing, ui } from "../bridge.ts"
import { useStore } from "../use-store.ts"
import { cx, isTouchDevice } from "./utils.ts"

/** Server limit on what one speech bubble carries. */
const MAX_CHARS = 60
/** Lines shown while the composer is closed. */
const PEEK_LINES = 4

const time = (at: number): string =>
  new Date(at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })

/** Enter belongs to the chat only when nothing else on the page is using the keyboard. */
function enterFree(): boolean {
  if (ui.panel.get() || ui.posts.get().open || typing() || appDialogOpen())
    return false
  const el = document.activeElement as HTMLElement | null
  return !(el && el.closest('button, a, [role="button"], summary'))
}

/**
 * Floor chat: Enter opens the composer, Enter sends (and closes), Esc closes. What was said shows as a
 * speech bubble over the speaker and in this history, which lives in memory only.
 */
export function QuickChat() {
  const lines = useStore(ui.chatLog)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLOListElement>(null)
  const touch = isTouchDevice()

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if (e.key !== "Enter" || e.isComposing || open || !enterFree()) return
      e.preventDefault()
      setOpen(true)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  useEffect(() => {
    if (open) input.current?.focus()
  }, [open])

  // Keep the newest line in view.
  useEffect(() => {
    const el = list.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines, open])

  const close = (): void => {
    setOpen(false)
    setDraft("")
    input.current?.blur()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Escape") {
      e.preventDefault()
      close()
      return
    }
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return
    e.preventDefault()
    const text = draft.trim()
    if (text) commands.emit("emote", text.slice(0, MAX_CHARS))
    close()
  }

  const shown = open ? lines : lines.slice(-PEEK_LINES)
  if (!open && !shown.length && touch) return null

  return (
    <section
      className={cx("quick-chat", open && "open")}
      aria-label="Trò chuyện trên sàn"
    >
      {shown.length > 0 && (
        <ol className="qc-lines" ref={list} aria-live="polite">
          {shown.map((l) => (
            <li key={l.id} className={cx(l.self && "self")}>
              {open && <time>{time(l.at)}</time>}
              <b>{l.name}:</b> <span>{l.text}</span>
            </li>
          ))}
        </ol>
      )}
      {open ? (
        <input
          ref={input}
          className="qc-input"
          value={draft}
          maxLength={MAX_CHARS}
          placeholder="Nói gì đó rồi nhấn Enter · Esc để đóng"
          aria-label="Nội dung muốn nói"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => {
            if (!draft.trim()) setOpen(false)
          }}
        />
      ) : (
        !touch && (
          <button
            type="button"
            className="qc-open"
            onClick={() => setOpen(true)}
          >
            <kbd>Enter</kbd> để chat
            {lines.length > PEEK_LINES && ` · xem ${lines.length} tin`}
          </button>
        )
      )}
    </section>
  )
}
