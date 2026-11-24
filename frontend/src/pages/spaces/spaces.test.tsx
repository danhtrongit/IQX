import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import {
  MemoryRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { OfficeMe } from "@/pages/office/types.ts"
import { resetBridge, ui } from "@/pages/trading-floor/bridge.ts"

import {
  FLOOR_GUEST_OFFICE_PROMPT,
  OFFICE_NON_MEMBER_TOAST,
  type RoomDoorHandle,
} from "./door-transition.ts"
import {
  buildSpaceUrl,
  normalizeSpaceLink,
  redirectLegacyOfficeUrl,
  redirectLegacyVirtualOfficeUrl,
  resolveSpaceRoom,
} from "./spaces-url.ts"

const mocks = vi.hoisted(() => ({
  auth: {
    user: null as {
      id: string
      email: string
      username: string
      full_name: string
      role: string
    } | null,
    isAuthenticated: false,
    isLoading: false,
    openAuth: vi.fn(),
  },
  floorApiMe: vi.fn(),
  officeApiMe: vi.fn(),
  officeAttendance: vi.fn(),
  officeMeetings: vi.fn(),
  officeLeaderboard: vi.fn(),
  startFloor: vi.fn(),
  startFloorCleanup: vi.fn(),
  floorSocketStop: vi.fn(),
  startOffice: vi.fn(),
  officeEngineDispose: vi.fn(),
  officeSocketStart: vi.fn(),
  officeSocketStop: vi.fn(),
  lastFloorDoorHandle: null as RoomDoorHandle | null,
  lastOfficeDoorHandle: null as RoomDoorHandle | null,
}))

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => mocks.auth,
}))

vi.mock("@/pages/demo-trading/shop/use-shop", () => ({
  useShopState: () => ({ data: { wallet: { balance: 500 } } }),
}))

vi.mock("@/pages/trading-floor/net/api.ts", () => ({
  floorApi: {
    me: (...args: unknown[]) => mocks.floorApiMe(...args),
    thanTai: {
      today: vi.fn(() => Promise.resolve({ drawn: true, result: null })),
    },
  },
}))

vi.mock("@/pages/trading-floor/posts/api.ts", () => ({
  postsApi: {
    today: vi.fn(() => Promise.resolve({ date: "2026-11-24", items: [] })),
    detail: vi.fn(),
  },
}))

vi.mock("@/pages/trading-floor/net/socket.ts", () => ({
  floorSocket: {
    status: { get: () => "online", subscribe: () => () => {} },
    on: () => () => {},
    start: vi.fn(),
    stop: (...args: unknown[]) => mocks.floorSocketStop(...args),
    send: vi.fn(),
  },
}))

vi.mock("@/pages/trading-floor/engine/start-floor.ts", () => ({
  startFloor: (
    container: HTMLElement,
    opts?: {
      arrivedViaDoor?: boolean
      onReady?: () => void
      onControllerReady?: (handle: RoomDoorHandle | null) => void
      onDoorHintChange?: (near: boolean) => void
      onDoorRequest?: () => void
    }
  ) => {
    mocks.startFloor(container, opts)
    const handle: RoomDoorHandle = {
      beginDoorExit: vi.fn((onFadeStart: () => void) => onFadeStart()),
    }
    mocks.lastFloorDoorHandle = handle
    ui.ready.set(true)
    opts?.onControllerReady?.(handle)
    opts?.onReady?.()
    return () => {
      mocks.startFloorCleanup()
      mocks.floorSocketStop()
      opts?.onControllerReady?.(null)
    }
  },
}))

vi.mock("@/pages/office/api.ts", () => ({
  officeApi: {
    me: (...args: unknown[]) => mocks.officeApiMe(...args),
    attendanceToday: (...args: unknown[]) => mocks.officeAttendance(...args),
    listMeetings: (...args: unknown[]) => mocks.officeMeetings(...args),
    leaderboard: (...args: unknown[]) => mocks.officeLeaderboard(...args),
  },
}))

vi.mock("@/pages/office/engine/start-office.ts", () => ({
  startOffice: (
    container: HTMLElement,
    callbacks?: {
      arrivedViaDoor?: boolean
      onReady?: () => void
      onDoorRequest?: () => void
    }
  ) => {
    mocks.startOffice(container, callbacks)
    const beginDoorExit = vi.fn((onFadeStart: () => void) => onFadeStart())
    mocks.lastOfficeDoorHandle = { beginDoorExit }
    callbacks?.onReady?.()
    return {
      setZoomDelta: vi.fn(),
      updateTeam: vi.fn(),
      updateOnlinePeers: vi.fn(),
      updateAttendance: vi.fn(),
      updateMeeting: vi.fn(),
      updateStandee: vi.fn(),
      setModalOpen: vi.fn(),
      resendSelfState: vi.fn(),
      beginDoorExit,
      dispose: mocks.officeEngineDispose,
    }
  },
}))

vi.mock("@/pages/office/office-socket.ts", () => ({
  createOfficeSocket: () => ({
    start: mocks.officeSocketStart,
    stop: mocks.officeSocketStop,
    sendState: vi.fn(),
    getStatus: () => "online",
    getPeers: () => [],
    getOnlineCount: () => 2,
  }),
}))

const { SpacesPage } = await import("./SpacesPage.tsx")

const MEMBER_ME: OfficeMe = {
  member: true,
  role: "staff",
  serverTime: "2026-11-24T01:30:00.000Z",
  todayDate: "2026-11-24",
  periodMonth: "2026-11",
  isWorkday: true,
  isAttendanceLocked: false,
  cutoffs: { onTime: "08:30", lock: "12:00" },
  onlineCount: 2,
  onlineUserIds: ["u-1", "u-boss"],
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
    userId: "u-1",
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
      userId: "u-1",
      role: "staff",
      displayName: "Lê Ngọc Hạnh",
      avatar: "female01",
      avatarColor: null,
      deskIndex: 0,
      accentColor: "#C2417D",
      online: true,
    },
  ],
  hud: {
    kind: "staff",
    todayDoneCount: 1,
    todayTotalCount: 2,
    pendingCount: 0,
    returnedCount: 0,
    monthlyPoints: 120,
    myAttendanceStatus: "ok",
    myCheckedInAt: "2026-11-24T01:10:00.000Z",
  },
}

const NON_MEMBER_ME: OfficeMe = {
  member: false,
  role: "none",
  serverTime: "2026-11-24T01:30:00.000Z",
  todayDate: "2026-11-24",
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
}

function LocationProbe() {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <>
      <output data-testid="space-url">
        {location.pathname}
        {location.search}
        {location.hash}
      </output>
      <button
        type="button"
        data-testid="history-back"
        onClick={() => navigate(-1)}
      >
        Back
      </button>
      <button
        type="button"
        data-testid="history-forward"
        onClick={() => navigate(1)}
      >
        Forward
      </button>
    </>
  )
}

function LegacyOfficeRedirectProbe() {
  const location = useLocation()
  return (
    <Navigate
      replace
      to={redirectLegacyOfficeUrl(location.search, location.hash)}
      state={location.state}
    />
  )
}

function LegacyVirtualOfficeRedirectProbe() {
  const location = useLocation()
  return (
    <Navigate
      replace
      to={redirectLegacyVirtualOfficeUrl(location.search, location.hash)}
      state={location.state}
    />
  )
}

function renderSpaces(initialEntries: string[]) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <LocationProbe />
        <Routes>
          <Route path="/" element={<div data-testid="home-page">Home</div>} />
          <Route path="/khu-giao-dich" element={<SpacesPage />} />
          <Route path="/van-phong" element={<LegacyOfficeRedirectProbe />} />
          <Route
            path="/van-phong-ao"
            element={<LegacyVirtualOfficeRedirectProbe />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const origMatchMedia = window.matchMedia

function stubReducedMotion(reduced: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query.includes("prefers-reduced-motion") ? reduced : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  })
}

beforeEach(() => {
  resetBridge()
  stubReducedMotion(false)
  mocks.auth.user = {
    id: "u-1",
    email: "hanh@iqx.vn",
    username: "hanh",
    full_name: "Lê Ngọc Hạnh",
    role: "user",
  }
  mocks.auth.isAuthenticated = true
  mocks.auth.isLoading = false
  mocks.auth.openAuth.mockReset()
  mocks.floorApiMe.mockReset().mockResolvedValue({
    profile: { name: "Lê Ngọc Hạnh", avatar: "female01", color: "default" },
    suggestedName: "Lê Ngọc Hạnh",
    saco: null,
    guest: false,
  })
  mocks.officeApiMe.mockReset().mockResolvedValue(MEMBER_ME)
  mocks.officeAttendance.mockReset().mockResolvedValue({
    todayDate: "2026-11-24",
    isWorkday: true,
    isLocked: false,
    cutoffs: { onTime: "08:30", lock: "12:00" },
    counts: { ok: 1, late: 0, absent: 0, total: 1 },
    myAttendanceStatus: "ok",
    myCheckedInAt: "2026-11-24T01:10:00.000Z",
    roster: { ok: [], late: [], absent: [] },
  })
  mocks.officeMeetings.mockReset().mockResolvedValue({
    todayDate: "2026-11-24",
    nextWallMeeting: null,
    today: [],
    upcoming: [],
  })
  mocks.officeLeaderboard.mockReset().mockResolvedValue({
    periodMonth: "2026-11",
    top3: [],
    myRank: null,
  })
  mocks.startFloor.mockReset()
  mocks.startFloorCleanup.mockReset()
  mocks.floorSocketStop.mockReset()
  mocks.startOffice.mockReset()
  mocks.officeEngineDispose.mockReset()
  mocks.officeSocketStart.mockReset()
  mocks.officeSocketStop.mockReset()
  mocks.lastFloorDoorHandle = null
  mocks.lastOfficeDoorHandle = null
})

afterEach(() => {
  resetBridge()
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: origMatchMedia,
  })
  vi.restoreAllMocks()
})

describe("spaces-url helpers & legacy route redirects", () => {
  it("resolves rooms, builds canonical URLs, and normalizes legacy notification links", () => {
    expect(resolveSpaceRoom("")).toBe("floor")
    expect(resolveSpaceRoom("?phong=van-phong")).toBe("office")
    expect(resolveSpaceRoom("?phong=van-phong&modal=mine")).toBe("office")
    expect(resolveSpaceRoom("?phong=other")).toBe("floor")

    expect(buildSpaceUrl("floor")).toBe("/khu-giao-dich")
    expect(buildSpaceUrl("floor", "?phong=van-phong&modal=mine&ref=1")).toBe(
      "/khu-giao-dich?ref=1"
    )
    expect(buildSpaceUrl("office")).toBe("/khu-giao-dich?phong=van-phong")
    expect(buildSpaceUrl("office", "?modal=mgr&ref=bell", "#top")).toBe(
      "/khu-giao-dich?phong=van-phong&modal=mgr&ref=bell#top"
    )

    expect(redirectLegacyOfficeUrl("?modal=mine")).toBe(
      "/khu-giao-dich?phong=van-phong&modal=mine"
    )
    expect(redirectLegacyVirtualOfficeUrl("?utm=zalo")).toBe(
      "/khu-giao-dich?utm=zalo"
    )

    expect(normalizeSpaceLink("/van-phong?modal=mine")).toBe(
      "/khu-giao-dich?phong=van-phong&modal=mine"
    )
    expect(normalizeSpaceLink("/van-phong?modal=mgr")).toBe(
      "/khu-giao-dich?phong=van-phong&modal=mgr"
    )
    expect(normalizeSpaceLink("/van-phong-ao?ref=home")).toBe(
      "/khu-giao-dich?ref=home"
    )
    expect(normalizeSpaceLink("/luyen-tap?tool=bot")).toBe(
      "/luyen-tap?tool=bot"
    )
    expect(normalizeSpaceLink("https://iqx.vn/van-phong")).toBe(
      "https://iqx.vn/van-phong"
    )
  })

  it("redirects /van-phong?modal=mine and /van-phong-ao?from=share with replace preserving other query params", async () => {
    const user = userEvent.setup()
    const view1 = renderSpaces(["/", "/van-phong?modal=mine&source=bell"])
    await waitFor(() =>
      expect(screen.getByTestId("space-url").textContent).toBe(
        "/khu-giao-dich?phong=van-phong&modal=mine&source=bell"
      )
    )
    expect(await screen.findByTestId("office-page")).toBeTruthy()
    // Verify `replace: true`: pressing Back returns directly to "/", not a redirect loop on "/van-phong".
    await user.click(screen.getByTestId("history-back"))
    await waitFor(() =>
      expect(screen.getByTestId("space-url").textContent).toBe("/")
    )
    expect(await screen.findByTestId("home-page")).toBeTruthy()
    view1.unmount()

    const view2 = renderSpaces(["/", "/van-phong-ao?from=share"])
    await waitFor(() =>
      expect(screen.getByTestId("space-url").textContent).toBe(
        "/khu-giao-dich?from=share"
      )
    )
    expect(await screen.findByTestId("trading-floor-page")).toBeTruthy()
    await user.click(screen.getByTestId("history-back"))
    await waitFor(() =>
      expect(screen.getByTestId("space-url").textContent).toBe("/")
    )
    view2.unmount()
  })
})

describe("SpacesPage room switch, full teardown, back/forward, and access rules", () => {
  it("switches Floor -> Office -> Floor via HUD buttons, tearing down old engine/sockets and supporting browser Back/Forward", async () => {
    stubReducedMotion(true)
    const user = userEvent.setup()
    renderSpaces(["/khu-giao-dich"])

    // Floor mounted with HUD button "Sang Văn phòng"
    const goOfficeBtn = await screen.findByTestId("floor-go-office-btn")
    expect(goOfficeBtn.textContent).toContain("Sang Văn phòng")
    expect(mocks.startFloor).toHaveBeenCalledTimes(1)

    // Switch Floor -> Office
    await user.click(goOfficeBtn)

    await waitFor(() =>
      expect(screen.getByTestId("space-url").textContent).toBe(
        "/khu-giao-dich?phong=van-phong"
      )
    )
    expect(mocks.startFloorCleanup).toHaveBeenCalledTimes(1)
    expect(mocks.floorSocketStop).toHaveBeenCalledTimes(1)
    expect(await screen.findByTestId("office-page")).toBeTruthy()
    expect(mocks.startOffice).toHaveBeenCalledTimes(1)
    expect(mocks.officeSocketStart).toHaveBeenCalledTimes(1)

    // Switch Office -> Floor via HUD button "Về Khu giao dịch"
    const goFloorBtn = await screen.findByTestId("office-go-floor-btn")
    expect(goFloorBtn.textContent).toContain("Về Khu giao dịch")
    await user.click(goFloorBtn)

    await waitFor(() =>
      expect(screen.getByTestId("space-url").textContent).toBe("/khu-giao-dich")
    )
    expect(mocks.officeEngineDispose).toHaveBeenCalledTimes(1)
    expect(mocks.officeSocketStop).toHaveBeenCalledTimes(1)
    expect(await screen.findByTestId("trading-floor-page")).toBeTruthy()
    await waitFor(() => expect(mocks.startFloor).toHaveBeenCalledTimes(2))

    // Browser Back returns to Office (pushState worked) and tears down Floor
    await user.click(screen.getByTestId("history-back"))
    await waitFor(() =>
      expect(screen.getByTestId("space-url").textContent).toBe(
        "/khu-giao-dich?phong=van-phong"
      )
    )
    await waitFor(() =>
      expect(screen.getByTestId("office-page")).toBeTruthy()
    )
    await waitFor(() => expect(mocks.startFloorCleanup).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(mocks.startOffice).toHaveBeenCalledTimes(2))

    // Browser Forward returns to Floor and tears down Office
    await user.click(screen.getByTestId("history-forward"))
    await waitFor(() =>
      expect(screen.getByTestId("space-url").textContent).toBe("/khu-giao-dich")
    )
    await waitFor(() =>
      expect(screen.getByTestId("trading-floor-page")).toBeTruthy()
    )
    await waitFor(() => expect(mocks.officeEngineDispose).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(mocks.officeSocketStop).toHaveBeenCalledTimes(2))
  })

  it("shows existing Floor LoginPrompt with exact copy for guests clicking 'Sang Văn phòng' and stays on Floor", async () => {
    const user = userEvent.setup()
    mocks.auth.user = null
    mocks.auth.isAuthenticated = false
    mocks.floorApiMe.mockResolvedValue({
      profile: { name: "Khách", avatar: "male01", color: "default" },
      suggestedName: "Khách",
      saco: null,
      guest: true,
    })

    renderSpaces(["/khu-giao-dich"])

    // Seed a guest profile so Hud renders (bypassing JoinScreen)
    await act(async () => {
      ui.guest.set(true)
      ui.profile.set({ name: "Khách", avatar: "male01", color: "default" })
      ui.ready.set(true)
    })

    const goOfficeBtn = await screen.findByTestId("floor-go-office-btn")
    await user.click(goOfficeBtn)

    expect(await screen.findByText(FLOOR_GUEST_OFFICE_PROMPT)).toBeTruthy()
    expect(screen.getByTestId("space-url").textContent).toBe("/khu-giao-dich")
    expect(mocks.officeApiMe).not.toHaveBeenCalled()
    expect(mocks.startFloorCleanup).not.toHaveBeenCalled()
  })

  it("shows exact toast for signed-in non-members, caches office me query, and stays on Floor without transitioning", async () => {
    const user = userEvent.setup()
    mocks.officeApiMe.mockResolvedValue(NON_MEMBER_ME)

    renderSpaces(["/khu-giao-dich"])

    const goOfficeBtn = await screen.findByTestId("floor-go-office-btn")
    await user.click(goOfficeBtn)

    expect(await screen.findByText(OFFICE_NON_MEMBER_TOAST)).toBeTruthy()
    expect(screen.getByTestId("space-url").textContent).toBe("/khu-giao-dich")
    expect(mocks.officeApiMe).toHaveBeenCalledTimes(1)
    expect(mocks.startFloorCleanup).not.toHaveBeenCalled()

    // Second click uses cached `officeKeys.me()` without re-calling API
    await user.click(goOfficeBtn)
    expect(mocks.officeApiMe).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId("space-url").textContent).toBe("/khu-giao-dich")
  })

  it("shows NonMemberGate with 'Về Khu giao dịch' button when opening ?phong=van-phong directly as a non-member", async () => {
    stubReducedMotion(true)
    const user = userEvent.setup()
    mocks.officeApiMe.mockResolvedValue(NON_MEMBER_ME)

    renderSpaces(["/khu-giao-dich?phong=van-phong"])

    expect(await screen.findByText(OFFICE_NON_MEMBER_TOAST)).toBeTruthy()
    const backBtn = screen.getByTestId("office-gate-go-floor-btn")
    expect(backBtn.textContent).toContain("Về Khu giao dịch")

    await user.click(backBtn)
    await waitFor(() =>
      expect(screen.getByTestId("space-url").textContent).toBe("/khu-giao-dich")
    )
    expect(await screen.findByTestId("trading-floor-page")).toBeTruthy()
  })

  it("shows floor JoinScreen only for the floor and keeps office ?modal= working under /khu-giao-dich?phong=van-phong", async () => {
    // Guest opening Office directly sees NonMemberGate (never JoinScreen)
    mocks.auth.user = null
    mocks.auth.isAuthenticated = false
    const officeGuest = renderSpaces(["/khu-giao-dich?phong=van-phong"])
    expect(
      await screen.findByRole("heading", { name: "Đăng nhập để vào Văn phòng" })
    ).toBeTruthy()
    expect(screen.queryByRole("heading", { name: /Vào Khu giao dịch/i })).toBeNull()
    expect(screen.getByTestId("office-gate-go-floor-btn")).toBeTruthy()
    officeGuest.unmount()

    // Member opening Office with ?modal=meet opens the Meeting modal directly while preserving ?phong=van-phong
    mocks.auth.user = {
      id: "u-1",
      email: "hanh@iqx.vn",
      username: "hanh",
      full_name: "Lê Ngọc Hạnh",
      role: "user",
    }
    mocks.auth.isAuthenticated = true
    mocks.officeApiMe.mockResolvedValue(MEMBER_ME)

    const officeModalView = renderSpaces([
      "/khu-giao-dich?phong=van-phong&modal=meet",
    ])
    expect(await screen.findByTestId("office-modal-meet")).toBeTruthy()
    expect(screen.getByTestId("space-url").textContent).toBe(
      "/khu-giao-dich?phong=van-phong&modal=meet"
    )
    officeModalView.unmount()
  })
})
