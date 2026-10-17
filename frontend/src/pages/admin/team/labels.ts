import { formatNumber } from "@/lib/format"

import type { TeamUserSegment } from "./api"

/** 4 lối tắt của Tổng quan trưởng nhóm (admin spec v1.1 §5.1.2). */
export const SEGMENT_COPY: Record<TeamUserSegment, { label: string; description: string }> = {
  new_7d: { label: "Người dùng mới 7 ngày", description: "Tạo tài khoản trong 7 ngày gần nhất" },
  email_unverified: { label: "Chưa xác thực email", description: "Chưa bấm liên kết xác thực trong email" },
  trialing: { label: "Đang dùng thử", description: "Đang trong thời gian dùng thử Premium" },
  inactive_14d: { label: "Không đăng nhập 14 ngày", description: "Không đăng nhập từ 14 ngày trở lên" },
}

/** Chỉ báo hiển thị khi tài khoản Demo Trading hoặc Bot chưa được kích hoạt (§7.6). */
export const NOT_ACTIVATED_LABEL = "Chưa kích hoạt"
export const ACADEMY_NOT_STARTED_LABEL = "Chưa bắt đầu"
export const ACADEMY_ALL_DONE_LABEL = "Đã hoàn thành các chương hiện có"

/** Đường dẫn danh sách người dùng đã lọc theo một lối tắt. */
export function segmentHref(segment: TeamUserSegment): string {
  return `/admin/users?segment=${segment}`
}

/** Nhãn phạm vi đầu trang (§5.1.2): "Nhóm của bạn · N người dùng · mã <code>". */
export function teamScopeLabel(me: { memberCount: number; code: string } | undefined): string {
  if (!me) return "Nhóm của bạn"
  return `Nhóm của bạn · ${formatNumber(me.memberCount)} người dùng · mã ${me.code}`
}
