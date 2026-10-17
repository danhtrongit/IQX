import { describe, expect, it, vi } from "vitest"

import { adaptAuditLogRow, adaptPage, adaptUser360, adaptUserRow, ASSIGNABLE_ROLES, LISTABLE_ROLES, systemApi } from "./api"
import { api } from "@/lib/api"

vi.mock("@/lib/api", () => ({ api: vi.fn(), apiResponse: vi.fn() }))

describe("admin core response adapters", () => {
  it("uses canonical BullMQ job names instead of missing legacy IDs", async () => {
    vi.mocked(api).mockResolvedValueOnce({
      version: "0.2.0", environment: "test", scheduler_running: false,
      jobs: [{ name: "billing.expiry-sweep", description: "Expire subscriptions", everyMs: 3_600_000, enabled: true, handlerRegistered: true }],
      db_stats: { users: 2 }, last_ipn_received_at: null, last_ipn_processed_count_24h: 0, generated_at: "2026-09-23T00:00:00Z",
    })
    const result = await systemApi.status()
    expect(result.jobs).toEqual([{ id: "billing.expiry-sweep", name: "Expire subscriptions", trigger: "Mỗi 3600 giây", nextRunAt: null }])
  })

  it("reports a queued job without claiming execution has finished", async () => {
    vi.mocked(api).mockResolvedValueOnce({ job_id: "billing.expiry-sweep", jobId: "queue-1", name: "billing.expiry-sweep", state: "queued", ran_at: "2026-09-23T00:00:00Z" })
    expect(await systemApi.runJob("billing.expiry-sweep")).toMatchObject({ jobId: "billing.expiry-sweep", result: { state: "queued", queueJobId: "queue-1" } })
  })
  it("preserves nullable user fields and converts wire names", () => {
    expect(
      adaptUserRow({
        id: 42 as unknown as string,
        email: "admin@example.test",
        username: "admin.example",
        full_name: "",
        phone_number: null,
        role: "admin",
        status: "active",
        is_email_verified: true,
        last_login_at: null,
        created_at: "2026-09-23T00:00:00Z",
      }),
    ).toEqual({
      id: "42",
      username: "admin.example",
      email: "admin@example.test",
      fullName: null,
      phoneNumber: null,
      role: "admin",
      status: "active",
      isEmailVerified: true,
      lastLoginAt: null,
      createdAt: "2026-09-23T00:00:00Z",
    })
  })

  it("accepts either pagination metadata spelling", () => {
    expect(adaptPage({ data: [{ id: "1" }], total: 3, page: 2, pageSize: 1 }, (row) => row.id)).toEqual({
      items: ["1"],
      total: 3,
      page: 2,
      pageSize: 1,
      totalPages: 3,
    })
  })

  it("lists team leads but never offers team_lead as an assignable role", () => {
    expect(LISTABLE_ROLES).toContain("team_lead")
    expect(ASSIGNABLE_ROLES).not.toContain("team_lead")
  })

  it("reads the actor role, defaulting old rows by whether an admin acted", () => {
    const row = {
      id: "a-1",
      admin_user_id: "lead-1",
      admin_email: "lead@iqx.test",
      action: "group.member_remove",
      target_entity: "team_lead",
      target_id: "lead-1",
      payload_before: null,
      payload_after: null,
      note: "Rời nhóm",
      ip: null,
      user_agent: null,
      request_id: null,
      created_at: "2026-10-16T00:00:00Z",
    }
    expect(adaptAuditLogRow({ ...row, actor_role: "team_lead" }).actorRole).toBe("team_lead")
    expect(adaptAuditLogRow(row).actorRole).toBe("admin")
    expect(adaptAuditLogRow({ ...row, admin_user_id: null, admin_email: null }).actorRole).toBe("system")
  })

  it("adapts the v1.1 user 360 blocks and tolerates the team variant without VT money", () => {
    const user360 = adaptUser360({
      user: {
        id: "u-1",
        email: "minh@iqx.test",
        username: "minh.tran",
        full_name: "Trần Minh",
        phone_number: null,
        role: "premium",
        status: "active",
        is_email_verified: true,
        last_login_at: null,
        created_at: "2026-09-23T00:00:00Z",
      },
      subscription: null,
      subscription_history: [],
      payment_history: [],
      trial_used: false,
      login_history: [],
      group: {
        lead_user_id: "lead-1",
        lead_username: "lan.nguyen",
        lead_full_name: "",
        lead_status: "active",
        code: "lan.nguyen",
        join_via: "admin",
        joined_at: "2026-10-01T00:00:00Z",
      },
      referral_offer: null,
      demo_trading: { activated: true, account_id: "vt-1", status: "active", activated_at: null, pnl_pct: 12.5, last_activity_at: null },
      bot: { activated: false, account_id: null, status: null, activated_at: null, pnl_pct: null, last_activity_at: null, as_of: null },
    })
    expect(user360.vtAccount).toBeNull()
    expect(user360.vtRecentOrders).toEqual([])
    expect(user360.group).toMatchObject({ leadUsername: "lan.nguyen", leadFullName: null, joinVia: "admin" })
    expect(user360.demoTrading).toMatchObject({ activated: true, pnlPct: 12.5, asOf: null })
    expect(user360.bot).toMatchObject({ activated: false, pnlPct: null })
    expect(user360.academy).toBeNull()
  })
})
