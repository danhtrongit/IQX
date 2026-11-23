import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type {
  OfficeAssignmentsResponse,
  OfficeAttendanceToday,
  OfficeDocumentsResponse,
  OfficeLeaderboard,
  OfficeMe,
  OfficeMeetingsResponse,
  OfficeMemberDetail,
  OfficeMembersListResponse,
  OfficeMyTasksResponse,
  OfficeProgressListResponse,
  OfficeProposalsResponse,
  OfficeReviewResponse,
  OfficeStickyNotesResponse,
} from "./types.ts"
import { OFFICE_HUD_STORAGE_KEY } from "./utils.ts"

const { authState, openAuthMock, apiMocks, startOfficeMock, createSocketMock } =
  vi.hoisted(() => ({
    authState: {
      user: null as {
        id: string
        email: string
        username: string
        full_name: string | null
        role: string
      } | null,
      isAuthenticated: false,
      isLoading: false,
    },
    openAuthMock: vi.fn(),
    apiMocks: {
      me: vi.fn(),
      attendanceToday: vi.fn(),
      checkIn: vi.fn(),
      leaderboard: vi.fn(),
      listMyTasks: vi.fn(),
      submitTask: vi.fn(),
      listAssignments: vi.fn(),
      createAssignment: vi.fn(),
      updateAssignment: vi.fn(),
      deleteAssignment: vi.fn(),
      listReview: vi.fn(),
      approveTasks: vi.fn(),
      returnTask: vi.fn(),
      progress: vi.fn(),
      listMyProposals: vi.fn(),
      createProposal: vi.fn(),
      listTeamProposals: vi.fn(),
      markProposalSeen: vi.fn(),
      replyProposal: vi.fn(),
      listStickyNotes: vi.fn(),
      createStickyNote: vi.fn(),
      updateStickyNote: vi.fn(),
      deleteStickyNote: vi.fn(),
      listMembers: vi.fn(),
      getMemberProfile: vi.fn(),
      updateMemberProfile: vi.fn(),
      listMemberNotes: vi.fn(),
      createMemberNote: vi.fn(),
      deleteMemberNote: vi.fn(),
      listMeetings: vi.fn(),
      createMeeting: vi.fn(),
      updateMeeting: vi.fn(),
      deleteMeeting: vi.fn(),
      listDocuments: vi.fn(),
      uploadDocument: vi.fn(),
      deleteDocument: vi.fn(),
      downloadDocumentResponse: vi.fn(),
    },
    startOfficeMock: vi.fn(),
    createSocketMock: vi.fn(),
  }))

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    ...authState,
    openAuth: openAuthMock,
    setAuthOpen: vi.fn(),
    authOpen: false,
    authMode: "login",
    isPremium: false,
    premiumLoading: false,
    sessionError: null,
    sessionExpired: false,
    referralCode: null,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
  }),
}))

vi.mock("./api.ts", async () => {
  const actual = await vi.importActual<typeof import("./api.ts")>("./api.ts")
  return {
    ...actual,
    officeApi: apiMocks,
    triggerOfficeDocumentDownload: vi.fn(),
  }
})

vi.mock("./engine/start-office.ts", () => ({
  startOffice: startOfficeMock,
}))

vi.mock("./office-socket.ts", () => ({
  createOfficeSocket: createSocketMock,
}))

import { OfficePage } from "./office-page.tsx"

function makeStaffMe(): OfficeMe {
  return {
    member: true,
    role: "staff",
    serverTime: "2026-11-23T01:20:00.000Z",
    todayDate: "2026-11-23",
    periodMonth: "2026-11",
    isWorkday: true,
    isAttendanceLocked: false,
    cutoffs: { onTime: "08:30", lock: "12:00" },
    onlineCount: 4,
    onlineUserIds: ["u-staff-1", "u-boss"],
    team: {
      id: "team-1",
      name: "Nhóm Lê Huy",
      bossUserId: "u-boss",
      bossName: "Lê Huy",
      checkinOnTimeCutoff: "08:30",
      checkinLockCutoff: "12:00",
    },
    self: {
      id: "m-1",
      userId: "u-staff-1",
      role: "staff",
      displayName: "Lê Ngọc Hạnh",
      avatar: "female01",
      avatarColor: null,
      deskIndex: 0,
      accentColor: "#C2417D",
      online: true,
    },
    members: [
      {
        id: "m-boss",
        userId: "u-boss",
        role: "boss",
        displayName: "Lê Huy",
        avatar: "male04",
        avatarColor: null,
        deskIndex: null,
        accentColor: "#B7791F",
        online: true,
      },
      {
        id: "m-1",
        userId: "u-staff-1",
        role: "staff",
        displayName: "Lê Ngọc Hạnh",
        avatar: "female01",
        avatarColor: null,
        deskIndex: 0,
        accentColor: "#C2417D",
        online: true,
      },
      {
        id: "m-2",
        userId: "u-staff-2",
        role: "staff",
        displayName: "Nguyễn Văn An",
        avatar: "male01",
        avatarColor: null,
        deskIndex: 1,
        accentColor: "#1D6FE8",
        online: false,
      },
    ],
    hud: {
      kind: "staff",
      todayDoneCount: 1,
      todayTotalCount: 3,
      pendingCount: 1,
      returnedCount: 1,
      monthlyPoints: 180,
      myAttendanceStatus: "absent",
      myCheckedInAt: null,
    },
  }
}

function makeBossMe(): OfficeMe {
  return {
    ...makeStaffMe(),
    role: "boss",
    self: {
      id: "m-boss",
      userId: "u-boss",
      role: "boss",
      displayName: "Lê Huy",
      avatar: "male04",
      avatarColor: null,
      deskIndex: null,
      accentColor: "#B7791F",
      online: true,
    },
    hud: {
      kind: "boss",
      pendingCount: 2,
      newProposalsCount: 1,
      todayDoneCount: 5,
      todayTotalCount: 12,
      staffCount: 2,
      latestStaffName: "Nguyễn Văn An",
    },
  }
}

function makeAttendance(checked = false): OfficeAttendanceToday {
  return {
    workDate: "2026-11-23",
    isWorkday: true,
    isLocked: false,
    cutoffs: { onTime: "08:30", lock: "12:00" },
    showDotsForAll: false,
    myStatus: checked ? "ok" : "absent",
    myCheckedInAt: checked ? "2026-11-23T01:15:00.000Z" : null,
    counts: { ok: checked ? 2 : 1, late: 0, absent: checked ? 0 : 1, total: 2 },
    roster: {
      ok: [
        {
          userId: "u-staff-2",
          displayName: "Nguyễn Văn An",
          accentColor: "#1D6FE8",
          status: "ok",
          checkedInAt: "2026-11-23T01:10:00.000Z",
          timeLabel: "08:10",
          isSelf: false,
        },
        ...(checked
          ? [
              {
                userId: "u-staff-1",
                displayName: "Lê Ngọc Hạnh",
                accentColor: "#C2417D",
                status: "ok" as const,
                checkedInAt: "2026-11-23T01:15:00.000Z",
                timeLabel: "08:15",
                isSelf: true,
              },
            ]
          : []),
      ],
      late: [],
      absent: checked
        ? []
        : [
            {
              userId: "u-staff-1",
              displayName: "Lê Ngọc Hạnh",
              accentColor: "#C2417D",
              status: "absent",
              checkedInAt: null,
              timeLabel: null,
              isSelf: true,
            },
          ],
    },
  }
}

function makeMyTasks(): OfficeMyTasksResponse {
  return {
    periodMonth: "2026-11",
    todayDate: "2026-11-23",
    monthlyPoints: 180,
    day: [
      {
        id: "t-day-1",
        assignmentId: "a-1",
        userId: "u-staff-1",
        kind: "day",
        title: "Cập nhật báo cáo sáng",
        points: 10,
        pointsSnapshot: null,
        status: "todo",
        repeatDaily: true,
        dueDate: null,
        overdue: false,
        periodMonth: "2026-11",
        taskDate: "2026-11-23",
        submitNote: null,
        submittedAt: null,
        returnReason: null,
        returnedAt: null,
        approvedAt: null,
        createdAt: "2026-11-23T00:00:00.000Z",
      },
    ],
    month: [
      {
        id: "t-month-1",
        assignmentId: "a-2",
        userId: "u-staff-1",
        kind: "month",
        title: "Hoàn thiện hồ sơ khách VIP",
        points: 40,
        pointsSnapshot: null,
        status: "returned",
        repeatDaily: false,
        dueDate: "2026-11-30",
        overdue: false,
        periodMonth: "2026-11",
        taskDate: "2026-11-01",
        submitNote: "Đã gửi bản nháp lần 1",
        submittedAt: "2026-11-22T02:00:00.000Z",
        returnReason: "Bổ sung số liệu quý 3",
        returnedAt: "2026-11-22T04:00:00.000Z",
        approvedAt: null,
        createdAt: "2026-11-01T00:00:00.000Z",
      },
    ],
    kpi: [
      {
        id: "t-kpi-1",
        assignmentId: "a-3",
        userId: "u-staff-1",
        kind: "kpi",
        title: "Đạt 15 khách hàng mở mới",
        points: 100,
        pointsSnapshot: null,
        status: "todo",
        repeatDaily: false,
        dueDate: "2026-11-30",
        overdue: false,
        periodMonth: "2026-11",
        taskDate: "2026-11-01",
        submitNote: null,
        submittedAt: null,
        returnReason: null,
        returnedAt: null,
        approvedAt: null,
        createdAt: "2026-11-01T00:00:00.000Z",
      },
    ],
  }
}

function makeMeetings(): OfficeMeetingsResponse {
  return {
    todayDate: "2026-11-23",
    nextWallMeeting: {
      id: "meet-1",
      title: "Họp nhóm tuần",
      startsAt: "2026-11-23T02:00:00.000Z",
      durationMinutes: 60,
      platform: "Google Meet",
      meetingUrl: "https://meet.google.com/abc-defg-hij",
      agenda: ["Điểm lại KPI tháng 11", "Kế hoạch thị trường tuần mới"],
      recurrenceWeekly: true,
      createdAt: "2026-11-20T01:00:00.000Z",
      updatedAt: "2026-11-20T01:00:00.000Z",
    },
    today: [
      {
        id: "meet-1",
        title: "Họp nhóm tuần",
        startsAt: "2026-11-23T02:00:00.000Z",
        durationMinutes: 60,
        platform: "Google Meet",
        meetingUrl: "https://meet.google.com/abc-defg-hij",
        agenda: ["Điểm lại KPI tháng 11", "Kế hoạch thị trường tuần mới"],
        recurrenceWeekly: true,
        createdAt: "2026-11-20T01:00:00.000Z",
        updatedAt: "2026-11-20T01:00:00.000Z",
      },
    ],
    upcoming: [],
  }
}

function makeDocuments(): OfficeDocumentsResponse {
  return {
    maxSizeBytes: 20 * 1024 * 1024,
    allowedExts: ["pdf", "docx", "xlsx", "pptx", "png", "jpg"],
    items: [
      {
        id: "doc-1",
        title: "Sổ tay tư vấn SACO",
        fileName: "so-tay-saco.pdf",
        fileExt: "pdf",
        mimeType: "application/pdf",
        sizeBytes: 1_572_864,
        downloadUrl: "/api/v2/office/documents/doc-1/download?token=abc",
        createdAt: "2026-11-20T03:00:00.000Z",
      },
    ],
  }
}

function makeLeaderboard(
  overrides: Partial<OfficeLeaderboard> = {}
): OfficeLeaderboard {
  return {
    periodMonth: "2026-11",
    monthNumber: 11,
    nextResetDate: "2026-12-01",
    nextResetLabel: "01/12",
    teamName: "Nhóm Lê Huy",
    bossName: "Lê Huy",
    totalRanked: 2,
    top3: [
      {
        rank: 1,
        userId: "u-staff-1",
        displayName: "Lê Ngọc Hạnh",
        accentColor: "#C2417D",
        points: 180,
        reachedAt: "2026-11-22T08:00:00.000Z",
      },
      {
        rank: 2,
        userId: "u-staff-2",
        displayName: "Nguyễn Văn An",
        accentColor: "#1D6FE8",
        points: 140,
        reachedAt: "2026-11-22T09:00:00.000Z",
      },
    ],
    myRank: { rank: 1, points: 180 },
    ...overrides,
  }
}

function renderOffice(initialUrl = "/van-phong") {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <Routes>
          <Route path="/van-phong" element={<OfficePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  window.localStorage.removeItem(OFFICE_HUD_STORAGE_KEY)
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }))

  openAuthMock.mockReset()
  for (const fn of Object.values(apiMocks)) {
    fn.mockReset()
  }

  startOfficeMock.mockReturnValue({
    setZoomDelta: vi.fn(),
    updateTeam: vi.fn(),
    updateOnlinePeers: vi.fn(),
    updateAttendance: vi.fn(),
    updateMeeting: vi.fn(),
    updateStandee: vi.fn(),
    setModalOpen: vi.fn(),
    resendSelfState: vi.fn(),
    dispose: vi.fn(),
  })

  createSocketMock.mockReturnValue({
    start: vi.fn(),
    stop: vi.fn(),
    sendState: vi.fn(),
    getStatus: () => "online",
    getPeers: () => [],
    getOnlineCount: () => 4,
  })

  apiMocks.attendanceToday.mockResolvedValue(makeAttendance(false))
  apiMocks.listMeetings.mockResolvedValue(makeMeetings())
  apiMocks.listDocuments.mockResolvedValue(makeDocuments())
  apiMocks.leaderboard.mockResolvedValue(makeLeaderboard())
})

afterEach(() => {
  cleanup()
})

describe("OfficePage — gates, Staff workflows, Boss workflows, shared modals & URL sync", () => {
  it("shows guest login prompt and invokes openAuth('login')", async () => {
    const user = userEvent.setup()
    authState.user = null
    authState.isAuthenticated = false
    authState.isLoading = false

    renderOffice()

    expect(screen.getByText("Đăng nhập để vào Văn phòng")).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }))
    expect(openAuthMock).toHaveBeenCalledWith("login")
  })

  it("shows exact Spec §2 message when authenticated user does not belong to any team", async () => {
    authState.user = {
      id: "u-outsider",
      email: "outsider@iqx.vn",
      username: "outsider",
      full_name: "Người ngoài nhóm",
      role: "user",
    }
    authState.isAuthenticated = true
    authState.isLoading = false
    apiMocks.me.mockResolvedValue({
      member: false,
      role: "none",
      serverTime: "2026-11-23T01:20:00.000Z",
      todayDate: "2026-11-23",
      periodMonth: "2026-11",
      isWorkday: true,
      isAttendanceLocked: false,
      cutoffs: { onTime: "08:30", lock: "12:00" },
      onlineCount: 0,
      onlineUserIds: [],
      team: null,
      self: null,
      members: [],
      hud: null,
    } satisfies OfficeMe)

    renderOffice()

    expect(
      await screen.findByText(
        "Bạn chưa thuộc nhóm nào. Liên hệ trưởng nhóm để được thêm vào văn phòng."
      )
    ).toBeTruthy()
  })

  it("renders Staff HUD without check-in button in ĐIỂM DANH, supports attendance filters, check-in, task submit, proposal, and pastel sticky notes", async () => {
    const user = userEvent.setup()
    authState.user = {
      id: "u-staff-1",
      email: "hanh@iqx.vn",
      username: "hanh",
      full_name: "Lê Ngọc Hạnh",
      role: "user",
    }
    authState.isAuthenticated = true
    authState.isLoading = false

    apiMocks.me.mockResolvedValue(makeStaffMe())
    apiMocks.listMyTasks.mockResolvedValue(makeMyTasks())
    const myProposals: OfficeProposalsResponse = {
      items: [],
      unreadCount: 0,
    }
    apiMocks.listMyProposals.mockResolvedValue(myProposals)
    const stickyNotes: OfficeStickyNotesResponse = {
      maxNotes: 50,
      items: [
        {
          id: "n-1",
          color: "y",
          content: "Gọi anh Minh 10h",
          createdAt: "2026-11-23T01:00:00.000Z",
          updatedAt: "2026-11-23T01:00:00.000Z",
        },
      ],
    }
    apiMocks.listStickyNotes.mockResolvedValue(stickyNotes)
    apiMocks.checkIn.mockResolvedValue({
      status: "ok",
      checkedInAt: "2026-11-23T01:25:00.000Z",
      timeLabel: "08:25",
      workDate: "2026-11-23",
    })
    apiMocks.submitTask.mockResolvedValue({
      ...makeMyTasks().day[0],
      status: "pending",
      submitNote: "Đã hoàn tất báo cáo",
    })
    apiMocks.createProposal.mockResolvedValue({
      id: "p-new",
      userId: "u-staff-1",
      staffName: "Lê Ngọc Hạnh",
      staffAccentColor: "#C2417D",
      content: "Đề xuất thêm tài liệu hướng dẫn",
      status: "sent",
      seenAt: null,
      reply: null,
      repliedAt: null,
      createdAt: "2026-11-23T02:00:00.000Z",
    })
    apiMocks.createStickyNote.mockResolvedValue({
      id: "n-2",
      color: "p",
      content: "",
      createdAt: "2026-11-23T02:01:00.000Z",
      updatedAt: "2026-11-23T02:01:00.000Z",
    })
    apiMocks.updateStickyNote.mockResolvedValue({
      id: "n-1",
      color: "y",
      content: "Gọi anh Minh 10h sáng nay",
      createdAt: "2026-11-23T01:00:00.000Z",
      updatedAt: "2026-11-23T02:02:00.000Z",
    })
    apiMocks.deleteStickyNote.mockResolvedValue({ ok: true })

    renderOffice()

    // Wait for Staff HUD cards
    const mineCard = await screen.findByTestId("office-hud-card-mine")
    const attCard = screen.getByTestId("office-hud-card-att")
    expect(within(mineCard).getByText("NHIỆM VỤ CỦA TÔI")).toBeTruthy()
    expect(within(mineCard).getByText("1 cần làm lại")).toBeTruthy()

    // STRICT: NO check-in button inside ĐIỂM DANH card!
    expect(within(attCard).queryByTestId("office-checkin-btn")).toBeNull()
    expect(
      within(attCard).queryByRole("button", { name: /^Điểm danh ·/ })
    ).toBeNull()

    // Attendance filter tiles with aria-pressed toggle inline roster
    const absentTile = within(attCard).getByRole("button", { name: /Vắng/ })
    expect(absentTile.getAttribute("aria-pressed")).toBe("false")
    await user.click(absentTile)
    expect(absentTile.getAttribute("aria-pressed")).toBe("true")
    const roster = within(attCard).getByTestId("office-attendance-roster")
    expect(within(roster).getByText("Vắng · 1 người")).toBeTruthy()
    expect(within(roster).getByText(/Lê Ngọc Hạnh/)).toBeTruthy()
    expect(within(roster).getByText("(bạn)")).toBeTruthy()

    // Empty late bucket shows exact Spec copy "Không có ai."
    await user.click(within(attCard).getByRole("button", { name: /Trễ/ }))
    expect(within(roster).getByText("Trễ · 0 người")).toBeTruthy()
    expect(within(roster).getByText("Không có ai.")).toBeTruthy()

    // Attendance rule matches Spec §9.2
    expect(attCard.textContent).toContain(
      "Đúng giờ: điểm danh trước 08:30 · Trễ: 08:30–12:00 · Không điểm danh tính vắng · Thứ Hai – Thứ Sáu"
    )

    // Open NHIỆM VỤ CỦA TÔI via exact-copy nudge bar
    await user.click(
      within(attCard).getByRole("button", {
        name: "Bạn chưa điểm danh hôm nay · mở Nhiệm vụ của tôi ›",
      })
    )
    const modal = await screen.findByTestId("office-modal-mine")

    // Check-in inside NHIỆM VỤ CỦA TÔI header
    const checkInBtn = within(modal).getByTestId("office-checkin-btn")
    await user.click(checkInBtn)
    await waitFor(() => expect(apiMocks.checkIn).toHaveBeenCalledOnce())
    expect(screen.getByTestId("office-toast").textContent).toContain(
      "Đã điểm danh 08:25 · Đúng giờ"
    )

    // Verify Spec copy on returned reason, sticky notes subtitle, placeholders
    expect(modal.textContent).toContain("Sếp: Bổ sung số liệu quý 3")
    expect(modal.textContent).toContain("chỉ mình bạn thấy")
    expect(
      (within(modal).getByLabelText("Nội dung đề xuất") as HTMLTextAreaElement)
        .placeholder
    ).toBe("Viết đề xuất cho sếp: xin nghỉ, ý tưởng, góp ý…")

    // Submit daily task with note
    const dayTask = within(modal).getByTestId("office-task-t-day-1")
    await user.click(within(dayTask).getByRole("button", { name: "Hoàn thành" }))
    const submitArea = within(dayTask).getByLabelText(
      "Ghi chú hoàn thành cho Cập nhật báo cáo sáng"
    ) as HTMLTextAreaElement
    expect(submitArea.placeholder).toBe("Ghi chú cho sếp (không bắt buộc)")
    await user.type(submitArea, "Đã hoàn tất báo cáo")
    await user.click(
      within(dayTask).getByRole("button", { name: "Gửi sếp xác nhận" })
    )
    await waitFor(() =>
      expect(apiMocks.submitTask).toHaveBeenCalledWith(
        "t-day-1",
        "Đã hoàn tất báo cáo"
      )
    )

    // Send proposal
    await user.type(
      within(modal).getByLabelText("Nội dung đề xuất"),
      "Đề xuất thêm tài liệu hướng dẫn"
    )
    await user.click(within(modal).getByRole("button", { name: "Gửi đề xuất" }))
    await waitFor(() =>
      expect(apiMocks.createProposal).toHaveBeenCalledWith(
        "Đề xuất thêm tài liệu hướng dẫn"
      )
    )

    // Sticky notes: 1-click create pink note, verify dd/mm footer, edit existing note (flush on blur), delete note
    await user.click(within(modal).getByRole("button", { name: "Hồng nhạt" }))
    await waitFor(() =>
      expect(apiMocks.createStickyNote).toHaveBeenCalledWith({
        color: "p",
        content: "",
      })
    )

    const noteCard = within(modal).getByTestId("office-sticky-note-n-1")
    expect(within(noteCard).getByText("23/11")).toBeTruthy()
    const noteArea = within(noteCard).getByLabelText("Nội dung ghi chú")
    await user.type(noteArea, " sáng nay")
    fireEvent.blur(noteArea)
    await waitFor(() =>
      expect(apiMocks.updateStickyNote).toHaveBeenCalledWith("n-1", {
        content: "Gọi anh Minh 10h sáng nay",
      })
    )

    await user.click(within(noteCard).getByRole("button", { name: "Xoá ghi chú" }))
    await waitFor(() =>
      expect(apiMocks.deleteStickyNote).toHaveBeenCalledWith("n-1")
    )
  })

  it("renders Boss HUD & QUẢN LÝ + HỒ SƠ NHÂN VIÊN full workflow (assign/edit/delete, bulk approve, mandatory return reason, proposal reply, diacritic-insensitive search & boss note)", async () => {
    const user = userEvent.setup()
    authState.user = {
      id: "u-boss",
      email: "huy@iqx.vn",
      username: "lehuy",
      full_name: "Lê Huy",
      role: "team_lead",
    }
    authState.isAuthenticated = true
    authState.isLoading = false

    apiMocks.me.mockResolvedValue(makeBossMe())
    const assignmentsRes: OfficeAssignmentsResponse = {
      items: [
        {
          id: "asg-1",
          kind: "day",
          title: "Kiểm tra danh mục khách",
          points: 10,
          repeatDaily: true,
          dueDate: null,
          periodMonth: "2026-11",
          isAllTeam: true,
          targetCount: 2,
          activeCount: 1,
          doneCount: 1,
          targetUserIds: ["u-staff-1", "u-staff-2"],
          createdAt: "2026-11-20T01:00:00.000Z",
        },
      ],
    }
    apiMocks.listAssignments.mockResolvedValue(assignmentsRes)
    const reviewRes: OfficeReviewResponse = {
      items: [
        {
          id: "rev-1",
          assignmentId: "asg-1",
          userId: "u-staff-1",
          staffName: "Lê Ngọc Hạnh",
          staffAccentColor: "#C2417D",
          kind: "day",
          title: "Kiểm tra danh mục khách",
          points: 10,
          taskDate: "2026-11-23",
          dueDate: null,
          submitNote: "Đã rà soát xong 12 tài khoản",
          submittedAt: "2026-11-23T01:30:00.000Z",
        },
        {
          id: "rev-2",
          assignmentId: "asg-2",
          userId: "u-staff-2",
          staffName: "Nguyễn Văn An",
          staffAccentColor: "#1D6FE8",
          kind: "month",
          title: "Lập báo cáo tuần",
          points: 40,
          taskDate: "2026-11-23",
          dueDate: "2026-11-30",
          submitNote: null,
          submittedAt: "2026-11-23T02:10:00.000Z",
        },
      ],
    }
    apiMocks.listReview.mockResolvedValue(reviewRes)
    const teamProposalsRes: OfficeProposalsResponse = {
      unreadCount: 1,
      items: [
        {
          id: "prop-1",
          userId: "u-staff-1",
          staffName: "Lê Ngọc Hạnh",
          staffAccentColor: "#C2417D",
          content: "Đề xuất họp ngắn 15 phút đầu tuần",
          status: "sent",
          seenAt: null,
          reply: null,
          repliedAt: null,
          createdAt: "2026-11-23T01:45:00.000Z",
        },
      ],
    }
    apiMocks.listTeamProposals.mockResolvedValue(teamProposalsRes)
    const progressRes: OfficeProgressListResponse = {
      periodMonth: "2026-11",
      todayDate: "2026-11-23",
      items: [
        {
          userId: "u-staff-1",
          displayName: "Lê Ngọc Hạnh",
          accentColor: "#C2417D",
          dayDone: 2,
          dayTotal: 3,
          monthDone: 1,
          monthTotal: 2,
          kpiDone: 0,
          kpiTotal: 1,
          pendingCount: 1,
          points: 180,
        },
        {
          userId: "u-staff-2",
          displayName: "Nguyễn Văn An",
          accentColor: "#1D6FE8",
          dayDone: 1,
          dayTotal: 3,
          monthDone: 0,
          monthTotal: 2,
          kpiDone: 0,
          kpiTotal: 1,
          pendingCount: 1,
          points: 120,
        },
      ],
    }
    apiMocks.progress.mockResolvedValue(progressRes)
    apiMocks.createAssignment.mockResolvedValue(assignmentsRes.items[0])
    apiMocks.updateAssignment.mockResolvedValue(assignmentsRes.items[0])
    apiMocks.deleteAssignment.mockResolvedValue({
      ok: true,
      deletedTaskCount: 1,
      retainedDoneCount: 1,
    })
    apiMocks.approveTasks.mockResolvedValue({
      approved: [
        {
          taskId: "rev-1",
          userId: "u-staff-1",
          staffName: "Lê Ngọc Hạnh",
          title: "Kiểm tra danh mục khách",
          points: 10,
          totalMonthlyPoints: 190,
        },
        {
          taskId: "rev-2",
          userId: "u-staff-2",
          staffName: "Nguyễn Văn An",
          title: "Lập báo cáo tuần",
          points: 40,
          totalMonthlyPoints: 160,
        },
      ],
    })
    apiMocks.returnTask.mockResolvedValue(makeMyTasks().month[0])
    apiMocks.markProposalSeen.mockResolvedValue({
      ...teamProposalsRes.items[0],
      status: "seen",
    })
    apiMocks.replyProposal.mockResolvedValue({
      ...teamProposalsRes.items[0],
      status: "replied",
      reply: "Đồng ý, áp dụng từ thứ Hai tới.",
    })

    const membersRes: OfficeMembersListResponse = {
      todayDate: "2026-11-23",
      items: [
        {
          userId: "u-staff-1",
          displayName: "Lê Ngọc Hạnh",
          accentColor: "#C2417D",
          joinDate: "2024-05-10",
          tenure: { years: 2, months: 6, days: 13, label: "2 năm 6 tháng 13 ngày" },
        },
        {
          userId: "u-staff-2",
          displayName: "Nguyễn Văn An",
          accentColor: "#1D6FE8",
          joinDate: "2026-01-15",
          tenure: { years: 0, months: 10, days: 8, label: "10 tháng 8 ngày" },
        },
      ],
    }
    apiMocks.listMembers.mockResolvedValue(membersRes)
    const detailRes: OfficeMemberDetail = {
      userId: "u-staff-1",
      displayName: "Lê Ngọc Hạnh",
      email: "hanh@iqx.vn",
      bossName: "Lê Huy",
      accentColor: "#C2417D",
      joinDate: "2024-05-10",
      todayDate: "2026-11-23",
      tenure: { years: 2, months: 6, days: 13, label: "2 năm 6 tháng 13 ngày" },
      stats: {
        monthlyPoints: 180,
        tasksDone: 8,
        tasksTotal: 10,
        pendingCount: 1,
        attendanceOk: 15,
        attendanceLate: 1,
        attendanceAbsent: 0,
      },
      notes: [],
    }
    apiMocks.getMemberProfile.mockResolvedValue(detailRes)
    apiMocks.createMemberNote.mockResolvedValue({
      id: "bn-1",
      content: "Tư vấn rất tận tâm",
      createdAt: "2026-11-23T03:00:00.000Z",
    })

    renderOffice()

    const mgrCard = await screen.findByTestId("office-hud-card-mgr")
    expect(within(mgrCard).getByText("QUẢN LÝ")).toBeTruthy()
    expect(within(mgrCard).getByText("3")).toBeTruthy() // 2 pending + 1 proposal
    expect(screen.getByTestId("office-hud-card-prof")).toBeTruthy()

    // Open QUẢN LÝ modal
    await user.click(within(mgrCard).getByRole("button", { name: /Mở bảng Quản lý/ }))
    const mgrModal = await screen.findByTestId("office-modal-mgr")

    // Type title, switch kind to Tháng -> title must be preserved & default points become 40!
    const titleInput = within(mgrModal).getByLabelText(/^Tiêu đề/)
    await user.type(titleInput, "Tổng hợp báo cáo tháng")
    await user.click(within(mgrModal).getByRole("button", { name: "Tháng" }))
    expect((titleInput as HTMLInputElement).value).toBe("Tổng hợp báo cáo tháng")
    expect(
      (within(mgrModal).getByLabelText("Điểm thưởng (1–1000)") as HTMLInputElement)
        .value
    ).toBe("40")

    await user.click(
      within(mgrModal).getByRole("button", { name: "Giao nhiệm vụ" })
    )
    await waitFor(() =>
      expect(apiMocks.createAssignment).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "month",
          title: "Tổng hợp báo cáo tháng",
          points: 40,
          userIds: ["u-staff-1", "u-staff-2"],
        })
      )
    )
    expect(screen.getByTestId("office-toast").textContent).toBe(
      'Đã giao "Tổng hợp báo cáo tháng" cho 2 người'
    )

    // Switch to "Đã giao" -> edit & delete with inline confirm
    await user.click(within(mgrModal).getByRole("tab", { name: /Đã giao/ }))
    const asgRow = within(mgrModal).getByTestId("office-assignment-asg-1")
    await user.click(within(asgRow).getByRole("button", { name: "Sửa" }))
    expect(
      within(asgRow).getByText(
        "Đổi điểm chỉ áp dụng cho người chưa hoàn thành. Người đã được duyệt giữ điểm cũ."
      )
    ).toBeTruthy()
    await user.click(within(asgRow).getByRole("button", { name: "Lưu thay đổi" }))
    await waitFor(() =>
      expect(apiMocks.updateAssignment).toHaveBeenCalledWith(
        "asg-1",
        expect.objectContaining({ title: "Kiểm tra danh mục khách", points: 10 })
      )
    )

    await user.click(within(asgRow).getByRole("button", { name: "Xoá" }))
    expect(
      within(asgRow).getByText(
        "Xoá nhiệm vụ này khỏi 1 người chưa hoàn thành? Người đã được duyệt vẫn giữ điểm."
      )
    ).toBeTruthy()
    await user.click(within(asgRow).getByRole("button", { name: "Xác nhận xoá" }))
    await waitFor(() =>
      expect(apiMocks.deleteAssignment).toHaveBeenCalledWith("asg-1")
    )

    // Return pending item: empty reason blocked with exact Spec copy, then valid reason succeeds
    const rev1 = within(mgrModal).getByTestId("office-review-rev-1")
    expect(
      within(rev1).getByText("Duyệt trong hôm nay, qua 0:00 không tính điểm")
    ).toBeTruthy()
    await user.click(within(rev1).getByRole("button", { name: "Trả lại" }))
    const reasonArea = within(rev1).getByLabelText(
      "Lý do trả lại cho Kiểm tra danh mục khách"
    ) as HTMLTextAreaElement
    expect(reasonArea.placeholder).toBe("Lý do trả lại (nhân viên sẽ thấy)")
    await user.click(
      within(rev1).getByRole("button", { name: "Xác nhận trả lại" })
    )
    expect(within(rev1).getByRole("alert").textContent).toBe(
      "Ghi lý do trả lại"
    )
    await user.type(reasonArea, "Thiếu ghi chú 2 tài khoản cuối")
    await user.click(
      within(rev1).getByRole("button", { name: "Xác nhận trả lại" })
    )
    await waitFor(() =>
      expect(apiMocks.returnTask).toHaveBeenCalledWith(
        "rev-1",
        "Thiếu ghi chú 2 tài khoản cuối"
      )
    )

    // Bulk approve all pending tasks -> "Đã duyệt 2 mục"
    await user.click(within(mgrModal).getByLabelText("Chọn tất cả"))
    await user.click(within(mgrModal).getByRole("button", { name: "Duyệt 2 mục" }))
    await waitFor(() =>
      expect(apiMocks.approveTasks).toHaveBeenCalledWith(["rev-1", "rev-2"])
    )
    expect(screen.getByTestId("office-toast").textContent).toBe(
      "Đã duyệt 2 mục"
    )

    // Progress subtitle matches Spec §7
    expect(mgrModal.textContent).toContain("bấm tên để mở hồ sơ")

    // Reply to team proposal
    const propRow = within(mgrModal).getByTestId("office-team-proposal-prop-1")
    await user.click(within(propRow).getByRole("button", { name: "Trả lời" }))
    await waitFor(() =>
      expect(apiMocks.markProposalSeen).toHaveBeenCalledWith("prop-1")
    )
    await user.type(
      within(propRow).getByLabelText("Trả lời đề xuất của Lê Ngọc Hạnh"),
      "Đồng ý, áp dụng từ thứ Hai tới."
    )
    await user.click(within(propRow).getByRole("button", { name: "Gửi trả lời" }))
    await waitFor(() =>
      expect(apiMocks.replyProposal).toHaveBeenCalledWith(
        "prop-1",
        "Đồng ý, áp dụng từ thứ Hai tới."
      )
    )

    // Click staff row in TIẾN ĐỘ NHÂN VIÊN -> opens HỒ SƠ NHÂN VIÊN
    await user.click(within(mgrModal).getByText("Lê Ngọc Hạnh", { selector: "span" }))
    const profModal = await screen.findByTestId("office-modal-prof")

    // Diacritic-insensitive search: "hanh" matches "Lê Ngọc Hạnh" and filters out "Nguyễn Văn An"
    const searchInput = within(profModal).getByLabelText("Tìm nhân viên")
    await user.type(searchInput, "hanh")
    expect(
      within(profModal).getByRole("button", { name: /Lê Ngọc Hạnh/ })
    ).toBeTruthy()
    expect(
      within(profModal).queryByRole("button", { name: /Nguyễn Văn An/ })
    ).toBeNull()

    // Add private boss note
    await user.type(
      within(profModal).getByLabelText("Ghi chú của sếp"),
      "Tư vấn rất tận tâm"
    )
    await user.click(within(profModal).getByRole("button", { name: "Lưu ghi chú" }))
    await waitFor(() =>
      expect(apiMocks.createMemberNote).toHaveBeenCalledWith(
        "u-staff-1",
        "Tư vấn rất tận tâm"
      )
    )
  })

  it("supports PHÒNG HỌP creation, PHÒNG TÀI LIỆU 20MB upload validation, and THÀNH TÍCH THÁNG empty state & Dec->Jan reset", async () => {
    const user = userEvent.setup()
    authState.user = {
      id: "u-boss",
      email: "huy@iqx.vn",
      username: "lehuy",
      full_name: "Lê Huy",
      role: "team_lead",
    }
    authState.isAuthenticated = true
    authState.isLoading = false
    apiMocks.me.mockResolvedValue({ ...makeBossMe(), periodMonth: "2026-12" })
    apiMocks.createMeeting.mockResolvedValue(makeMeetings().today[0])

    // 1. PHÒNG HỌP (?modal=meet)
    const { unmount } = renderOffice("/van-phong?modal=meet")
    const meetModal = await screen.findByTestId("office-modal-meet")
    expect(await within(meetModal).findByText("Họp nhóm tuần")).toBeTruthy()
    await user.click(
      within(meetModal).getByRole("button", { name: /Tạo lịch họp/ })
    )
    await user.type(within(meetModal).getByLabelText(/^Tiêu đề/), "Họp chiến lược Q1")
    await user.type(
      within(meetModal).getByLabelText("Đường dẫn phòng họp"),
      "https://meet.google.com/new-room-url"
    )
    await user.click(
      within(meetModal)
        .getAllByRole("button", { name: "Tạo lịch họp" })
        .at(-1)!
    )
    await waitFor(() =>
      expect(apiMocks.createMeeting).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Họp chiến lược Q1",
          meetingUrl: "https://meet.google.com/new-room-url",
        })
      )
    )
    unmount()

    // 2. PHÒNG TÀI LIỆU (?modal=docs) — enforce > 20 MB limit client-side
    const docsView = renderOffice("/van-phong?modal=docs")
    const docsModal = await screen.findByTestId("office-modal-docs")
    expect(await within(docsModal).findByText("Sổ tay tư vấn SACO")).toBeTruthy()
    const oversizedFile = new File(["x"], "huge.pdf", {
      type: "application/pdf",
    })
    Object.defineProperty(oversizedFile, "size", {
      value: 21 * 1024 * 1024,
    })
    const fileInput = within(docsModal).getByLabelText(/Chọn tệp/)
    fireEvent.change(fileInput, { target: { files: [oversizedFile] } })
    expect(within(docsModal).getByRole("alert").textContent).toContain("20 MB")
    expect(apiMocks.uploadDocument).not.toHaveBeenCalled()
    docsView.unmount()

    // 3. THÀNH TÍCH THÁNG (?modal=stand) — empty state + Dec -> Jan 01/01 reset
    apiMocks.leaderboard.mockResolvedValue(
      makeLeaderboard({
        periodMonth: "2026-12",
        monthNumber: 12,
        nextResetDate: "2027-01-01",
        nextResetLabel: "01/01",
        top3: [],
        myRank: null,
      })
    )
    renderOffice("/van-phong?modal=stand")
    const standModal = await screen.findByTestId("office-modal-stand")
    expect(within(standModal).getByText("THÀNH TÍCH THÁNG 12")).toBeTruthy()
    expect(within(standModal).getByText("reset ngày 01/01")).toBeTruthy()
    expect(
      await within(standModal).findByText("Chưa có ai ghi điểm tháng này")
    ).toBeTruthy()
  })

  it("auto-opens modal from notification bell URL (?modal=mine / ?modal=mgr) and blocks Staff from opening Boss modal (?modal=mgr)", async () => {
    authState.user = {
      id: "u-staff-1",
      email: "hanh@iqx.vn",
      username: "hanh",
      full_name: "Lê Ngọc Hạnh",
      role: "user",
    }
    authState.isAuthenticated = true
    authState.isLoading = false
    apiMocks.me.mockResolvedValue(makeStaffMe())
    apiMocks.listMyTasks.mockResolvedValue(makeMyTasks())
    apiMocks.listMyProposals.mockResolvedValue({ items: [], unreadCount: 0 })
    apiMocks.listStickyNotes.mockResolvedValue({ items: [], maxNotes: 50 })

    // Staff arriving with ?modal=mine opens NHIỆM VỤ CỦA TÔI automatically
    const staffView = renderOffice("/van-phong?modal=mine")
    expect(await screen.findByTestId("office-modal-mine")).toBeTruthy()
    staffView.unmount()

    // Staff attempting ?modal=mgr is blocked by client role guard
    renderOffice("/van-phong?modal=mgr")
    await screen.findByTestId("office-hud-card-mine")
    expect(screen.queryByTestId("office-modal-mgr")).toBeNull()
  })

  it("verifies [U-H4] header profile button, [U-M6] Cả nhóm toggles, [U-M9] validation prompts/placeholders/reassign toast/metadata, and [U-M15] StaffProfileModal tenure copy", async () => {
    const user = userEvent.setup()
    authState.user = {
      id: "u-boss",
      email: "huy@iqx.vn",
      username: "lehuy",
      full_name: "Lê Huy",
      role: "team_lead",
    }
    authState.isAuthenticated = true
    authState.isLoading = false

    apiMocks.me.mockResolvedValue(makeBossMe())
    apiMocks.listAssignments.mockResolvedValue({
      items: [
        {
          id: "asg-sent-1",
          kind: "kpi",
          title: "Mở 20 tài khoản mới",
          points: 100,
          repeatDaily: false,
          dueDate: "2026-11-30",
          periodMonth: "2026-11",
          isAllTeam: false,
          targetCount: 1,
          activeCount: 1,
          doneCount: 0,
          targetUserIds: ["u-staff-1"],
          createdAt: "2026-11-23T01:30:00.000Z",
        },
      ],
    } satisfies OfficeAssignmentsResponse)
    apiMocks.listReview.mockResolvedValue({ items: [] })
    apiMocks.listTeamProposals.mockResolvedValue({ items: [], unreadCount: 0 })
    apiMocks.progress.mockResolvedValue({
      periodMonth: "2026-11",
      todayDate: "2026-11-23",
      items: [],
    })
    apiMocks.listMembers.mockResolvedValue({
      todayDate: "2026-11-23",
      items: [
        {
          userId: "u-staff-1",
          displayName: "Lê Ngọc Hạnh",
          accentColor: "#C2417D",
          joinDate: "2024-05-10",
          tenure: { years: 2, months: 6, days: 13, label: "2 năm 6 tháng 13 ngày" },
        },
      ],
    })
    apiMocks.getMemberProfile.mockResolvedValue({
      userId: "u-staff-1",
      displayName: "Lê Ngọc Hạnh",
      email: "hanh@iqx.vn",
      bossName: "Lê Huy",
      accentColor: "#C2417D",
      joinDate: "2024-05-10",
      todayDate: "2026-11-23",
      tenure: { years: 2, months: 6, days: 13, label: "2 năm 6 tháng 13 ngày" },
      stats: {
        monthlyPoints: 180,
        tasksDone: 8,
        tasksTotal: 10,
        pendingCount: 1,
        attendanceOk: 15,
        attendanceLate: 1,
        attendanceAbsent: 0,
      },
      notes: [],
    })

    renderOffice("/van-phong?modal=mgr")
    const mgrModal = await screen.findByTestId("office-modal-mgr")

    // [U-M6]: With "Cả nhóm" active, all staff chips are pressed; clicking one deselects ONLY that staff
    const allChip = within(mgrModal).getByRole("button", { name: "Cả nhóm" })
    const hanhChip = within(mgrModal).getByRole("button", { name: "Lê Ngọc Hạnh" })
    const anChip = within(mgrModal).getByRole("button", { name: "Nguyễn Văn An" })
    expect(allChip.getAttribute("aria-pressed")).toBe("true")
    expect(hanhChip.getAttribute("aria-pressed")).toBe("true")
    expect(anChip.getAttribute("aria-pressed")).toBe("true")

    await user.click(hanhChip)
    expect(allChip.getAttribute("aria-pressed")).toBe("false")
    expect(hanhChip.getAttribute("aria-pressed")).toBe("false")
    expect(anChip.getAttribute("aria-pressed")).toBe("true")

    // Clicking back Hạnh re-lights Cả nhóm; clicking Cả nhóm toggles all off cleanly
    await user.click(hanhChip)
    expect(allChip.getAttribute("aria-pressed")).toBe("true")
    await user.click(allChip)
    expect(allChip.getAttribute("aria-pressed")).toBe("false")
    expect(hanhChip.getAttribute("aria-pressed")).toBe("false")
    expect(anChip.getAttribute("aria-pressed")).toBe("false")

    // [U-M9]: Exact inline validation prompts & kind-specific placeholder
    await user.click(within(mgrModal).getByRole("button", { name: "KPI" }))
    const titleInput = within(mgrModal).getByLabelText(/^Tiêu đề/) as HTMLInputElement
    expect(titleInput.placeholder).toContain("Mở 20 tài khoản mới")

    await user.click(within(mgrModal).getByRole("button", { name: "Giao nhiệm vụ" }))
    expect(within(mgrModal).getByRole("alert").textContent).toBe(
      "Nhập tên nhiệm vụ"
    )

    await user.type(titleInput, "Mục tiêu KPI")
    const ptsInput = within(mgrModal).getByLabelText("Điểm thưởng (1–1000)")
    await user.clear(ptsInput)
    await user.type(ptsInput, "0")
    await user.click(within(mgrModal).getByRole("button", { name: "Giao nhiệm vụ" }))
    expect(within(mgrModal).getByRole("alert").textContent).toBe(
      "Nhập điểm cho nhiệm vụ"
    )

    await user.clear(ptsInput)
    await user.type(ptsInput, "100")
    await user.click(within(mgrModal).getByRole("button", { name: "Giao nhiệm vụ" }))
    expect(within(mgrModal).getByRole("alert").textContent).toBe(
      "Chọn người nhận"
    )

    // [U-M9]: "Đã giao" metadata & "Giao lại" toast
    await user.click(within(mgrModal).getByRole("tab", { name: /Đã giao/ }))
    const sentCard = within(mgrModal).getByTestId("office-assignment-asg-sent-1")
    expect(sentCard.textContent).toContain("Giao 23/11 · 08:30 · Lê Ngọc Hạnh")
    await user.click(within(sentCard).getByRole("button", { name: "Giao lại" }))
    expect(screen.getByTestId("office-toast").textContent).toContain(
      "Đã điền sẵn, chỉnh rồi bấm Giao nhiệm vụ"
    )

    // [U-H4]: "Hồ sơ nhân viên" button in QUẢN LÝ header opens HỒ SƠ NHÂN VIÊN
    await user.click(
      within(mgrModal).getByRole("button", { name: "Hồ sơ nhân viên" })
    )
    const profModal = await screen.findByTestId("office-modal-prof")
    // [U-M15]: "Đã làm ..." + "tính tới dd/mm/yyyy"
    expect(
      await within(profModal).findByTestId("office-profile-tenure")
    ).toBeTruthy()
    expect(
      within(profModal).getByTestId("office-profile-tenure").textContent
    ).toContain("Đã làm 2 năm 6 tháng 13 ngày")
    expect(
      within(profModal).getByTestId("office-profile-tenure").textContent
    ).toContain("tính tới 23/11/2026")
  })

  it("verifies [U-M4] error retry banners, [U-M5] focus trap & restore, [U-M7] 1-click sticky note auto-focus, [U-M8] server clock & counts, [U-M13] 200-char agenda validation, [U-M15] HUD polish, and [U-H5] WebGL fallback quick actions", async () => {
    const user = userEvent.setup()
    authState.user = {
      id: "u-staff-1",
      email: "hanh@iqx.vn",
      username: "hanh",
      full_name: "Lê Ngọc Hạnh",
      role: "user",
    }
    authState.isAuthenticated = true
    authState.isLoading = false

    const staffMe = makeStaffMe()
    apiMocks.me.mockResolvedValue(staffMe)

    // Simulate WebGL failure via startOffice onError AND early WS welcome peers (E2E P1)
    let capturedOnError: ((err: unknown) => void) | undefined
    const engineHandle = {
      setZoomDelta: vi.fn(),
      updateTeam: vi.fn(),
      updateOnlinePeers: vi.fn(),
      updateAttendance: vi.fn(),
      updateMeeting: vi.fn(),
      updateStandee: vi.fn(),
      setModalOpen: vi.fn(),
      resendSelfState: vi.fn(),
      dispose: vi.fn(),
    }
    startOfficeMock.mockImplementation((_container, cbs) => {
      capturedOnError = cbs?.onError
      return engineHandle
    })
    createSocketMock.mockImplementation((opts) => ({
      start: () => {
        opts.onWelcome?.(
          {
            peerId: "p-self",
            userId: "u-staff-1",
            name: "Lê Ngọc Hạnh",
            role: "staff",
            avatarId: "female01",
            accentColor: "#C2417D",
            x: 245,
            y: 870,
            facing: "down",
            moving: false,
          },
          [
            {
              peerId: "p-boss",
              userId: "u-boss",
              name: "Lê Huy",
              role: "boss",
              avatarId: "male04",
              accentColor: "#B7791F",
              x: 440,
              y: 310,
              facing: "down",
              moving: false,
            },
          ],
          2
        )
      },
      stop: vi.fn(),
      sendState: vi.fn(),
      getStatus: () => "online",
      getPeers: () => [],
      getOnlineCount: () => 2,
    }))

    // [U-M4] Leaderboard fetch fails until user clicks "Tải lại"
    apiMocks.leaderboard.mockRejectedValue(new Error("Network down"))
    apiMocks.listMyTasks.mockResolvedValue({
      ...makeMyTasks(),
      day: [
        {
          ...makeMyTasks().day[0],
          status: "pending",
          submitNote: "Đã gửi báo cáo",
          submittedAt: "2026-11-23T01:40:00.000Z",
        },
      ],
    })
    apiMocks.listMyProposals.mockResolvedValue({ items: [], unreadCount: 0 })
    const initialNotes: OfficeStickyNotesResponse = {
      maxNotes: 50,
      items: [],
    }
    const createdNote = {
      id: "n-auto-focus",
      color: "b" as const,
      content: "",
      createdAt: "2026-11-23T01:20:00.000Z",
      updatedAt: "2026-11-23T01:20:00.000Z",
    }
    apiMocks.listStickyNotes
      .mockResolvedValueOnce(initialNotes)
      .mockResolvedValue({ maxNotes: 50, items: [createdNote] })
    apiMocks.createStickyNote.mockResolvedValue(createdNote)

    renderOffice()

    const root = await screen.findByTestId("office-page")
    expect(root.getAttribute("data-wasd-world")).toBe("true")

    // Verify E2E P1: early WS welcome peers pushed when engine resolves
    await waitFor(() =>
      expect(engineHandle.updateOnlinePeers).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ userId: "u-boss", name: "Lê Huy" }),
        ])
      )
    )

    // [U-M15]: Gold monthly points with "điểm", rule includes "Thứ Hai – Thứ Sáu", absent row omits "—"
    const mineCard = screen.getByTestId("office-hud-card-mine")
    expect(within(mineCard).getByText("180 điểm")).toBeTruthy()
    const attCard = screen.getByTestId("office-hud-card-att")
    expect(attCard.textContent).toContain("Thứ Hai – Thứ Sáu")
    await user.click(within(attCard).getByRole("button", { name: /Vắng/ }))
    const roster = within(attCard).getByTestId("office-attendance-roster")
    expect(roster.textContent).not.toContain("—")

    // [U-H5]: Trigger WebGL failure -> quick-entry buttons open Leaderboard -> [U-M4] error retry
    capturedOnError?.(new Error("WebGL unavailable"))
    const fallbackRegion = await screen.findByRole("region", {
      name: "Chế độ dự phòng 3D",
    })
    const standBtn = within(fallbackRegion).getByRole("button", {
      name: "Thành tích tháng",
    })
    await user.click(standBtn)

    const standModal = await screen.findByTestId("office-modal-stand")
    // [U-M5]: Initial focus automatically moves inside ModalShell on open
    expect(standModal.contains(document.activeElement)).toBe(true)
    expect(
      await within(standModal).findByText(
        "Không tải được dữ liệu. Vui lòng thử lại."
      )
    ).toBeTruthy()
    apiMocks.leaderboard.mockResolvedValue(makeLeaderboard())
    await user.click(within(standModal).getByRole("button", { name: "Tải lại" }))
    expect(await within(standModal).findByText("Lê Ngọc Hạnh")).toBeTruthy()

    // [U-M5]: Focus trap inside ModalShell (even after focused retry button unmounts) & focus restore on Escape
    const closeBtn = within(standModal).getByRole("button", { name: "Đóng" })
    fireEvent.keyDown(window, { key: "Tab" })
    expect(document.activeElement).toBe(closeBtn)
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true })
    expect(document.activeElement).toBe(closeBtn)

    fireEvent.keyDown(window, { key: "Escape" })
    await waitFor(() =>
      expect(screen.queryByTestId("office-modal-stand")).toBeNull()
    )
    expect(document.activeElement).toBe(standBtn)

    // [U-M7] & [U-M8]: Open MyTasksModal -> verify x/y xong, server clock 08:20, trong hôm nay, · gửi 08:40, 1-click sticky note auto-focus
    await user.click(
      within(fallbackRegion).getByRole("button", { name: "Nhiệm vụ của tôi" })
    )
    const mineModal = await screen.findByTestId("office-modal-mine")
    expect(within(mineModal).getByTestId("office-checkin-btn").textContent).toBe(
      "Điểm danh · 08:20"
    )
    expect(mineModal.textContent).toContain("0/1 xong · reset 0:00")
    expect(mineModal.textContent).toContain("Chờ sếp xác nhận · trong hôm nay")
    expect(mineModal.textContent).toContain("Bạn ghi: Đã gửi báo cáo · gửi 08:40")

    // 1-click blue pastel dot creates sticky note & auto-focuses its textarea + shows 23/11
    await user.click(
      within(mineModal).getByRole("button", { name: "Xanh dương nhạt" })
    )
    const createdCard = await within(mineModal).findByTestId(
      "office-sticky-note-n-auto-focus"
    )
    expect(within(createdCard).getByText("23/11")).toBeTruthy()
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(createdCard).getByLabelText("Nội dung ghi chú")
      )
    )
  })

  it("verifies [U-M13] 200-char agenda line inline validation in MeetingRoomModal", async () => {
    const user = userEvent.setup()
    authState.user = {
      id: "u-boss",
      email: "huy@iqx.vn",
      username: "lehuy",
      full_name: "Lê Huy",
      role: "team_lead",
    }
    authState.isAuthenticated = true
    authState.isLoading = false
    apiMocks.me.mockResolvedValue(makeBossMe())

    renderOffice("/van-phong?modal=meet")
    const meetModal = await screen.findByTestId("office-modal-meet")
    await user.click(
      within(meetModal).getByRole("button", { name: /Tạo lịch họp/ })
    )
    await user.type(within(meetModal).getByLabelText(/^Tiêu đề/), "Họp định kỳ")
    await user.type(
      within(meetModal).getByLabelText("Đường dẫn phòng họp"),
      "https://meet.google.com/valid-link"
    )
    const agendaInput = within(meetModal).getByLabelText(/Nội dung cuộc họp/)
    fireEvent.change(agendaInput, { target: { value: "a".repeat(201) } })
    await user.click(
      within(meetModal)
        .getAllByRole("button", { name: "Tạo lịch họp" })
        .at(-1)!
    )
    expect(within(meetModal).getByRole("alert").textContent).toContain(
      "Mỗi mục nội dung họp tối đa 200 ký tự."
    )
    expect(apiMocks.createMeeting).not.toHaveBeenCalled()
  })

  it("cancels pending sticky note debounce when deleted within 500ms (zero 404 PATCH) and verifies remaining Spec copy", async () => {
    const user = userEvent.setup()
    authState.user = {
      id: "u-staff-1",
      email: "hanh@iqx.vn",
      username: "hanh",
      full_name: "Lê Ngọc Hạnh",
      role: "user",
    }
    authState.isAuthenticated = true
    authState.isLoading = false

    // Invalid serverTime must fall back to real current time (never hardcoded "08:00" when not 08:00)
    apiMocks.me.mockResolvedValue({ ...makeStaffMe(), serverTime: "invalid" })
    apiMocks.listMyTasks.mockResolvedValue({
      periodMonth: "2026-11",
      todayDate: "2026-11-23",
      monthlyPoints: 180,
      day: [
        {
          ...makeMyTasks().day[0],
          status: "done",
          pointsSnapshot: 15,
        },
      ],
      month: [],
      kpi: [],
    })
    apiMocks.listMyProposals.mockResolvedValue({ items: [], unreadCount: 0 })
    const noteItems = [
      {
        id: "n-race",
        color: "y" as const,
        content: "Ghi chú sắp xoá",
        createdAt: "2026-11-23T01:00:00.000Z",
        updatedAt: "2026-11-23T01:00:00.000Z",
      },
    ]
    apiMocks.listStickyNotes.mockImplementation(() =>
      Promise.resolve({ maxNotes: 50, items: [...noteItems] })
    )
    apiMocks.deleteStickyNote.mockImplementation(async (id: string) => {
      const idx = noteItems.findIndex((n) => n.id === id)
      if (idx >= 0) noteItems.splice(idx, 1)
      return { ok: true }
    })

    const staffView = renderOffice("/van-phong?modal=mine")
    const mineModal = await screen.findByTestId("office-modal-mine")

    // Done task badge shows "+15 điểm", empty task boxes show "Chưa có nhiệm vụ."
    expect(await within(mineModal).findByText("+15 điểm")).toBeTruthy()
    expect(within(mineModal).getAllByText("Chưa có nhiệm vụ.")).toHaveLength(2)

    // Attendance button uses real current HH:mm format (no blank/NaN)
    expect(within(mineModal).getByTestId("office-checkin-btn").textContent).toMatch(
      /^Điểm danh · \d{2}:\d{2}$/
    )

    // Type into sticky note and delete immediately within 500ms debounce
    const noteCard = await within(mineModal).findByTestId(
      "office-sticky-note-n-race"
    )
    const textarea = within(noteCard).getByLabelText("Nội dung ghi chú")
    await user.type(textarea, " mới gõ")
    await user.click(within(noteCard).getByRole("button", { name: "Xoá ghi chú" }))

    await waitFor(() =>
      expect(apiMocks.deleteStickyNote).toHaveBeenCalledWith("n-race")
    )
    await waitFor(() =>
      expect(
        within(mineModal).queryByTestId("office-sticky-note-n-race")
      ).toBeNull()
    )
    // Wait past the 500ms debounce window to ensure no stray PATCH fires
    await new Promise((resolve) => setTimeout(resolve, 600))
    expect(apiMocks.updateStickyNote).not.toHaveBeenCalled()
    staffView.unmount()

    // Verify Boss single-approve toast, empty review copy, "Bạn đã trả lời", StaffProfile empty search/notes & join date toast
    authState.user = {
      id: "u-boss",
      email: "huy@iqx.vn",
      username: "lehuy",
      full_name: "Lê Huy",
      role: "team_lead",
    }
    apiMocks.me.mockResolvedValue(makeBossMe())
    apiMocks.listAssignments.mockResolvedValue({ items: [] })
    apiMocks.listReview
      .mockResolvedValueOnce({
        items: [
          {
            id: "rev-single",
            assignmentId: "asg-1",
            userId: "u-staff-1",
            staffName: "Lê Ngọc Hạnh",
            staffAccentColor: "#C2417D",
            kind: "day",
            title: "Gọi khách sáng",
            points: 10,
            taskDate: "2026-11-23",
            dueDate: null,
            submitNote: null,
            submittedAt: "2026-11-23T01:30:00.000Z",
          },
        ],
      })
      .mockResolvedValue({ items: [] })
    apiMocks.approveTasks.mockResolvedValue({
      approved: [
        {
          taskId: "rev-single",
          userId: "u-staff-1",
          staffName: "Lê Ngọc Hạnh",
          title: "Gọi khách sáng",
          points: 10,
          totalMonthlyPoints: 190,
        },
      ],
    })
    apiMocks.listTeamProposals.mockResolvedValue({
      unreadCount: 0,
      items: [
        {
          id: "prop-replied",
          userId: "u-staff-1",
          staffName: "Lê Ngọc Hạnh",
          staffAccentColor: "#C2417D",
          content: "Xin nghỉ sáng mai",
          status: "replied",
          seenAt: "2026-11-23T01:35:00.000Z",
          reply: "Đồng ý",
          repliedAt: "2026-11-23T01:40:00.000Z",
          createdAt: "2026-11-23T01:30:00.000Z",
        },
      ],
    })
    apiMocks.progress.mockResolvedValue({
      periodMonth: "2026-11",
      todayDate: "2026-11-23",
      items: [],
    })
    apiMocks.listMembers.mockResolvedValue({
      todayDate: "2026-11-23",
      items: [
        {
          userId: "u-staff-1",
          displayName: "Lê Ngọc Hạnh",
          accentColor: "#C2417D",
          joinDate: "2024-05-10",
          tenure: { years: 2, months: 6, days: 13, label: "2 năm 6 tháng 13 ngày" },
        },
      ],
    })
    const baseDetail: OfficeMemberDetail = {
      userId: "u-staff-1",
      displayName: "Lê Ngọc Hạnh",
      email: "hanh@iqx.vn",
      bossName: "Lê Huy",
      accentColor: "#C2417D",
      joinDate: "2024-05-10",
      todayDate: "2026-11-23",
      tenure: { years: 2, months: 6, days: 13, label: "2 năm 6 tháng 13 ngày" },
      stats: {
        monthlyPoints: 180,
        tasksDone: 8,
        tasksTotal: 10,
        pendingCount: 0,
        attendanceOk: 15,
        attendanceLate: 1,
        attendanceAbsent: 0,
      },
      notes: [],
    }
    apiMocks.getMemberProfile.mockResolvedValue(baseDetail)
    apiMocks.updateMemberProfile.mockResolvedValue({
      ...baseDetail,
      joinDate: "2024-06-01",
    })

    const mgrView = renderOffice("/van-phong?modal=mgr")
    const mgrModal = await screen.findByTestId("office-modal-mgr")
    expect(await within(mgrModal).findByText(/^Bạn đã trả lời/)).toBeTruthy()
    await user.click(
      await within(mgrModal).findByRole("button", { name: "✓ Duyệt hoàn thành" })
    )
    await waitFor(() =>
      expect(screen.getByTestId("office-toast").textContent).toBe(
        "Đã duyệt · Lê Ngọc Hạnh +10 điểm"
      )
    )
    expect(
      await within(mgrModal).findByText("Không có nhiệm vụ nào chờ xác nhận.")
    ).toBeTruthy()

    await user.click(
      within(mgrModal).getByRole("button", { name: "Hồ sơ nhân viên" })
    )
    const profModal = await screen.findByTestId("office-modal-prof")
    expect(await within(profModal).findByText("Chưa có ghi chú.")).toBeTruthy()

    const dateInput = within(profModal).getByLabelText("Ngày vào làm")
    fireEvent.change(dateInput, { target: { value: "2024-06-01" } })
    await waitFor(() =>
      expect(screen.getByTestId("office-toast").textContent).toBe(
        "Đã cập nhật ngày vào làm"
      )
    )

    const searchInput = within(profModal).getByLabelText("Tìm nhân viên")
    await user.type(searchInput, "khongtontai")
    expect(within(profModal).getByText("Không tìm thấy.")).toBeTruthy()
    mgrView.unmount()
  })
})
