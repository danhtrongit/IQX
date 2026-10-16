/**
 * Nhãn tiếng Việt cho trang Trưởng nhóm (admin spec v1.1 §5.2). Trạng thái lưu là
 * `revoked`, hiển thị "Đã thôi".
 */
import { referralOfferLabel } from "@/pages/referral/api"

import type { AddMemberReason, AppointReason, GroupJoinVia, TeamLeadOfferType, TeamLeadStatus } from "./api"

export const TEAM_LEAD_STATUS_LABELS: Record<TeamLeadStatus, string> = {
  active: "Hoạt động",
  revoked: "Đã thôi",
}

export const JOIN_VIA_LABELS: Record<GroupJoinVia, string> = {
  code: "Mã giới thiệu",
  admin: "Quản trị viên thêm",
}

export const OFFER_TYPE_LABELS: Record<TeamLeadOfferType, string> = {
  none: "Không có ưu đãi",
  days: "Premium miễn phí có thời hạn",
  lifetime: "Premium miễn phí trọn đời",
}

/** `days` + 30 → "Premium miễn phí 30 ngày"; chính sách chưa có thì "—". */
export function offerLabel(offerType: TeamLeadOfferType | null | undefined, offerDays: number | null | undefined): string {
  if (!offerType) return "—"
  return referralOfferLabel(offerType, offerDays ?? null)
}

export function commissionLabel(pct: number | null | undefined): string {
  return pct === null || pct === undefined ? "—" : `${pct}%`
}

export const APPOINT_REASON_MESSAGES: Record<AppointReason, string> = {
  TEAM_LEAD_EXISTS: "Người dùng này đã là trưởng nhóm.",
  USER_NOT_ELIGIBLE: "Chỉ bổ nhiệm được tài khoản đang hoạt động và không phải quản trị viên.",
}

export const ADD_MEMBER_REASON_MESSAGES: Record<AddMemberReason, string> = {
  TARGET_IS_TEAM_LEAD: "Người dùng này là trưởng nhóm.",
  USER_NOT_ELIGIBLE: "Quản trị viên không thể là thành viên của nhóm.",
  ALREADY_IN_GROUP: "Người dùng đã ở trong nhóm này.",
}

export const HISTORY_ACTION_LABELS: Record<string, string> = {
  "team_lead.appoint": "Bổ nhiệm",
  "team_lead.policy_update": "Sửa chính sách",
  "team_lead.revoke": "Thôi bổ nhiệm",
  "group.member_add": "Thêm người dùng",
  "group.member_move": "Chuyển người dùng vào nhóm",
  "group.member_remove": "Loại người dùng",
}

export function labelForHistoryAction(action: string): string {
  return HISTORY_ACTION_LABELS[action] ?? action
}

function isOfferType(value: unknown): value is TeamLeadOfferType {
  return value === "none" || value === "days" || value === "lifetime"
}

function policyOf(payload: Record<string, unknown> | null) {
  if (!payload) return null
  const pct = typeof payload.commission_pct === "number" ? payload.commission_pct : null
  const offerType = isOfferType(payload.offer_type) ? payload.offer_type : null
  const offerDays = typeof payload.offer_days === "number" ? payload.offer_days : null
  return { pct, offer: offerLabel(offerType, offerDays) }
}

export type HistoryChange = { text: string; memberUserId: string | null }

/** Cột "Thay đổi" của bảng Lịch sử thay đổi, dựng từ `payload_before`/`payload_after`. */
export function describeHistoryChange(entry: {
  action: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
}): HistoryChange {
  const memberUserId =
    typeof entry.after?.member_user_id === "string"
      ? entry.after.member_user_id
      : typeof entry.before?.member_user_id === "string"
        ? entry.before.member_user_id
        : null
  switch (entry.action) {
    case "team_lead.appoint": {
      const policy = policyOf(entry.after)
      return {
        text: policy ? `Hoa hồng ${commissionLabel(policy.pct)} · Ưu đãi: ${policy.offer}` : "Bổ nhiệm trưởng nhóm",
        memberUserId: null,
      }
    }
    case "team_lead.policy_update": {
      const before = policyOf(entry.before)
      const after = policyOf(entry.after)
      if (!after) return { text: "Tạo chính sách mới", memberUserId: null }
      const changes: string[] = []
      if (!before || before.pct !== after.pct) {
        changes.push(before ? `Hoa hồng ${commissionLabel(before.pct)} → ${commissionLabel(after.pct)}` : `Hoa hồng ${commissionLabel(after.pct)}`)
      }
      if (!before || before.offer !== after.offer) {
        changes.push(before ? `Ưu đãi: ${before.offer} → ${after.offer}` : `Ưu đãi: ${after.offer}`)
      }
      return { text: changes.join(" · ") || "Không đổi", memberUserId: null }
    }
    case "team_lead.revoke":
      return { text: "Mã ngừng nhận người dùng mới", memberUserId: null }
    case "group.member_add":
      return { text: "Người dùng vào nhóm", memberUserId }
    case "group.member_move":
      return { text: "Người dùng chuyển từ nhóm khác sang", memberUserId }
    case "group.member_remove":
      return { text: "Người dùng rời nhóm", memberUserId }
    default:
      return { text: "—", memberUserId }
  }
}
