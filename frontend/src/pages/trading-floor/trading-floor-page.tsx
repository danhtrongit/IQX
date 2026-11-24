import { useQuery } from "@tanstack/react-query"
import { WifiOff, Wrench, type LucideIcon } from "lucide-react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"

import { useAuth } from "@/hooks/use-auth"
import { ApiError } from "@/lib/api"
import { buildAllChibiPortraits } from "@/lib/chibi-3d/portrait-renderer.ts"
import type { RoomDoorHandle } from "@/pages/spaces/door-transition.ts"

import { resetBridge, toast, ui } from "./bridge.ts"
import { floorApi } from "./net/api.ts"
import { getGuestToken, setGuestToken } from "./net/guest.ts"
import { floorSocket } from "./net/socket.ts"
import type { MeResponse } from "./net/types.ts"
import { FloorUi } from "./ui/FloorUi.tsx"
import { LoginPrompt } from "./ui/LoginPrompt.tsx"
import "./trading-floor.css"

export interface TradingFloorPageProps {
  /** Spawn inside the West portal door with open->close door animation. */
  arrivedViaDoor?: boolean
  /** Triggered by HUD button, 3D door click, E label click, or E key near the office door. */
  onRequestOffice?: () => void
  /** Called once the floor stage (or fallback gate) is ready to reveal. */
  onRoomReady?: () => void
  /** Publishes the active controller's door exit handle to the Spaces shell. */
  onDoorHandleReady?: (handle: RoomDoorHandle | null) => void
}

/** What a visitor with no saved character starts from: the join card creates a guest character. */
const NEW_GUEST: MeResponse = {
  profile: null,
  suggestedName: "",
  saco: null,
  guest: true,
}

/** The server does not know this guest token (cleaned up, or forged). */
const isGuestInvalid = (error: unknown): boolean =>
  error instanceof ApiError && error.status === 401

/** Full-height card over the dark backdrop: load errors and the auth check. */
function Gate({
  icon: Icon,
  title,
  text,
  children,
}: {
  icon: LucideIcon
  title: string
  text: string
  children?: React.ReactNode
}) {
  return (
    <div className="gate" role="region" aria-label={title}>
      <div className="gate-card">
        <div className="big-icon" aria-hidden="true">
          <Icon size={40} />
        </div>
        <h1>{title}</h1>
        <p className="muted">{text}</p>
        {children && <div className="gate-actions">{children}</div>}
      </div>
    </div>
  )
}

/**
 * The Three.js 3D canvas plus the HTML layer. The floor starts in an effect through a dynamic import (Three.js
 * stays out of the main bundle) and everything it started is undone on unmount, so React StrictMode's
 * double mount and navigating away and back both start clean.
 */
function Floor({
  me,
  onRetry,
  arrivedViaDoor = false,
  onRequestOffice,
  onRoomReady,
  onDoorHandleReady,
}: {
  me: MeResponse
  onRetry: () => void
  arrivedViaDoor?: boolean
  onRequestOffice?: () => void
  onRoomReady?: () => void
  onDoorHandleReady?: (handle: RoomDoorHandle | null) => void
}) {
  const stage = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)
  const [doorNear, setDoorNear] = useState(false)

  const onRequestOfficeRef = useRef(onRequestOffice)
  const onRoomReadyRef = useRef(onRoomReady)
  const onDoorHandleReadyRef = useRef(onDoorHandleReady)
  useEffect(() => {
    onRequestOfficeRef.current = onRequestOffice
  }, [onRequestOffice])
  useEffect(() => {
    onRoomReadyRef.current = onRoomReady
  }, [onRoomReady])
  useEffect(() => {
    onDoorHandleReadyRef.current = onDoorHandleReady
  }, [onDoorHandleReady])

  // Before paint, so a returning player never sees the join card flash up and portraits are ready immediately.
  useLayoutEffect(() => {
    ui.guest.set(me.guest === true)
    ui.profile.set(me.profile)
    if (Object.keys(ui.avatarImages.get()).length === 0) {
      ui.avatarImages.set(buildAllChibiPortraits())
    }
  }, [me])

  // The server forgot this guest (their token no longer matches): back to the join card for a new one.
  useEffect(
    () =>
      floorSocket.on("error", (m) => {
        if (m.code !== "GUEST_INVALID") return
        setGuestToken(null)
        ui.profile.set(null)
        toast("Phiên khách đã hết hạn, hãy tạo lại nhân vật.", "warn")
      }),
    []
  )

  useEffect(() => {
    const el = stage.current
    if (!el) return
    let cancelled = false
    let stop: (() => void) | null = null
    import("./engine/start-floor.ts")
      .then((m) => {
        if (!cancelled) {
          stop = m.startFloor(el, {
            arrivedViaDoor,
            onDoorHintChange: (near) => {
              if (!cancelled) setDoorNear(near)
            },
            onDoorRequest: () => {
              if (!cancelled) onRequestOfficeRef.current?.()
            },
            onControllerReady: (handle) => {
              if (!cancelled) onDoorHandleReadyRef.current?.(handle)
            },
            onReady: () => {
              if (!cancelled) onRoomReadyRef.current?.()
            },
            onError: () => {
              if (!cancelled) {
                setFailed(true)
                onRoomReadyRef.current?.()
              }
            },
          })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true)
          onRoomReadyRef.current?.()
        }
      })
    return () => {
      cancelled = true
      onDoorHandleReadyRef.current?.(null)
      stop?.()
      resetBridge()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- arrivedViaDoor is captured once per floor mount
  }, [])

  return (
    <>
      <div ref={stage} className="tf-game" />
      <div className="tf-ui">
        <FloorUi
          suggestedName={me.suggestedName}
          doorNear={doorNear}
          onRequestOffice={onRequestOffice}
        />
        <LoginPrompt />
      </div>
      {failed && (
        <Gate
          icon={Wrench}
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

/**
 * Loads the character of the visitor (account, or the guest whose token the browser kept) and opens the
 * floor. A visitor with no saved guest token goes straight to the join card.
 */
function Entry({
  userId,
  arrivedViaDoor,
  onRequestOffice,
  onRoomReady,
  onDoorHandleReady,
}: {
  userId: string | null
  arrivedViaDoor?: boolean
  onRequestOffice?: () => void
  onRoomReady?: () => void
  onDoorHandleReady?: (handle: RoomDoorHandle | null) => void
}) {
  // Read once: the token appears later only through the join card, which keeps this page mounted.
  const [guestToken] = useState(() =>
    userId === null ? getGuestToken() : null
  )
  const enabled = userId !== null || guestToken !== null
  const me = useQuery({
    queryKey: ["trading-floor", "me", userId ?? `guest:${guestToken ?? ""}`],
    queryFn: () => floorApi.me(),
    enabled,
    // Always read the server: a profile saved last visit must not come back from a cache.
    gcTime: 0,
    staleTime: 0,
    retry: (count, error) =>
      userId === null && isGuestInvalid(error) ? false : count < 1,
    refetchOnWindowFocus: false,
  })
  const [attempt, setAttempt] = useState(0)
  const guestInvalid = userId === null && me.isError && isGuestInvalid(me.error)

  useEffect(() => {
    if (guestInvalid) setGuestToken(null)
  }, [guestInvalid])

  useEffect(() => {
    if (me.isError && !guestInvalid) {
      onRoomReady?.()
    }
  }, [guestInvalid, me.isError, onRoomReady])

  if (userId === null && (!enabled || guestInvalid)) {
    return (
      <Floor
        key={attempt}
        me={NEW_GUEST}
        onRetry={() => setAttempt((n) => n + 1)}
        arrivedViaDoor={arrivedViaDoor}
        onRequestOffice={onRequestOffice}
        onRoomReady={onRoomReady}
        onDoorHandleReady={onDoorHandleReady}
      />
    )
  }
  if (me.isError) {
    return (
      <Gate
        icon={WifiOff}
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
      arrivedViaDoor={arrivedViaDoor}
      onRequestOffice={onRequestOffice}
      onRoomReady={onRoomReady}
      onDoorHandleReady={onDoorHandleReady}
    />
  )
}

export function TradingFloorPage({
  arrivedViaDoor = false,
  onRequestOffice,
  onRoomReady,
  onDoorHandleReady,
}: TradingFloorPageProps = {}) {
  const { user, isLoading } = useAuth()

  // No login wall: a visitor who is not signed in enters as a guest with a name and a character.
  const content = isLoading ? (
    <div className="gate" role="status">
      <p className="muted">Đang kiểm tra đăng nhập…</p>
    </div>
  ) : (
    <Entry
      key={user?.id ?? "guest"}
      userId={user?.id ?? null}
      arrivedViaDoor={arrivedViaDoor}
      onRequestOffice={onRequestOffice}
      onRoomReady={onRoomReady}
      onDoorHandleReady={onDoorHandleReady}
    />
  )

  return (
    <div
      className="tf-root relative h-full min-h-0 min-w-0 flex-1 overflow-hidden"
      data-testid="trading-floor-page"
      data-wasd-world="true"
    >
      {content}
    </div>
  )
}
