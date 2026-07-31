import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import React, { useEffect } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { dungNgoaiAsync, messageSuccess, messageError } = vi.hoisted(() => ({
  dungNgoaiAsync: vi.fn(),
  messageSuccess: vi.fn(),
  messageError: vi.fn(),
}))

vi.mock("./hooks", () => ({
  useDungNgoai: () => ({ mutateAsync: dungNgoaiAsync, isPending: false }),
}))
vi.mock("@/shared/http/client", () => ({
  getErrorMessage: (_err: unknown, fallback: string) => Promise.resolve(fallback),
}))
vi.mock("@arco-design/web-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@arco-design/web-react")>()
  return {
    ...actual,
    Message: { ...actual.Message, success: messageSuccess, error: messageError },
  }
})

import { DungNgoaiButton } from "./DungNgoaiButton"
import { Cap5Provider, useCap5Events } from "./Cap5Context"
import type { LyDoDungNgoai } from "./types"

/** Đăng ký handler lên bus THẬT (không mock context) rồi render nút. */
function Harness({ onDungNgoai }: { onDungNgoai: (s: string, r: LyDoDungNgoai) => void }) {
  const bus = useCap5Events()
  useEffect(() => {
    bus.registerHandlers({ onDungNgoai })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return <DungNgoaiButton symbol="VNM" />
}

function renderButton(onDungNgoai = vi.fn()) {
  render(
    <Cap5Provider>
      <Harness onDungNgoai={onDungNgoai} />
    </Cap5Provider>,
  )
  return onDungNgoai
}

const OPEN_LABEL = "🚫 Tôi đứng ngoài mã này hôm nay"
const SUBMIT_LABEL = "Ghi quyết định đứng ngoài"

beforeEach(() => {
  dungNgoaiAsync.mockReset()
  dungNgoaiAsync.mockResolvedValue({ so_lan: 1 })
  messageSuccess.mockReset()
  messageError.mockReset()
})

describe("DungNgoaiButton — nút + form 5 lý do (spec §5)", () => {
  it("hiện nút, form ẩn tới khi bấm", () => {
    renderButton()
    expect(screen.getByText(OPEN_LABEL)).toBeInTheDocument()
    expect(screen.queryByTestId("cap5-dungngoai-form")).not.toBeInTheDocument()
  })

  it("bấm nút → form hỏi vì sao KHÔNG mua mã này + đúng 5 lý do của spec", () => {
    renderButton()
    fireEvent.click(screen.getByText(OPEN_LABEL))
    const form = screen.getByTestId("cap5-dungngoai-form")
    expect(form.textContent).toMatch(/Vì sao bạn KHÔNG mua VNM lúc này/)
    expect(screen.getByText("Chưa đủ cơ sở (lớp chưa ủng hộ)")).toBeInTheDocument()
    expect(screen.getByText("Định giá đang đắt")).toBeInTheDocument()
    expect(screen.getByText("Chờ vùng mua tốt hơn")).toBeInTheDocument()
    expect(screen.getByText("Dữ liệu ngược chiều — rủi ro cao")).toBeInTheDocument()
    expect(screen.getByText("Đã đủ vị thế nhóm này")).toBeInTheDocument()
  })

  it("nút ghi bị chặn tới khi chọn 1 lý do", () => {
    renderButton()
    fireEvent.click(screen.getByText(OPEN_LABEL))
    expect(screen.getByText(SUBMIT_LABEL).closest("button")).toBeDisabled()
    fireEvent.click(screen.getByTestId("cap5-dungngoai-ly-do-dinh_gia_dat"))
    expect(screen.getByText(SUBMIT_LABEL).closest("button")).not.toBeDisabled()
  })

  it("ghi quyết định → POST đúng lý do đã chọn, form đóng lại", async () => {
    renderButton()
    fireEvent.click(screen.getByText(OPEN_LABEL))
    fireEvent.click(screen.getByTestId("cap5-dungngoai-ly-do-cho_vung_mua_tot_hon"))
    fireEvent.click(screen.getByText(SUBMIT_LABEL))

    await waitFor(() => expect(dungNgoaiAsync).toHaveBeenCalledTimes(1))
    expect(dungNgoaiAsync).toHaveBeenCalledWith({
      symbol: "VNM",
      reason: "cho_vung_mua_tot_hon",
    })
    await waitFor(() =>
      expect(screen.queryByTestId("cap5-dungngoai-form")).not.toBeInTheDocument(),
    )
  })

  it("toast nói RÕ sau 5 phiên hệ sẽ cho biết né đúng hay né hụt", async () => {
    renderButton()
    fireEvent.click(screen.getByText(OPEN_LABEL))
    fireEvent.click(screen.getByTestId("cap5-dungngoai-ly-do-dinh_gia_dat"))
    fireEvent.click(screen.getByText(SUBMIT_LABEL))

    await waitFor(() => expect(messageSuccess).toHaveBeenCalledTimes(1))
    const toast = String(messageSuccess.mock.calls[0][0])
    expect(toast).toMatch(/5 phiên/)
    expect(toast).toMatch(/né đúng|đúng hay hụt|đúng hay né hụt/i)
  })

  it("fires cap5Events.onDungNgoai với mã + lý do đã chọn", async () => {
    const onDungNgoai = renderButton()
    fireEvent.click(screen.getByText(OPEN_LABEL))
    fireEvent.click(screen.getByTestId("cap5-dungngoai-ly-do-du_vi_the_nhom"))
    fireEvent.click(screen.getByText(SUBMIT_LABEL))

    await waitFor(() => expect(onDungNgoai).toHaveBeenCalledWith("VNM", "du_vi_the_nhom"))
  })

  it("KHÔNG thưởng số lượng: form nhắc đứng ngoài chỉ cần có chủ đích", () => {
    renderButton()
    fireEvent.click(screen.getByText(OPEN_LABEL))
    expect(screen.getByTestId("cap5-dungngoai-note").textContent).toMatch(
      /không.*(nhiều|số lượng)/i,
    )
  })

  it("lỗi server → báo lỗi, form còn mở, KHÔNG bắn event", async () => {
    dungNgoaiAsync.mockRejectedValueOnce(new Error("boom"))
    const onDungNgoai = renderButton()
    fireEvent.click(screen.getByText(OPEN_LABEL))
    fireEvent.click(screen.getByTestId("cap5-dungngoai-ly-do-chua_du_co_so"))
    fireEvent.click(screen.getByText(SUBMIT_LABEL))

    await waitFor(() => expect(messageError).toHaveBeenCalledTimes(1))
    expect(screen.getByTestId("cap5-dungngoai-form")).toBeInTheDocument()
    expect(onDungNgoai).not.toHaveBeenCalled()
    expect(messageSuccess).not.toHaveBeenCalled()
  })
})
