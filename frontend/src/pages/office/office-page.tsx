import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLocation, useSearchParams } from "react-router"

import { useAuth } from "@/hooks/use-auth"

import type { OfficeEngineHandle } from "./engine/start-office.ts"
import {
  invalidateOfficeScope,
  useOfficeAttendanceToday,
  useOfficeLeaderboard,
  useOfficeMe,
  useOfficeMeetings,
} from "./hooks.ts"
import { NonMemberGate } from "./hud/NonMemberGate.tsx"
import { OfficeHud } from "./hud/OfficeHud.tsx"
import { OfficeToast } from "./hud/OfficeToast.tsx"
import { DocumentsModal } from "./modals/DocumentsModal.tsx"
import { LeaderboardModal } from "./modals/LeaderboardModal.tsx"
import { ManagerModal } from "./modals/ManagerModal.tsx"
import { MeetingRoomModal } from "./modals/MeetingRoomModal.tsx"
import { MyTasksModal } from "./modals/MyTasksModal.tsx"
import { StaffProfileModal } from "./modals/StaffProfileModal.tsx"
import {
  createOfficeSocket,
  type OfficeSocketHandle,
} from "./office-socket.ts"
import type {
  OfficeEffectiveRole,
  OfficeMe,
  OfficeModalId,
  OfficeOnlinePeer,
  OfficeStationAction,
} from "./types.ts"
import "./office.css"

const TOAST_DURATION_MS = 2600

const BOSS_MODALS: ReadonlySet<OfficeModalId> = new Set([
  "mgr",
  "prof",
  "meet",
  "docs",
  "stand",
])

const STAFF_MODALS: ReadonlySet<OfficeModalId> = new Set([
  "mine",
  "meet",
  "docs",
  "stand",
])

function sanitizeModalForRole(
  raw: string | null,
  role: OfficeEffectiveRole
): OfficeModalId | null {
  if (!raw) return null
  if (role === "boss" && BOSS_MODALS.has(raw as OfficeModalId)) {
    return raw as OfficeModalId
  }
  if (role === "staff" && STAFF_MODALS.has(raw as OfficeModalId)) {
    return raw as OfficeModalId
  }
  return null
}

interface OfficeWorkspaceProps {
  me: OfficeMe
  userId: string
}

function OfficeWorkspace({ me, userId }: OfficeWorkspaceProps) {
  const queryClient = useQueryClient()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()

  const stageRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<OfficeEngineHandle | null>(null)
  const socketRef = useRef<OfficeSocketHandle | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [engineAttempt, setEngineAttempt] = useState(0)
  const [webglFailed, setWebglFailed] = useState(false)
  const [onlinePeers, setOnlinePeers] = useState<OfficeOnlinePeer[]>([])
  const [onlineCount, setOnlineCount] = useState<number>(() =>
    Math.max(1, me.onlineCount)
  )
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [focusProposal, setFocusProposal] = useState(false)
  const [profileUserId, setProfileUserId] = useState<string | null>(null)

  const attendanceQuery = useOfficeAttendanceToday(true)
  const meetingsQuery = useOfficeMeetings(true)
  const leaderboardQuery = useOfficeLeaderboard(me.periodMonth, true)

  const rawModalParam = searchParams.get("modal")
  const activeModal = sanitizeModalForRole(rawModalParam, me.role)

  const showToast = useCallback((message: string) => {
    setToastMessage(message)
    if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => {
      toastTimerRef.current = null
      setToastMessage(null)
    }, TOAST_DURATION_MS)
  }, [])

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current)
    }
  }, [])

  const openModal = useCallback(
    (
      modal: OfficeModalId,
      options?: { focusProposal?: boolean; profileUserId?: string | null }
    ) => {
      const allowed = sanitizeModalForRole(modal, me.role)
      if (!allowed) return
      setFocusProposal(Boolean(options?.focusProposal))
      if (options && "profileUserId" in options) {
        setProfileUserId(options.profileUserId ?? null)
      } else if (allowed !== "prof") {
        setProfileUserId(null)
      }
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set("modal", allowed)
          return next
        },
        { replace: true }
      )
    },
    [me.role, setSearchParams]
  )

  const closeModal = useCallback(() => {
    setFocusProposal(false)
    setProfileUserId(null)
    setSearchParams(
      (prev) => {
        if (!prev.has("modal")) return prev
        const next = new URLSearchParams(prev)
        next.delete("modal")
        return next
      },
      { replace: true }
    )
  }, [setSearchParams])

  // Strip unauthorized or unknown ?modal= values cleanly
  useEffect(() => {
    if (rawModalParam && !activeModal) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete("modal")
          return next
        },
        { replace: true }
      )
    }
  }, [activeModal, rawModalParam, setSearchParams])

  // Refresh relevant Office caches when re-entering via Notification Bell while already on /van-phong
  useEffect(() => {
    const state = location.state as { notificationId?: string } | null
    if (!state?.notificationId) return
    invalidateOfficeScope(queryClient, "tasks", userId)
    invalidateOfficeScope(queryClient, "proposals", userId)
  }, [location.key, location.state, queryClient, userId])

  const activeWallMeeting =
    meetingsQuery.data?.nextWallMeeting ?? meetingsQuery.data?.today[0] ?? null

  const openModalRef = useRef(openModal)
  const closeModalRef = useRef(closeModal)
  const latestEngineStateRef = useRef({
    me,
    onlinePeers,
    attendance: attendanceQuery.data ?? null,
    activeWallMeeting,
    leaderboard: leaderboardQuery.data ?? null,
    activeModal,
  })
  useEffect(() => {
    openModalRef.current = openModal
  }, [openModal])
  useEffect(() => {
    closeModalRef.current = closeModal
  }, [closeModal])
  useEffect(() => {
    latestEngineStateRef.current = {
      me,
      onlinePeers,
      attendance: attendanceQuery.data ?? null,
      activeWallMeeting,
      leaderboard: leaderboardQuery.data ?? null,
      activeModal,
    }
  }, [
    activeModal,
    activeWallMeeting,
    attendanceQuery.data,
    leaderboardQuery.data,
    me,
    onlinePeers,
  ])

  // Real-time WebSocket presence + live sync
  useEffect(() => {
    const handle = createOfficeSocket({
      queryClient,
      userId,
      onWelcome: (_self, peers, count) => {
        setOnlinePeers(peers)
        setOnlineCount(Math.max(1, count))
        engineRef.current?.resendSelfState?.()
      },
      onPeersChange: (peers, count) => {
        setOnlinePeers(peers)
        setOnlineCount(Math.max(1, count))
      },
      onError: (_code, message) => {
        if (message) showToast(message)
      },
    })
    socketRef.current = handle
    handle.start()
    return () => {
      handle.stop()
      if (socketRef.current === handle) {
        socketRef.current = null
      }
    }
  }, [queryClient, showToast, userId])

  // Lazy-boot Procedural Three.js 3D Engine (keeps `three` out of main SSR bundle)
  const initialStaffCount = useMemo(
    () => Math.max(1, me.members.filter((m) => m.role === "staff").length),
    [me.members]
  )

  useEffect(() => {
    const container = stageRef.current
    if (!container) return
    let cancelled = false
    let localHandle: OfficeEngineHandle | null = null

    import("./engine/start-office.ts")
      .then(({ startOffice }) => {
        if (cancelled) return
        setWebglFailed(false)
        const latest = latestEngineStateRef.current
        const latestStaffCount = Math.max(
          1,
          latest.me.members.filter((m) => m.role === "staff").length
        )
        const handle = startOffice(container, {
          initialStaffCount: latestStaffCount || initialStaffCount,
          onStationTrigger: (action: OfficeStationAction) => {
            openModalRef.current(action.modal, {
              focusProposal: action.focusProposal,
            })
          },
          onCloseModal: () => {
            closeModalRef.current()
          },
          onSelfState: (state) => {
            socketRef.current?.sendState(state)
          },
          onError: () => {
            if (!cancelled) setWebglFailed(true)
          },
        })
        localHandle = handle
        engineRef.current = handle
        handle.setModalOpen(latest.activeModal !== null)
        handle.updateTeam(latest.me)
        handle.updateOnlinePeers(latest.onlinePeers)
        handle.updateAttendance(latest.attendance)
        handle.updateMeeting(latest.activeWallMeeting)
        handle.updateStandee(latest.leaderboard)
        handle.resendSelfState?.()
      })
      .catch(() => {
        if (!cancelled) setWebglFailed(true)
      })

    return () => {
      cancelled = true
      localHandle?.dispose()
      if (engineRef.current === localHandle) {
        engineRef.current = null
      }
    }
    // Engine boots once per workspace mount or explicit WebGL retry; reactive state pushes via sync effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engineAttempt])

  // Push live state into 3D engine whenever data changes
  useEffect(() => {
    engineRef.current?.updateTeam(me)
  }, [me])

  useEffect(() => {
    engineRef.current?.updateOnlinePeers(onlinePeers)
  }, [onlinePeers])

  useEffect(() => {
    engineRef.current?.updateAttendance(attendanceQuery.data ?? null)
  }, [attendanceQuery.data])

  useEffect(() => {
    engineRef.current?.updateMeeting(activeWallMeeting)
  }, [activeWallMeeting])

  useEffect(() => {
    engineRef.current?.updateStandee(leaderboardQuery.data ?? null)
  }, [leaderboardQuery.data])

  useEffect(() => {
    engineRef.current?.setModalOpen(activeModal !== null)
  }, [activeModal])

  const handleZoom = useCallback((delta: 1 | -1) => {
    engineRef.current?.setZoomDelta(delta)
  }, [])

  return (
    <div
      className="of-root"
      data-testid="office-page"
      data-wasd-world="true"
    >
      <div className="of-stage">
        <div ref={stageRef} className="of-canvas-host" />

        {webglFailed && (
          <div className="of-fallback" role="region" aria-label="Chế độ dự phòng 3D">
            <div className="of-fallback-card">
              <h3>Không khởi tạo được không gian 3D (WebGL)</h3>
              <p>
                Trình duyệt hoặc thiết bị hiện chưa hỗ trợ WebGL. Bạn vẫn có thể
                mở nhanh toàn bộ bảng công việc, phòng họp, tài liệu và thành
                tích tháng ngay tại đây.
              </p>
              <div className="of-fallback-actions">
                {me.role === "staff" ? (
                  <button
                    type="button"
                    className="of-btn is-gold"
                    onClick={() => openModal("mine")}
                  >
                    Nhiệm vụ của tôi
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="of-btn is-gold"
                      onClick={() => openModal("mgr")}
                    >
                      Quản lý
                    </button>
                    <button
                      type="button"
                      className="of-btn is-gold"
                      onClick={() => openModal("prof")}
                    >
                      Hồ sơ nhân viên
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="of-btn is-ghost"
                  onClick={() => openModal("meet")}
                >
                  Phòng họp
                </button>
                <button
                  type="button"
                  className="of-btn is-ghost"
                  onClick={() => openModal("docs")}
                >
                  Phòng tài liệu
                </button>
                <button
                  type="button"
                  className="of-btn is-ghost"
                  onClick={() => openModal("stand")}
                >
                  Thành tích tháng
                </button>
                <button
                  type="button"
                  className="of-btn is-ghost"
                  onClick={() => {
                    setWebglFailed(false)
                    setEngineAttempt((count) => count + 1)
                  }}
                >
                  Thử lại 3D
                </button>
              </div>
            </div>
          </div>
        )}

        <OfficeHud
          me={me}
          attendance={attendanceQuery.data ?? null}
          onlineCount={onlineCount}
          onOpenModal={(modal) => openModal(modal)}
          onZoom={handleZoom}
        />
      </div>

      {activeModal === "mine" && me.role === "staff" && (
        <MyTasksModal
          me={me}
          autoFocusProposal={focusProposal}
          onClose={closeModal}
          onToast={showToast}
        />
      )}

      {activeModal === "mgr" && me.role === "boss" && (
        <ManagerModal
          me={me}
          onClose={closeModal}
          onOpenProfile={(targetUserId) =>
            openModal("prof", { profileUserId: targetUserId ?? null })
          }
          onToast={showToast}
        />
      )}

      {activeModal === "prof" && me.role === "boss" && (
        <StaffProfileModal
          me={me}
          initialUserId={profileUserId}
          onClose={closeModal}
          onToast={showToast}
        />
      )}

      {activeModal === "meet" && (
        <MeetingRoomModal me={me} onClose={closeModal} onToast={showToast} />
      )}

      {activeModal === "docs" && (
        <DocumentsModal me={me} onClose={closeModal} onToast={showToast} />
      )}

      {activeModal === "stand" && (
        <LeaderboardModal me={me} onClose={closeModal} />
      )}

      <OfficeToast message={toastMessage} />
    </div>
  )
}

export function OfficePage() {
  const { user, isAuthenticated, isLoading: authLoading, openAuth } = useAuth()
  const meQuery = useOfficeMe(isAuthenticated)

  if (authLoading) {
    return (
      <div className="of-root">
        <NonMemberGate mode="loading" />
      </div>
    )
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="of-root">
        <NonMemberGate mode="guest" onLogin={() => openAuth("login")} />
      </div>
    )
  }

  if (meQuery.isLoading) {
    return (
      <div className="of-root">
        <NonMemberGate mode="loading" />
      </div>
    )
  }

  if (meQuery.isError) {
    return (
      <div className="of-root">
        <NonMemberGate
          mode="error"
          errorMessage={meQuery.error.message}
          onRetry={() => void meQuery.refetch()}
        />
      </div>
    )
  }

  const me = meQuery.data
  if (!me || !me.member || !me.self || !me.team) {
    return (
      <div className="of-root">
        <NonMemberGate mode="non-member" />
      </div>
    )
  }

  return (
    <OfficeWorkspace
      key={`${me.team.id}:${me.self.userId}`}
      me={me}
      userId={user.id}
    />
  )
}
