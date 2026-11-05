/**
 * Thanh gọi nhóm: chưa vào chỉ có nút Tham gia gọi; đã vào có Mic, Camera, Chia sẻ màn hình (ẩn khi không hỗ trợ), Mở rộng, Rời;
 * ai đang nói, ai tắt mic; mở rộng thì màn hình đang chia sẻ hiện lớn và có nút tắt tiếng từng người; cảnh báo lộ thông tin trong ván.
 */
import { fireEvent, render, screen, within } from "@testing-library/react"
import { beforeAll, describe, expect, it, vi } from "vitest"

import { FlashbackCallBar } from "./flashback-call-bar"
import type { CallPersonView } from "./flashback-call-engine"
import { FlashbackContext, type FlashbackContextValue } from "./flashback-context"
import { CALL_TEXT } from "./flashback-call-model"
import type { CallApi } from "./use-flashback-call"

const person = (userId: string, patch: Partial<CallPersonView> = {}): CallPersonView => ({
  userId,
  name: `Tên ${userId}`,
  me: false,
  media: { audio: true, video: false, screen: false },
  speaking: false,
  muted: false,
  connection: "connected",
  audio: null,
  camera: null,
  screen: null,
  ...patch,
})

function callApi(patch: Partial<CallApi> = {}): CallApi {
  return {
    supported: true,
    status: "joined",
    people: [person("u1", { me: true, connection: "self" }), person("u2")],
    count: 2,
    videoCount: 0,
    screenSharerId: null,
    canShare: true,
    busy: { mic: false, camera: false, screen: false },
    join: vi.fn(),
    leave: vi.fn(),
    toggleMic: vi.fn(),
    toggleCamera: vi.fn(),
    toggleScreen: vi.fn(),
    setPeerMuted: vi.fn(),
    expanded: false,
    setExpanded: vi.fn(),
    ...patch,
  }
}

function renderBar(call: CallApi, inMatch = false) {
  const value = { call, room: { room: undefined } } as unknown as FlashbackContextValue
  return render(
    <FlashbackContext.Provider value={value}>
      <FlashbackCallBar inMatch={inMatch} />
    </FlashbackContext.Provider>,
  )
}

beforeAll(() => {
  // ScrollArea của Radix cần ResizeObserver, jsdom không có.
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
})

describe("FlashbackCallBar", () => {
  it("server chưa báo cuộc gọi hoặc trình duyệt không có WebRTC: không hiện gì", () => {
    const { container } = renderBar(callApi({ supported: false }))
    expect(container.childElementCount).toBe(0)
  })

  it("chưa vào: chỉ có nút Tham gia gọi", () => {
    const call = callApi({ status: "idle", people: [], count: 0 })
    renderBar(call)
    fireEvent.click(screen.getByRole("button", { name: "Tham gia gọi" }))
    expect(call.join).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("button", { name: /mic/i })).toBeNull()
  })

  it("đang xin quyền mic: nút vào bị khoá", () => {
    renderBar(callApi({ status: "joining", people: [], count: 0 }))
    expect((screen.getByRole("button", { name: "Đang vào gọi" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("đã vào: các nút đúng nhãn tiếng Việt và gọi đúng hành động", () => {
    const call = callApi()
    renderBar(call)
    fireEvent.click(screen.getByRole("button", { name: "Tắt mic" }))
    fireEvent.click(screen.getByRole("button", { name: "Bật camera" }))
    fireEvent.click(screen.getByRole("button", { name: "Chia sẻ màn hình" }))
    fireEvent.click(screen.getByRole("button", { name: "Mở rộng cuộc gọi" }))
    fireEvent.click(screen.getByRole("button", { name: "Rời cuộc gọi" }))
    expect(call.toggleMic).toHaveBeenCalledTimes(1)
    expect(call.toggleCamera).toHaveBeenCalledTimes(1)
    expect(call.toggleScreen).toHaveBeenCalledTimes(1)
    expect(call.setExpanded).toHaveBeenCalledWith(true)
    expect(call.leave).toHaveBeenCalledTimes(1)
  })

  it("trình duyệt không có getDisplayMedia (điện thoại): không có nút chia sẻ màn hình", () => {
    renderBar(callApi({ canShare: false }))
    expect(screen.queryByRole("button", { name: /Chia sẻ màn hình/ })).toBeNull()
    expect(screen.getByRole("button", { name: "Tắt mic" })).toBeTruthy()
  })

  it("mic đang tắt hiện 'Bật mic'; ai đang nói và ai tắt mic có dấu hiệu riêng", () => {
    const call = callApi({
      people: [
        person("u1", { me: true, connection: "self", media: { audio: false, video: false, screen: false } }),
        person("u2", { speaking: true }),
        person("u3", { media: { audio: false, video: false, screen: false } }),
      ],
      count: 3,
    })
    renderBar(call)
    expect(screen.getByRole("button", { name: "Bật mic" })).toBeTruthy()
    const chips = screen.getAllByTestId("flashback-call-person")
    expect(chips.map((chip) => chip.getAttribute("data-speaking"))).toEqual(["false", "true", "false"])
    expect(within(chips[1]).getByText(/Tên u2, đang nói/)).toBeTruthy()
    expect(within(chips[2]).getByText(/đã tắt mic/)).toBeTruthy()
  })

  it("mở rộng: màn hình đang chia sẻ hiện lớn, mỗi người có nút tắt tiếng riêng", () => {
    const call = callApi({
      expanded: true,
      screenSharerId: "u2",
      people: [person("u1", { me: true, connection: "self" }), person("u2", { media: { audio: true, video: false, screen: true } })],
    })
    renderBar(call)
    const screenBox = screen.getByTestId("flashback-call-screen")
    expect(within(screenBox).getByText("Màn hình của Tên u2")).toBeTruthy()
    expect(screenBox.querySelector("video")).not.toBeNull()
    const tiles = screen.getAllByTestId("flashback-call-tile")
    expect(tiles).toHaveLength(2)
    // Mình không có nút tắt tiếng chính mình.
    expect(within(tiles[0]).queryByTestId("flashback-call-peer-mute")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Tắt tiếng Tên u2" }))
    expect(call.setPeerMuted).toHaveBeenCalledWith("u2", true)
    expect(screen.getByRole("button", { name: "Thu gọn cuộc gọi" })).toBeTruthy()
  })

  it("người đã bị mình tắt tiếng: nút đổi thành Bật tiếng và phần tử audio bị tắt", () => {
    renderBar(callApi({ expanded: true, people: [person("u1", { me: true, connection: "self" }), person("u2", { muted: true })] }))
    expect(screen.getByRole("button", { name: "Bật tiếng Tên u2" })).toBeTruthy()
    expect(document.querySelector("audio")?.getAttribute("data-muted")).toBe("true")
  })

  it("thu gọn mà có người chia sẻ: có dòng mời xem", () => {
    const call = callApi({
      screenSharerId: "u2",
      people: [person("u1", { me: true, connection: "self" }), person("u2", { media: { audio: true, video: false, screen: true } })],
    })
    renderBar(call)
    fireEvent.click(screen.getByTestId("flashback-call-watch"))
    expect(call.setExpanded).toHaveBeenCalledWith(true)
  })

  it("mình đang chia sẻ trong ván: một dòng cảnh báo lộ thông tin với người chơi khác", () => {
    const people = [person("u1", { me: true, connection: "self", media: { audio: true, video: false, screen: true } }), person("u2")]
    const { unmount } = renderBar(callApi({ people, screenSharerId: "u1" }), true)
    expect(screen.getByTestId("flashback-call-sharing").textContent).toBe(CALL_TEXT.screenWarning)
    unmount()
    renderBar(callApi({ people, screenSharerId: "u1" }), false)
    expect(screen.getByTestId("flashback-call-sharing").textContent).not.toMatch(/lộ thông tin/)
  })

  it("người mất kết nối được ghi rõ trong ô", () => {
    renderBar(callApi({ expanded: true, people: [person("u1", { me: true, connection: "self" }), person("u2", { connection: "failed" })] }))
    expect(screen.getByText("Mất kết nối")).toBeTruthy()
  })

  it("không dùng dấu gạch dài trong chữ hiển thị", () => {
    const { container } = renderBar(callApi({ expanded: true }))
    expect(container.textContent ?? "").not.toMatch(/[—–]/)
  })
})
