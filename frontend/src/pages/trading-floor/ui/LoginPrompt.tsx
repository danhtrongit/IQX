import { useEffect } from "react"

import { useAuth } from "@/hooks/use-auth"

import { ui } from "../bridge.ts"
import { useStore } from "../use-store.ts"
import "./login-prompt.css"

/**
 * "Đăng nhập để dùng tính năng này": what a guest sees instead of a failed request when they press
 * something that needs an account (hearts, comments, reports; Chat SACO is open to guests). Opened through
 * `needLogin()` in the bridge.
 */
export function LoginPrompt() {
  const message = useStore(ui.loginPrompt)
  const { openAuth } = useAuth()

  useEffect(() => {
    if (message === null) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") ui.loginPrompt.set(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [message])

  if (message === null) return null
  const close = (): void => ui.loginPrompt.set(null)
  return (
    <div
      className="login-prompt"
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-prompt-title"
      onClick={close}
    >
      <div className="gate-card" onClick={(e) => e.stopPropagation()}>
        <div className="big-emoji" aria-hidden="true">
          🔒
        </div>
        <h1 id="login-prompt-title">{message}</h1>
        <p className="muted small">
          Bạn đang vào bằng nhân vật khách. Đăng nhập bằng tài khoản IQX để thả
          tim và bình luận nhận định.
        </p>
        <div className="gate-actions">
          <button
            type="button"
            className="btn gold"
            autoFocus
            onClick={() => {
              close()
              openAuth("login")
            }}
          >
            Đăng nhập
          </button>
          <button type="button" className="btn ghost" onClick={close}>
            Để sau
          </button>
        </div>
      </div>
    </div>
  )
}
