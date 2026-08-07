import { render, screen, fireEvent } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { PlacementModal, type PlacementAnswer } from "./PlacementModal"

/**
 * Câu hỏi xếp lớp §3 (spec v3.0) — 3 lựa chọn thay cho 2 nút cũ, và bài quiz
 * 5 phút đã bị bỏ. Trần xếp lớp bị KẸP xuống Cấp 1 trong lúc Cấp 2-8 tạm tắt,
 * nên copy TUYỆT ĐỐI không được hứa một Cấp 2 mà user không tới được.
 */
describe("PlacementModal — câu hỏi xếp lớp §3 (v3.0)", () => {
  const onChoose = vi.fn()

  beforeEach(() => {
    onChoose.mockReset()
  })

  function renderModal() {
    return render(<PlacementModal visible onChoose={onChoose} />)
  }

  it("asks the v3.0 question VERBATIM (not the old «Bạn đã từng mua cổ phiếu chưa?»)", () => {
    renderModal()
    expect(
      screen.getByText("Bạn đã từng mua bán cổ phiếu thật bao giờ chưa?"),
    ).toBeInTheDocument()
    expect(screen.queryByText("Bạn đã từng mua cổ phiếu chưa?")).not.toBeInTheDocument()
  })

  it("offers the THREE spec §3 answers", () => {
    renderModal()
    expect(screen.getByTestId("cap0-placement-never")).toHaveTextContent("Chưa bao giờ")
    expect(screen.getByTestId("cap0-placement-unsure")).toHaveTextContent(
      "Có, nhưng chưa tự tin",
    )
    expect(screen.getByTestId("cap0-placement-regular")).toHaveTextContent(
      "Có, giao dịch thường xuyên",
    )
    expect(screen.getAllByRole("button")).toHaveLength(3)
  })

  it("drops the removed 5-minute quiz option (v3.0 deleted it)", () => {
    renderModal()
    expect(screen.queryByText(/bài xếp lớp 5 phút/i)).not.toBeInTheDocument()
    expect(screen.queryByText("Đã từng")).not.toBeInTheDocument()
    expect(screen.queryByText("Chưa từng")).not.toBeInTheDocument()
  })

  // ★★ Trần = Cấp 1. Không được vẽ ra một Cấp 2 chưa mở.
  it("★ the third option's copy NEVER claims a Cấp 2 the user cannot reach", () => {
    renderModal()
    expect(screen.getByTestId("cap0-placement-regular")).not.toHaveTextContent(/Cấp\s*2/)
  })

  it("★ no option anywhere in the modal promises Cấp 2 (or higher)", () => {
    renderModal()
    // Arco portals the Modal out of RTL's `container`, so read the real
    // rendered options node — `container.textContent` here would be empty and
    // the assertion vacuous.
    const opts = document.querySelector(".cap0-placement-opts")
    expect(opts).not.toBeNull()
    expect(opts?.textContent ?? "").not.toMatch(/Cấp\s*[2-8]/)
  })

  it("★ names Cấp 1 «Học việc» as the ceiling on both «đã từng giao dịch» options", () => {
    renderModal()
    expect(screen.getByTestId("cap0-placement-unsure")).toHaveTextContent(/Cấp 1 «Học việc»/)
    expect(screen.getByTestId("cap0-placement-regular")).toHaveTextContent(/Cấp 1 «Học việc»/)
  })

  it("★ routes each of the three options to the level it names", () => {
    renderModal()
    const cases: Array<[string, PlacementAnswer]> = [
      ["cap0-placement-never", "never"],
      ["cap0-placement-unsure", "unsure"],
      ["cap0-placement-regular", "regular"],
    ]
    for (const [testId, answer] of cases) {
      onChoose.mockReset()
      fireEvent.click(screen.getByTestId(testId))
      expect(onChoose).toHaveBeenCalledTimes(1)
      expect(onChoose).toHaveBeenCalledWith(answer)
    }
  })

  it("stays non-dismissable — the user must pick one of the three", () => {
    renderModal()
    // Arco renders no close button / footer when closable+footer are off.
    expect(document.querySelector(".arco-modal-close-icon")).toBeNull()
    expect(document.querySelector(".arco-modal-footer")).toBeNull()
  })
})
