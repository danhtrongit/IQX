import { render, screen, within } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { describe, expect, it } from "vitest"

import type { AcademyProgress } from "../api"
import { UserAcademyTab } from "./user-academy-tab"
import { UserReferralCard } from "./user-referral-card"
import { UserTradingInsights } from "./user-trading-insights"

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= ResizeObserverStub

function academy(overrides: Partial<AcademyProgress> = {}): AcademyProgress {
  return {
    started: true,
    allDone: false,
    completed: 2,
    total: 4,
    chapterExams: { passed: 0, total: 0 },
    currentLesson: { lessonId: "c1-l3", chapter: 1, order: 3, name: "Nến Nhật", label: "Chương 1 · Bài 3: Nến Nhật" },
    lastCompletion: {
      lessonId: "c1-l2",
      chapter: 1,
      order: 2,
      name: "Khối lượng",
      label: "Chương 1 · Bài 2: Khối lượng",
      completedAt: "2026-10-10T03:00:00Z",
      rewardCoins: 5,
    },
    learningCoins: 15,
    chapters: [
      {
        no: 1,
        title: "Nền tảng",
        completed: 2,
        total: 4,
        examPassed: false,
        lessons: [
          { lessonId: "c1-l1", order: 1, name: "Giá", kind: "lesson", optional: false, status: "completed", attempts: 0, latestScore: null, maxScore: null, completedAt: "2026-10-09T03:00:00Z", isCurrent: false },
          { lessonId: "c1-l2", order: 2, name: "Khối lượng", kind: "lesson", optional: false, status: "completed", attempts: 2, latestScore: 4, maxScore: 5, completedAt: "2026-10-10T03:00:00Z", isCurrent: false },
          { lessonId: "c1-l3", order: 3, name: "Nến Nhật", kind: "lesson", optional: false, status: "in_progress", attempts: 1, latestScore: null, maxScore: 5, completedAt: null, isCurrent: true },
          { lessonId: "c1-l4", order: 4, name: "Xu hướng", kind: "lesson", optional: false, status: "failed", attempts: 1, latestScore: 3, maxScore: 5, completedAt: null, isCurrent: false },
          { lessonId: "c1-exam", order: 5, name: "Bài thi Chương 1", kind: "chapter_exam", optional: false, status: "locked", attempts: 0, latestScore: null, maxScore: 20, completedAt: null, isCurrent: false },
          { lessonId: "c1-practice", order: 6, name: "Phòng tập thực chiến", kind: "practice", optional: true, status: "locked", attempts: 0, latestScore: null, maxScore: 5, completedAt: null, isCurrent: false },
        ],
      },
    ],
    ...overrides,
  }
}

describe("Học viện tab", () => {
  it("shows the summary tiles, the current lesson and per-lesson status, attempts and score", () => {
    render(<UserAcademyTab academy={academy()} />)
    expect(screen.getByText("2 / 4")).toBeTruthy()
    expect(screen.getByText("Chương 1 · Bài 3: Nến Nhật")).toBeTruthy()
    expect(screen.getByText(/Xu từ học tập: 15/)).toBeTruthy()
    // No chapter exams in the catalog: the exam tile is hidden.
    expect(screen.queryByText("Bài thi cuối chương đã đạt")).toBeNull()
    const quiz = screen.getByText("Khối lượng", { selector: "td" }).closest("tr") as HTMLElement
    expect(within(quiz).getByText("Hoàn thành")).toBeTruthy()
    expect(within(quiz).getByText("4/5")).toBeTruthy()
    const failed = screen.getByText("Xu hướng", { selector: "td" }).closest("tr") as HTMLElement
    expect(within(failed).getByText("Chưa đạt")).toBeTruthy()
    expect(within(failed).getByText("3/5")).toBeTruthy()
    const current = screen.getByText("Bài đang học", { selector: "span" }).closest("tr") as HTMLElement
    expect(within(current).getByText("Đang học")).toBeTruthy()
  })

  it("says Chưa bắt đầu or Đã hoàn thành các chương hiện có", () => {
    const { rerender } = render(<UserAcademyTab academy={academy({ started: false, completed: 0, currentLesson: null, lastCompletion: null })} />)
    expect(screen.getByText("Chưa bắt đầu")).toBeTruthy()
    rerender(<UserAcademyTab academy={academy({ allDone: true, completed: 4, currentLesson: null })} />)
    expect(screen.getByText("Đã hoàn thành các chương hiện có")).toBeTruthy()
  })

  it("shows the exam tile only when the catalog defines exams", () => {
    render(<UserAcademyTab academy={academy({ chapterExams: { passed: 1, total: 3 } })} />)
    expect(screen.getByText("Bài thi cuối chương đã đạt")).toBeTruthy()
    expect(screen.getByText("1/3")).toBeTruthy()
  })
})

describe("Demo Trading và Bot", () => {
  it("shows only percentages, coloured by direction, and Chưa kích hoạt otherwise", () => {
    render(
      <UserTradingInsights
        demoTrading={{ activated: true, accountId: "vt-1", status: "active", activatedAt: null, pnlPct: -3.25, lastActivityAt: "2026-10-12T03:00:00Z", asOf: null }}
        bot={{ activated: false, accountId: null, status: null, activatedAt: null, pnlPct: null, lastActivityAt: null, asOf: null }}
      />,
    )
    const demo = screen.getByText("Demo Trading").closest("tr") as HTMLElement
    const pnl = within(demo).getByText(/3,25%/)
    expect(pnl.className).toContain("text-price-down")
    expect(demo.textContent).not.toMatch(/₫/)
    const bot = screen.getByText("Bot").closest("tr") as HTMLElement
    expect(within(bot).getAllByText("Chưa kích hoạt").length).toBe(3)
  })
})

describe("Giới thiệu card", () => {
  it("shows how the user joined, the lead, the join date and a lifetime offer", () => {
    render(
      <MemoryRouter>
        <UserReferralCard
          group={{ leadUserId: "lead-1", leadUsername: "lan.nguyen", leadFullName: "Nguyễn Lan", leadStatus: "revoked", code: "lan.nguyen", joinVia: "code", joinedAt: "2026-10-01T00:00:00Z" }}
          referralOffer={{ grantId: "g-1", leadUserId: "lead-1", offerType: "lifetime", offerDays: null, status: "active", startsAt: "2026-10-01T00:00:00Z", endsAt: "9999-12-31T16:59:59Z", lifetime: true, active: true }}
          leadHref={(id) => `/admin/team-leads/${id}`}
        />
      </MemoryRouter>,
    )
    expect(screen.getByText("lan.nguyen", { selector: "span" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "Nguyễn Lan (lan.nguyen)" }).getAttribute("href")).toBe("/admin/team-leads/lead-1")
    expect(screen.getByText("Đã thôi")).toBeTruthy()
    expect(screen.getByText("Premium miễn phí trọn đời")).toBeTruthy()
    expect(screen.getByText(/Hạn: Trọn đời/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/9999/)
  })

  it("says the user is in no group", () => {
    render(<UserReferralCard group={null} referralOffer={null} />)
    expect(screen.getByText("Chưa thuộc nhóm nào")).toBeTruthy()
    expect(screen.getByText("Không có")).toBeTruthy()
  })
})
