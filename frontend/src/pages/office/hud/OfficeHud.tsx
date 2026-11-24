import { ChevronRight, ChevronUp, DoorOpen } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"

import type {
  OfficeAttendanceDisplayState,
  OfficeAttendanceToday,
  OfficeBossHud,
  OfficeMe,
  OfficeModalId,
  OfficeStaffHud,
} from "../types.ts"
import {
  monthNumberFromPeriod,
  readHudCollapseState,
  writeHudCollapseState,
} from "../utils.ts"

const MOBILE_MEDIA_QUERY = "(max-width: 720px)"

type HudCardKey = "mgr" | "prof" | "mine" | "att"

export interface OfficeHudProps {
  me: OfficeMe
  attendance: OfficeAttendanceToday | null
  onlineCount: number
  onOpenModal: (modal: OfficeModalId) => void
  onZoom: (delta: 1 | -1) => void
  onGoTradingFloor?: () => void
}

function getInitialMobile(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false
  }
  return window.matchMedia(MOBILE_MEDIA_QUERY).matches
}

interface HudCardProps {
  id: HudCardKey
  title: string
  badge?: string | null
  collapsed: boolean
  onToggle: (id: HudCardKey) => void
  children: ReactNode
}

function HudCard({
  id,
  title,
  badge,
  collapsed,
  onToggle,
  children,
}: HudCardProps) {
  return (
    <section
      className={collapsed ? "of-hc is-mini" : "of-hc"}
      data-testid={`office-hud-card-${id}`}
    >
      <button
        type="button"
        className="of-hc-head"
        aria-expanded={!collapsed}
        onClick={() => onToggle(id)}
      >
        <span className="of-hc-title">
          <span>{title}</span>
          {badge && <span className="of-hc-bdg">{badge}</span>}
        </span>
        <ChevronUp size={16} className="of-hc-chev" aria-hidden="true" />
      </button>
      <div className="of-hc-body">{children}</div>
    </section>
  )
}

export function OfficeHud({
  me,
  attendance,
  onlineCount,
  onOpenModal,
  onZoom,
  onGoTradingFloor,
}: OfficeHudProps) {
  const [isMobile, setIsMobile] = useState<boolean>(getInitialMobile)
  const [desktopMini, setDesktopMini] = useState<Record<string, boolean>>(() =>
    readHudCollapseState()
  )
  const [mobileMini, setMobileMini] = useState<Record<string, boolean>>({
    mgr: true,
    prof: true,
    mine: true,
    att: true,
  })
  const [selectedBucket, setSelectedBucket] =
    useState<OfficeAttendanceDisplayState | null>(null)

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return
    }
    const mq = window.matchMedia(MOBILE_MEDIA_QUERY)
    const handleChange = (event: MediaQueryListEvent) => {
      setIsMobile(event.matches)
      if (event.matches) {
        setMobileMini({ mgr: true, prof: true, mine: true, att: true })
      }
    }
    mq.addEventListener("change", handleChange)
    return () => mq.removeEventListener("change", handleChange)
  }, [])

  const isCollapsed = (id: HudCardKey): boolean =>
    isMobile ? mobileMini[id] !== false : Boolean(desktopMini[id])

  const handleToggle = (id: HudCardKey): void => {
    if (isMobile) {
      setMobileMini((prev) => ({
        ...prev,
        [id]: prev[id] === false ? true : false,
      }))
      return
    }
    setDesktopMini((prev) => {
      const next = { ...prev, [id]: !prev[id] }
      writeHudCollapseState(next)
      return next
    })
  }

  const bossName = me.team?.bossName ?? "Văn phòng"
  const selfName = me.self?.displayName ?? ""
  const monthNum = monthNumberFromPeriod(me.periodMonth)
  const bossHud: OfficeBossHud | null =
    me.hud?.kind === "boss" ? me.hud : null
  const staffHud: OfficeStaffHud | null =
    me.hud?.kind === "staff" ? me.hud : null

  const isWorkday = attendance?.isWorkday ?? me.isWorkday
  const isLocked = attendance?.isLocked ?? me.isAttendanceLocked
  const cutoffs = attendance?.cutoffs ?? me.cutoffs
  const counts = attendance?.counts ?? { ok: 0, late: 0, absent: 0, total: 0 }
  const checkedCount = counts.ok + counts.late
  const attBadge = isWorkday
    ? `${checkedCount}/${counts.total}`
    : "Nghỉ cuối tuần/lễ"

  const myCheckedInAt =
    attendance?.myCheckedInAt ?? staffHud?.myCheckedInAt ?? null
  const showStaffNudge =
    me.role === "staff" && isWorkday && !isLocked && myCheckedInAt === null

  const rosterEntries =
    selectedBucket && attendance ? attendance.roster[selectedBucket] : []
  const rosterTitle =
    selectedBucket === "ok"
      ? `Đúng giờ · ${rosterEntries.length} người`
      : selectedBucket === "late"
        ? `Trễ · ${rosterEntries.length} người`
        : `Vắng · ${rosterEntries.length} người`

  const bossCards =
    me.role === "boss" && bossHud ? (
      <>
        <HudCard
          id="mgr"
          title="QUẢN LÝ"
          badge={
            bossHud.pendingCount + bossHud.newProposalsCount > 0
              ? String(bossHud.pendingCount + bossHud.newProposalsCount)
              : null
          }
          collapsed={isCollapsed("mgr")}
          onToggle={handleToggle}
        >
          <button
            type="button"
            className="of-hc-open"
            onClick={() => onOpenModal("mgr")}
          >
            <div className="of-hc-row">
              <span>Chờ xác nhận</span>
              <b className={bossHud.pendingCount > 0 ? "is-warn" : undefined}>
                {bossHud.pendingCount}
              </b>
            </div>
            <div className="of-hc-row">
              <span>Đề xuất mới</span>
              <b>{bossHud.newProposalsCount}</b>
            </div>
            <div className="of-hc-row">
              <span>Nhiệm vụ hôm nay của nhóm</span>
              <b>
                {bossHud.todayDoneCount}/{bossHud.todayTotalCount}
              </b>
            </div>
            <span className="of-hc-more">
              Mở bảng Quản lý <ChevronRight size={14} aria-hidden="true" />
            </span>
          </button>
        </HudCard>

        <HudCard
          id="prof"
          title="HỒ SƠ NHÂN VIÊN"
          collapsed={isCollapsed("prof")}
          onToggle={handleToggle}
        >
          <button
            type="button"
            className="of-hc-open"
            onClick={() => onOpenModal("prof")}
          >
            <div className="of-hc-row">
              <span>Nhân viên</span>
              <b>{bossHud.staffCount} người</b>
            </div>
            <div className="of-hc-row">
              <span>Mới nhất</span>
              <b>{bossHud.latestStaffName ?? "Chưa có"}</b>
            </div>
            <span className="of-hc-more">
              Mở hồ sơ nhân viên <ChevronRight size={14} aria-hidden="true" />
            </span>
          </button>
        </HudCard>
      </>
    ) : null

  const staffCard =
    me.role === "staff" && staffHud ? (
      <HudCard
        id="mine"
        title="NHIỆM VỤ CỦA TÔI"
        badge={
          staffHud.returnedCount > 0
            ? `${staffHud.returnedCount} cần làm lại`
            : null
        }
        collapsed={isCollapsed("mine")}
        onToggle={handleToggle}
      >
        <button
          type="button"
          className="of-hc-open"
          onClick={() => onOpenModal("mine")}
        >
          <div className="of-hc-row">
            <span>Nhiệm vụ hôm nay</span>
            <b>
              {staffHud.todayDoneCount}/{staffHud.todayTotalCount} xong
            </b>
          </div>
          <div className="of-hc-row">
            <span>Chờ sếp xác nhận</span>
            <b>{staffHud.pendingCount}</b>
          </div>
          <div className="of-hc-row">
            <span>Điểm tháng {monthNum}</span>
            <b className="is-gold">{staffHud.monthlyPoints} điểm</b>
          </div>
          <span className="of-hc-more">
            Mở nhiệm vụ của tôi <ChevronRight size={14} aria-hidden="true" />
          </span>
        </button>
      </HudCard>
    ) : null

  const attendanceCard = (
    <HudCard
      id="att"
      title="ĐIỂM DANH"
      badge={attBadge}
      collapsed={isCollapsed("att")}
      onToggle={handleToggle}
    >
      <div className="of-att-grid" role="group" aria-label="Bộ lọc điểm danh">
        <button
          type="button"
          className={`of-att-tile is-ok${selectedBucket === "ok" ? " is-selected" : ""}`}
          aria-pressed={selectedBucket === "ok"}
          onClick={() =>
            setSelectedBucket((prev) => (prev === "ok" ? null : "ok"))
          }
        >
          <b>{counts.ok}</b>
          <span>Đúng giờ</span>
        </button>
        <button
          type="button"
          className={`of-att-tile is-late${selectedBucket === "late" ? " is-selected" : ""}`}
          aria-pressed={selectedBucket === "late"}
          onClick={() =>
            setSelectedBucket((prev) => (prev === "late" ? null : "late"))
          }
        >
          <b>{counts.late}</b>
          <span>Trễ</span>
        </button>
        <button
          type="button"
          className={`of-att-tile is-abs${selectedBucket === "absent" ? " is-selected" : ""}`}
          aria-pressed={selectedBucket === "absent"}
          onClick={() =>
            setSelectedBucket((prev) => (prev === "absent" ? null : "absent"))
          }
        >
          <b>{counts.absent}</b>
          <span>Vắng</span>
        </button>
      </div>

      {showStaffNudge && (
        <button
          type="button"
          className="of-nudge"
          onClick={() => onOpenModal("mine")}
        >
          <span>Bạn chưa điểm danh hôm nay · mở Nhiệm vụ của tôi ›</span>
        </button>
      )}

      {selectedBucket && (
        <div
          className="of-att-roster"
          data-testid="office-attendance-roster"
        >
          <h6
            className={
              selectedBucket === "ok"
                ? "is-ok"
                : selectedBucket === "late"
                  ? "is-late"
                  : "is-abs"
            }
          >
            {rosterTitle}
          </h6>
          {rosterEntries.length === 0 ? (
            <p className="of-empty" style={{ padding: "6px 0" }}>
              Không có ai.
            </p>
          ) : (
            <ul>
              {rosterEntries.map((entry) => (
                <li key={entry.userId}>
                  <span>
                    {entry.displayName}
                    {entry.isSelf && (
                      <span className="of-self-mark"> (bạn)</span>
                    )}
                  </span>
                  {selectedBucket !== "absent" && entry.timeLabel && (
                    <b>{entry.timeLabel}</b>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="of-rule" style={{ marginBottom: 0 }}>
        Đúng giờ: điểm danh trước {cutoffs.onTime} · Trễ: {cutoffs.onTime}–
        {cutoffs.lock} · Không điểm danh tính vắng · Thứ Hai – Thứ Sáu
      </p>
    </HudCard>
  )

  const doorButton = onGoTradingFloor ? (
    <button
      type="button"
      className="of-door-btn"
      data-testid="office-go-floor-btn"
      onClick={onGoTradingFloor}
    >
      <DoorOpen size={17} aria-hidden="true" />
      <span>Về Khu giao dịch</span>
    </button>
  ) : null

  return (
    <>
      <div className="of-hud of-hud-tl">
        <div className="of-pill" data-testid="office-title-pill">
          <span className="of-pill-gold">IQX</span>
          <span>Văn phòng · Nhóm {bossName}</span>
        </div>
        {!isMobile && doorButton}
        {!isMobile && bossCards && (
          <div className="of-hud-stack">{bossCards}</div>
        )}
      </div>

      <div className="of-hud of-hud-tr">
        <div className="of-hrow">
          <div className="of-pill" data-testid="office-online-pill">
            <span className="of-pill-live" aria-hidden="true" />
            <span>{onlineCount} trực tuyến</span>
          </div>
          {selfName && (
            <div className="of-pill of-pill-me" data-testid="office-self-pill">
              {selfName}
            </div>
          )}
        </div>

        <div className="of-hud-stack">
          {isMobile && bossCards}
          {staffCard}
          {attendanceCard}
        </div>
      </div>

      <div className="of-zoom">
        <button
          type="button"
          aria-label="Phóng to"
          onClick={() => onZoom(1)}
        >
          +
        </button>
        <button
          type="button"
          aria-label="Thu nhỏ"
          onClick={() => onZoom(-1)}
        >
          −
        </button>
      </div>

      {isMobile && doorButton && (
        <div className="of-hud of-hud-br">{doorButton}</div>
      )}

      <div className="of-hint" aria-hidden="true">
        Nhấn chuột để đi · WASD / mũi tên · E để mở · cuộn để phóng to
      </div>
    </>
  )
}
