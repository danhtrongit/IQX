/** "Chia sẻ quẻ": Web Share with the picture when the browser can, else the link text, else download + copy. */
import { Share2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { toast } from "../../bridge.ts"
import type { ThanTaiDay, ThanTaiLa } from "../../net/types.ts"
import { SHARE_URL, buildCaption, renderShareImage } from "./share-image.ts"

const MSG_SAVED = "Đã lưu ảnh quẻ và chép lời chia sẻ."
const MSG_FAILED = "Chưa chia sẻ được, bạn thử lại nhé."

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
}

function download(blob: Blob, name: string): void {
  const href = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = href
  a.download = name
  a.style.display = "none"
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(href), 10_000)
}

async function copyCaption(caption: string): Promise<void> {
  try {
    await navigator.clipboard?.writeText(caption)
  } catch {
    // Clipboard blocked: the picture is still saved.
  }
}

async function shareQue(la: ThanTaiLa, day: ThanTaiDay): Promise<void> {
  const caption = buildCaption(la)
  const blob = await renderShareImage(la, day)
  const name = `que-${day.date}.png`
  const file = new File([blob], name, { type: "image/png" })
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], text: caption })
    return
  }
  if (typeof navigator.share === "function") {
    await navigator.share({ text: caption, url: SHARE_URL })
    return
  }
  download(blob, name)
  await copyCaption(caption)
  toast(MSG_SAVED)
}

export function ShareButton({ la, day }: { la: ThanTaiLa; day: ThanTaiDay }) {
  const [busy, setBusy] = useState(false)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const onClick = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      await shareQue(la, day)
    } catch (error) {
      if (!isAbort(error)) toast(MSG_FAILED, "warn")
    } finally {
      if (alive.current) setBusy(false)
    }
  }

  return (
    <button
      type="button"
      className="tt-btn-ghost tt-btn-share"
      disabled={busy}
      onClick={() => void onClick()}
    >
      <Share2 size={16} aria-hidden="true" />
      {busy ? "Đang chuẩn bị ảnh…" : "Chia sẻ quẻ"}
    </button>
  )
}
