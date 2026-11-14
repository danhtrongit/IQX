import { useQuery } from "@tanstack/react-query"
import { useEffect, useLayoutEffect, useRef, useState } from "react"

import { useAuth } from "@/hooks/use-auth"

import { resetBridge, ui } from "./bridge.ts"
import { loadAvatarArt } from "./engine/assets.ts"
import { floorApi } from "./net/api.ts"
import type { MeResponse } from "./net/types.ts"
import { FloorUi } from "./ui/FloorUi.tsx"
import "./trading-floor.css"

/** Full-height card over the dark backdrop: guests, expired sessions and load errors. */
function Gate({
  emoji,
  title,
  text,
  children,
}: {
  emoji: string
  title: string
  text: string
  children?: React.ReactNode
}) {
  return (
    <div className="gate" role="region" aria-label={title}>
      <div className="gate-card">
        <div className="big-emoji" aria-hidden="true">
          {emoji}
        </div>
        <h1>{title}</h1>
        <p className="muted">{text}</p>
        {children && <div className="gate-actions">{children}</div>}
      </div>
    </div>
  )
}

/**
 * The Phaser canvas plus the HTML layer. The floor starts in an effect through a dynamic import (Phaser
 * stays out of the main bundle) and everything it started is undone on unmount, so React StrictMode's
 * double mount and navigating away and back both start clean.
 */
function Floor({ me, onRetry }: { me: MeResponse; onRetry: () => void }) {
  const stage = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)

  // Before paint, so a returning player never sees the join card flash up.
  useLayoutEffect(() => {
    ui.profile.set(me.profile)
  }, [me])

  useEffect(() => {
    const el = stage.current
    if (!el) return
    let cancelled = false
    let stop: (() => void) | null = null
    // The join card needs the character pictures before the canvas exists.
    loadAvatarArt().catch(() => undefined)
    import("./engine/start-floor.ts")
      .then((m) => {
        if (!cancelled) stop = m.startFloor(el, () => setFailed(true))
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
      stop?.()
      resetBridge()
    }
  }, [])

  return (
    <>
      <div ref={stage} className="tf-game" />
      <div className="tf-ui">
        <FloorUi suggestedName={me.suggestedName} />
      </div>
      {failed && (
        <Gate
          emoji="🛠️"
          title="Không mở được Khu giao dịch"
          text="Không tải được hình ảnh hoặc đồ họa của khu giao dịch. Kiểm tra kết nối rồi thử lại."
        >
          <button type="button" className="btn gold" onClick={onRetry}>
            Thử lại
          </button>
        </Gate>
      )}
    </>
  )
}

function SignedIn({ userId }: { userId: string }) {
  const me = useQuery({
    queryKey: ["trading-floor", "me", userId],
    queryFn: () => floorApi.me(),
    // Always read the server: a profile saved last visit must not come back from a cache.
    gcTime: 0,
    staleTime: 0,
    retry: 1,
    refetchOnWindowFocus: false,
  })
  const [attempt, setAttempt] = useState(0)

  if (me.isError) {
    return (
      <Gate
        emoji="📡"
        title="Không tải được Khu giao dịch"
        text={me.error.message || "Kiểm tra kết nối rồi thử lại."}
      >
        <button
          type="button"
          className="btn gold"
          onClick={() => void me.refetch()}
        >
          Thử lại
        </button>
      </Gate>
    )
  }
  if (!me.data) {
    return (
      <div className="gate" role="status">
        <p className="muted">Đang mở cửa Khu giao dịch…</p>
      </div>
    )
  }
  return (
    <Floor
      key={attempt}
      me={me.data}
      onRetry={() => {
        void me.refetch().then(() => setAttempt((n) => n + 1))
      }}
    />
  )
}

export function TradingFloorPage() {
  const { user, isLoading, isAuthenticated, sessionExpired, openAuth } =
    useAuth()
  const prompted = useRef(false)

  // Guests get the login dialog once; the card stays behind it for when they close it.
  useEffect(() => {
    if (isLoading || isAuthenticated || prompted.current) return
    prompted.current = true
    openAuth("login")
  }, [isLoading, isAuthenticated, openAuth])

  let content: React.ReactNode
  if (isLoading) {
    content = (
      <div className="gate" role="status">
        <p className="muted">Đang kiểm tra đăng nhập…</p>
      </div>
    )
  } else if (user) {
    content = <SignedIn key={user.id} userId={user.id} />
  } else {
    content = (
      <Gate
        emoji="🏛️"
        title={sessionExpired ? "Phiên đăng nhập đã hết hạn" : "Khu giao dịch"}
        text={
          sessionExpired
            ? "Đăng nhập lại để quay về khu giao dịch."
            : "Đăng nhập để bước vào khu giao dịch: gặp nhà đầu tư khác, xin quẻ Thần Tài và đọc nhận định của SACO."
        }
      >
        <button
          type="button"
          className="btn gold"
          onClick={() => openAuth("login")}
        >
          Đăng nhập
        </button>
        {!sessionExpired && (
          <button
            type="button"
            className="btn ghost"
            onClick={() => openAuth("register")}
          >
            Đăng ký
          </button>
        )}
      </Gate>
    )
  }

  return (
    <div className="tf-root relative h-full min-h-0 min-w-0 flex-1 overflow-hidden">
      {content}
    </div>
  )
}
