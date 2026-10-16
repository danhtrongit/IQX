/**
 * Bộ lọc của danh sách người dùng trưởng nhóm nằm trên URL (`/admin/users?segment=…`), để
 * lối tắt ở Tổng quan mở thẳng danh sách đã lọc và nút quay lại giữ nguyên bộ lọc. Giá trị
 * lạ trên URL bị bỏ qua thay vì gửi lên máy chủ.
 */
import {
  TEAM_PAGE_SIZES,
  TEAM_USER_ROLES,
  TEAM_USER_SEGMENTS,
  TEAM_USER_SORTS,
  type TeamUserListParams,
  type TeamUserRole,
  type TeamUserSegment,
  type TeamUserSort,
} from "./api"

export const DEFAULT_TEAM_USER_PARAMS: TeamUserListParams = {
  page: 1,
  pageSize: 20,
  sortBy: "created_at",
  sortOrder: "desc",
}

function oneOf<T extends string>(values: readonly T[], value: string | null): T | undefined {
  return value !== null && (values as readonly string[]).includes(value) ? (value as T) : undefined
}

export function parseTeamUserParams(search: URLSearchParams): TeamUserListParams {
  const page = Number(search.get("page"))
  const pageSize = Number(search.get("page_size"))
  const text = search.get("search")?.trim()
  return {
    page: Number.isInteger(page) && page >= 1 ? page : DEFAULT_TEAM_USER_PARAMS.page,
    pageSize: (TEAM_PAGE_SIZES as readonly number[]).includes(pageSize) ? pageSize : DEFAULT_TEAM_USER_PARAMS.pageSize,
    search: text ? text : undefined,
    role: oneOf<TeamUserRole>(TEAM_USER_ROLES, search.get("role")),
    segment: oneOf<TeamUserSegment>(TEAM_USER_SEGMENTS, search.get("segment")),
    sortBy: oneOf<TeamUserSort>(TEAM_USER_SORTS, search.get("sort_by")) ?? DEFAULT_TEAM_USER_PARAMS.sortBy,
    sortOrder: oneOf(["asc", "desc"] as const, search.get("sort_order")) ?? DEFAULT_TEAM_USER_PARAMS.sortOrder,
  }
}

/** Chỉ ghi các giá trị khác mặc định, để URL ngắn và ổn định. */
export function toTeamUserSearch(params: TeamUserListParams): URLSearchParams {
  const search = new URLSearchParams()
  if (params.search) search.set("search", params.search)
  if (params.role) search.set("role", params.role)
  if (params.segment) search.set("segment", params.segment)
  if (params.sortBy !== DEFAULT_TEAM_USER_PARAMS.sortBy || params.sortOrder !== DEFAULT_TEAM_USER_PARAMS.sortOrder) {
    search.set("sort_by", params.sortBy)
    search.set("sort_order", params.sortOrder)
  }
  if (params.pageSize !== DEFAULT_TEAM_USER_PARAMS.pageSize) search.set("page_size", String(params.pageSize))
  if (params.page !== DEFAULT_TEAM_USER_PARAMS.page) search.set("page", String(params.page))
  return search
}
