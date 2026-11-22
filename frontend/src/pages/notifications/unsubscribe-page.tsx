/**
 * `/thong-bao/tat?token=…` (spec §8.4, PLAN D21): the "Tắt thông báo này" link of an email. No login;
 * the page posts the signed single-use token once (a mail scanner's GET prefetch changes nothing).
 */
import { useEffect, useRef, useState } from "react"
import { BellOff, CircleAlert, LoaderCircle } from "lucide-react"
import { Link, useSearchParams } from "react-router"

import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api"

import { TYPE_LABEL, unsubscribe, type UnsubscribeResult } from "./api"

type State = { kind: "loading" } | { kind: "done"; result: UnsubscribeResult } | { kind: "invalid" } | { kind: "error"; message: string }

export function UnsubscribePage() {
  const [params] = useSearchParams()
  const token = params.get("token")?.trim() ?? ""
  const [state, setState] = useState<State>(token ? { kind: "loading" } : { kind: "invalid" })
  const sent = useRef<string | null>(null)

  useEffect(() => {
    if (!token || sent.current === token) return
    sent.current = token
    unsubscribe(token)
      .then((result) => setState({ kind: "done", result }))
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 400) setState({ kind: "invalid" })
        else setState({ kind: "error", message: error instanceof Error ? error.message : "Không thực hiện được." })
      })
  }, [token])

  let icon = <LoaderCircle aria-hidden="true" className="size-8 animate-spin text-primary" />
  let title = "Đang tắt thông báo…"
  let detail: string | null = null
  if (state.kind === "done") {
    const label = TYPE_LABEL[state.result.type] ?? "này"
    icon = <BellOff aria-hidden="true" className="size-8 text-primary" />
    title = state.result.status === "already_used" ? "Liên kết này đã được dùng." : `Đã tắt thông báo ${label}.`
    detail = state.result.status === "already_used" ? `Thông báo ${label} đã được tắt trước đó.` : "Bật lại trong thẻ Thông báo của Bot."
  } else if (state.kind === "invalid") {
    icon = <CircleAlert aria-hidden="true" className="size-8 text-destructive" />
    title = "Liên kết không hợp lệ."
    detail = "Mở lại liên kết trong email hoặc tắt thông báo trong thẻ Thông báo của Bot."
  } else if (state.kind === "error") {
    icon = <CircleAlert aria-hidden="true" className="size-8 text-destructive" />
    title = "Chưa tắt được thông báo."
    detail = state.message
  }

  return (
    <main className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto p-4 sm:items-center">
      <section aria-live="polite" className="flex w-full max-w-md flex-col items-center gap-3 rounded-lg border border-border bg-card p-6 text-center">
        {icon}
        <h1 className="font-heading text-lg font-bold">{title}</h1>
        {detail && <p className="text-sm leading-6 text-foreground">{detail}</p>}
        {state.kind === "error" && (
          <Button type="button" variant="outline" onClick={() => { sent.current = null; setState({ kind: "loading" }); window.location.reload() }}>Thử lại</Button>
        )}
        <Button asChild variant="link"><Link to="/">Về trang chủ</Link></Button>
      </section>
    </main>
  )
}
