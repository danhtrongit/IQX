import { describe, expect, it, vi } from "vitest"

import { adaptPage, adaptUserRow, systemApi } from "./api"
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
})
