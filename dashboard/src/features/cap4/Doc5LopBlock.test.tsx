import { fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Doc5LopBlock } from "./Doc5LopBlock"
import { isDoc5LopComplete, LOP_KEYS } from "./doc5Lop"
import type { Lop5Partial, NhanDinhLop } from "./types"

const reading = vi.hoisted(() => ({ pending: false, waiting: false, failed: false, missing: [] as string[] }))
const AI = { ky_thuat: "ok", dong_tien: "neu", noi_bo: "bad", tin_tuc: "ok", dinh_gia: "ok" } as const
vi.mock("@/features/journey-identity/hooks", () => ({
  useLearningReading: (_symbol: string, answers: Lop5Partial) => {
    const rows = Object.fromEntries(LOP_KEYS.map(key => [key, { lines: key === "ky_thuat" ? ["Xu hướng: Tăng", "Hỗ trợ: 59,500"] : key === "dinh_gia" ? ["Vùng giá trị: 80 – 120", "Trung vị (giá hợp lý): 100"] : ["Dữ liệu của lớp"], degraded: reading.missing.includes(key) }]))
    const complete = isDoc5LopComplete(answers)
    const ai = Object.fromEntries(LOP_KEYS.filter(key => !reading.missing.includes(key)).map(key => [key, AI[key]]))
    const reveal = complete && !reading.waiting && !reading.pending && !reading.failed
    return { dataset: { isPending: reading.pending, data: { readings: rows } },
      reveal: { data: reveal ? { readings: rows, ai_answers: ai } : undefined },
      aiAnswers: complete && (reveal || reading.failed) ? Object.fromEntries(LOP_KEYS.map(key => [key, reading.failed ? "neu" : ai[key] ?? "neu"])) : null,
      settledFailure: reading.failed }
  },
}))
function Harness({ initial = {}, onAi5Lop = vi.fn() }: { initial?: Lop5Partial; onAi5Lop?: (value: Lop5Partial) => void }) {
  const [answers, setAnswers] = useState(initial)
  return <Doc5LopBlock symbol="VNM" currentPrice={90} doc5Lop={answers}
    onRate={(key, value) => setAnswers(previous => ({ ...previous, [key]: value }))} onAi5Lop={onAi5Lop} />
}
function rateAll(value: NhanDinhLop) {
  for (const key of LOP_KEYS) fireEvent.click(screen.getByTestId(`cap4-rate-${key}-${value}`))
}
beforeEach(() => Object.assign(reading, { pending: false, waiting: false, failed: false, missing: [] }))

describe("five-layer form with committed server evidence", () => {
  it("preserves all five rows, fifteen choices and the numbered plan heading", () => {
    render(<Harness />)
    for (const key of LOP_KEYS) for (const value of ["ok", "neu", "bad"]) expect(screen.getByTestId(`cap4-rate-${key}-${value}`)).toBeInTheDocument()
    expect(screen.getByText(/^1\. Đọc 5 lớp/)).toBeInTheDocument()
  })
  it("shows evidence up front without verdict or previous-session captions", () => {
    render(<Harness />)
    expect(screen.getByText("Xu hướng: Tăng")).toBeInTheDocument()
    expect(screen.getByText("Hỗ trợ: 59,500")).toBeInTheDocument()
    expect(screen.getByText("Vùng giá trị: 80 – 120")).toBeInTheDocument()
    expect(screen.queryByText(/So với phiên trước|Trạng thái: Mạnh/)).not.toBeInTheDocument()
  })
  it("keeps every AI cell hidden before all five answers", () => {
    render(<Harness initial={{ ky_thuat: "ok", dong_tien: "ok", noi_bo: "neu", tin_tuc: "bad" }} />)
    for (const key of LOP_KEYS) expect(screen.queryByTestId(`cap4-ai-${key}`)).not.toBeInTheDocument()
    expect(screen.getByText("Đã chấm 4/5 lớp")).toBeInTheDocument()
  })
  it("shows selected choices and keeps them editable", () => {
    render(<Harness />)
    fireEvent.click(screen.getByTestId("cap4-rate-noi_bo-bad"))
    expect(screen.getByTestId("cap4-rate-noi_bo-bad")).toHaveAttribute("aria-pressed", "true")
    fireEvent.click(screen.getByTestId("cap4-rate-noi_bo-ok"))
    expect(screen.getByTestId("cap4-rate-noi_bo-bad")).toHaveAttribute("aria-pressed", "false")
  })
  it("waits for committed evidence and reveal even with five answers", () => {
    reading.waiting = true
    const onAi = vi.fn()
    render(<Harness onAi5Lop={onAi} />)
    rateAll("ok")
    expect(screen.getByText("Đang lưu bản tự chấm và tải AI đối chiếu…")).toBeInTheDocument()
    expect(onAi).not.toHaveBeenCalled()
    expect(screen.queryByTestId("cap4-ai-ky_thuat")).not.toBeInTheDocument()
  })
  it("reveals only the server's returned per-layer assessment", () => {
    const onAi = vi.fn()
    render(<Harness onAi5Lop={onAi} />)
    expect(onAi).not.toHaveBeenCalled()
    rateAll("ok")
    expect(onAi).toHaveBeenCalledWith(AI)
    expect(screen.getByTestId("cap4-ai-ky_thuat")).toHaveTextContent("✓ Cùng góc nhìn với AI")
    expect(screen.getByTestId("cap4-ai-noi_bo")).toHaveTextContent("↔ Góc nhìn khác AI")
  })
  it("retains neutral mismatch styling and count provenance", () => {
    render(<Harness />)
    rateAll("ok")
    expect(screen.getByTestId("cap4-ai-noi_bo")).toHaveClass("cap4-ai-cell--khac")
    expect(screen.getByTestId("cap4-dongthuan-summary")).toHaveTextContent("Điểm đồng thuận 3/5 · Cùng góc nhìn AI 3/5")
    expect(screen.getByTestId("cap4-dongthuan-provenance")).toHaveTextContent("3/5 lớp AI đánh giá Ủng hộ")
    expect(screen.getByTestId("cap4-doc5lop").textContent).not.toMatch(/bạn sai|bạn đúng|đúng\/sai/i)
  })
  it.each(LOP_KEYS)("missing %s remains unavailable instead of claiming a neutral verdict", key => {
    reading.missing = [key]
    render(<Harness />)
    rateAll("ok")
    expect(screen.getByTestId(`cap4-ai-${key}`)).toHaveTextContent("Chưa có dữ liệu lớp này để đối chiếu")
  })
  it("does not turn an evidence failure into a new learning gate", () => {
    reading.failed = true
    const onAi = vi.fn()
    render(<Harness onAi5Lop={onAi} />)
    rateAll("bad")
    expect(screen.getByRole("status")).toHaveTextContent("bản này chưa được dùng để xác định Linh thú")
    expect(onAi).not.toHaveBeenCalled()
    expect(screen.queryByTestId("cap4-ai-locked")).not.toBeInTheDocument()
    expect(screen.getByTestId("cap4-ai-unavailable")).toHaveTextContent(
      "bạn có thể tiếp tục đặt lệnh",
    )
  })
  it("keeps choices available while the dataset loads", () => {
    reading.pending = true
    render(<Harness />)
    expect(screen.getAllByText("Đang tải dữ liệu lớp…")).toHaveLength(5)
    fireEvent.click(screen.getByTestId("cap4-rate-ky_thuat-ok"))
    expect(screen.getByTestId("cap4-rate-ky_thuat-ok")).toHaveAttribute("aria-pressed", "true")
  })
})
