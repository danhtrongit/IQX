import type { User360 } from "@/pages/admin/core/api"

import type { TeamAcademyConfig, TeamUserRow } from "./api"

/** Cấu hình Học viện của một nhóm có cấu hình riêng: bỏ chương 2, nên "Thương hiệu cá nhân" thành chương 2. */
export function teamAcademyConfig(overrides: Partial<TeamAcademyConfig> = {}): TeamAcademyConfig {
  return {
    has_own_config: true,
    read_only: true,
    mode: "sequential",
    chapter_count: 3,
    chapter_total: 12,
    required_total: 40,
    updated_at: "2026-11-02T03:00:00Z",
    chapters: [
      { chapter_id: "ch01", display_no: 1, title: "Nền tảng", lesson_count: 12, has_practice: false },
      { chapter_id: "ch03", display_no: 2, title: "Thương hiệu cá nhân", lesson_count: 10, has_practice: true },
      { chapter_id: "ch04", display_no: 3, title: "Phương pháp kỹ thuật", lesson_count: 18, has_practice: false },
    ],
    ...overrides,
  }
}

export function teamUserRow(overrides: Partial<TeamUserRow> = {}): TeamUserRow {
  return {
    id: "m-1",
    username: "minh.tran",
    fullName: "Trần Minh",
    email: "minh@iqx.test",
    role: "premium",
    status: "active",
    isEmailVerified: true,
    lastLoginAt: "2026-10-12T02:00:00Z",
    createdAt: "2026-10-01T02:00:00Z",
    groupJoinVia: "code",
    groupJoinedAt: "2026-10-01T02:00:00Z",
    demoTrading: { activated: true, pnlPct: 12.5 },
    bot: { activated: true, pnlPct: -3.25, asOf: "2026-10-15" },
    academy: {
      started: true,
      allDone: false,
      completed: 5,
      total: 24,
      currentLessonLabel: "Chương 1 · Bài 6: Nến Nhật",
    },
    ...overrides,
  }
}

export function teamUser360(overrides: Partial<User360> = {}): User360 {
  return {
    user: {
      id: "m-1",
      username: "minh.tran",
      email: "minh@iqx.test",
      fullName: "Trần Minh",
      phoneNumber: "+84912345678",
      role: "premium",
      status: "active",
      isEmailVerified: true,
      lastLoginAt: "2026-10-12T02:00:00Z",
      createdAt: "2026-10-01T02:00:00Z",
    },
    subscription: null,
    subscriptionHistory: [],
    paymentHistory: [
      {
        id: "pay-1",
        invoiceNumber: "IQX-0001",
        amountVnd: 199000,
        status: "paid",
        grantType: "purchase",
        planCode: "PREMIUM_30D",
        paidAt: "2026-10-02T02:00:00Z",
        createdAt: "2026-10-02T01:58:00Z",
      },
    ],
    trialUsed: true,
    vtAccount: null,
    vtRecentOrders: [],
    loginHistory: [],
    group: {
      leadUserId: "lead-1",
      leadUsername: "lan.nguyen",
      leadFullName: "Nguyễn Lan",
      leadStatus: "active",
      code: "lan.nguyen",
      joinVia: "code",
      joinedAt: "2026-10-01T02:00:00Z",
    },
    referralOffer: null,
    demoTrading: {
      activated: true,
      accountId: "vt-1",
      status: "active",
      activatedAt: "2026-10-01T03:00:00Z",
      pnlPct: 4.2,
      lastActivityAt: "2026-10-14T03:00:00Z",
      asOf: null,
    },
    bot: {
      activated: false,
      accountId: null,
      status: null,
      activatedAt: null,
      pnlPct: null,
      lastActivityAt: null,
      asOf: null,
    },
    academy: null,
    ...overrides,
  }
}
