/**
 * Adapters của khu vực trưởng nhóm `team/*` (admin spec v1.1 §4.3). Mọi request đi qua
 * `requestOperation`, tức client `api()` dùng chung. Máy chủ luôn giới hạn theo nhóm của
 * người gọi, nên không có tham số nào chọn trưởng nhóm hay nhóm khác.
 *
 * Danh sách và chi tiết chỉ có % lợi nhuận Demo Trading và Bot, không có vốn hay giá trị
 * bằng tiền. Sắp xếp theo `demo_pnl_pct`, `bot_pnl_pct` và `academy_progress` được máy chủ
 * tính trong bộ nhớ trên toàn bộ thành viên của nhóm (nhóm nhỏ), các cột còn lại sắp trong SQL.
 */
import { requestOperation } from "@/lib/contract-client"
import {
  adaptDailyRevenuePoint,
  adaptLoginHistoryRow,
  adaptMetricsOverview,
  adaptPage,
  adaptUser360,
  type AdminPage,
  type DailyRevenuePoint,
  type LoginHistoryRow,
  type MetricsOverview,
  type User360,
} from "@/pages/admin/core/api"

export const TEAM_USER_ROLES = ["user", "premium"] as const
export type TeamUserRole = (typeof TEAM_USER_ROLES)[number]

/** Lối tắt của Tổng quan (§5.1.2), mỗi lối tắt là một bộ lọc của danh sách. */
export const TEAM_USER_SEGMENTS = ["new_7d", "email_unverified", "trialing", "inactive_14d"] as const
export type TeamUserSegment = (typeof TEAM_USER_SEGMENTS)[number]

/** Cả 5 cột của danh sách sắp được (§5.1.3); `created_at` là thứ tự mặc định. */
export const TEAM_USER_SORTS = ["username", "role", "demo_pnl_pct", "bot_pnl_pct", "academy_progress", "created_at"] as const
export type TeamUserSort = (typeof TEAM_USER_SORTS)[number]

export const TEAM_PAGE_SIZES = [20, 50, 100] as const

export type TeamUserListParams = {
  page: number
  pageSize: number
  search?: string
  role?: TeamUserRole
  segment?: TeamUserSegment
  sortBy: TeamUserSort
  sortOrder: "asc" | "desc"
}

export type TeamPnl = {
  activated: boolean
  /** Phần trăm (đã nhân 100, 2 chữ số thập phân); null khi chưa tính được. */
  pnlPct: number | null
}

export type TeamAcademySummary = {
  started: boolean
  allDone: boolean
  completed: number
  total: number
  /** "Chương c · Bài n: tên bài" do máy chủ dựng theo catalog hiện tại. */
  currentLessonLabel: string | null
}

export type TeamUserRow = {
  id: string
  username: string
  fullName: string | null
  email: string
  role: string
  status: string
  isEmailVerified: boolean
  lastLoginAt: string | null
  createdAt: string
  groupJoinVia: "code" | "admin"
  groupJoinedAt: string
  demoTrading: TeamPnl
  bot: TeamPnl & { asOf: string | null }
  academy: TeamAcademySummary
}

type WireTeamUserRow = Awaited<ReturnType<typeof listRaw>>["items"][number]

function listRaw(params: TeamUserListParams) {
  return requestOperation("GET /api/v2/team/users", {
    query: {
      page: params.page,
      page_size: params.pageSize,
      search: params.search || undefined,
      role: params.role,
      segment: params.segment,
      sort_by: params.sortBy,
      sort_order: params.sortOrder,
    },
  })
}

function finitePct(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

export function adaptTeamUserRow(raw: WireTeamUserRow): TeamUserRow {
  return {
    id: raw.id,
    username: raw.username,
    fullName: raw.full_name ? raw.full_name : null,
    email: raw.email,
    role: raw.role,
    status: raw.status,
    isEmailVerified: raw.is_email_verified,
    lastLoginAt: raw.last_login_at,
    createdAt: raw.created_at,
    groupJoinVia: raw.group_join_via,
    groupJoinedAt: raw.group_joined_at,
    demoTrading: { activated: raw.demo_trading.activated, pnlPct: finitePct(raw.demo_trading.pnl_pct) },
    bot: { activated: raw.bot.activated, pnlPct: finitePct(raw.bot.pnl_pct), asOf: raw.bot.as_of },
    academy: {
      started: raw.academy.started,
      allDone: raw.academy.all_done,
      completed: raw.academy.completed,
      total: raw.academy.total,
      currentLessonLabel: raw.academy.current_lesson?.label ?? null,
    },
  }
}

export const teamApi = {
  overview: async (): Promise<MetricsOverview> =>
    adaptMetricsOverview(await requestOperation("GET /api/v2/team/metrics/overview", {})),
  revenue: async (days = 30): Promise<DailyRevenuePoint[]> =>
    (await requestOperation("GET /api/v2/team/metrics/revenue", { query: { days } })).map(adaptDailyRevenuePoint),
  users: async (params: TeamUserListParams): Promise<AdminPage<TeamUserRow>> =>
    adaptPage(await listRaw(params), adaptTeamUserRow),
  /** Số thành viên khớp một lối tắt: chỉ đọc `total` của trang đầu (1 dòng). */
  segmentCount: async (segment: TeamUserSegment): Promise<number> =>
    (
      await requestOperation("GET /api/v2/team/users", {
        query: { page: 1, page_size: 1, segment, sort_by: "created_at", sort_order: "desc" },
      })
    ).total,
  /** 360 của thành viên, không có `vt_account`/`vt_recent_orders` (không có số tiền VT). */
  user360: async (userId: string): Promise<User360> =>
    adaptUser360(await requestOperation("GET /api/v2/team/users/{userId}", { path: { userId } })),
  loginHistory: async (userId: string, params: { page: number; pageSize: number }): Promise<AdminPage<LoginHistoryRow>> =>
    adaptPage(
      await requestOperation("GET /api/v2/team/users/{userId}/login-history", {
        path: { userId },
        query: { page: params.page, page_size: params.pageSize },
      }),
      adaptLoginHistoryRow,
    ),
  /** Loại khỏi nhóm (§3.4): người ngoài nhóm trả 404 USER_NOT_FOUND. */
  removeMember: async (userId: string, reason: string): Promise<{ userId: string; removedAt: string }> => {
    const raw = await requestOperation("POST /api/v2/team/users/{userId}/remove", { path: { userId }, body: { reason } })
    return { userId: raw.user_id, removedAt: raw.removed_at }
  },
}
