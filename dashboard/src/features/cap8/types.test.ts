import { describe, expect, it } from "vitest"

/**
 * Cấp 8 «Quản trị rủi ro danh mục» — the two pure rules FE1 owns.
 *
 * ★ `hanhViCanhBaoToSend` is the single most load-bearing function in this task.
 * The backend REJECTS (400) `khong_canh_bao` when a warning fired, and rejects
 * `van_mua`/`giam_kl`/`chon_ma_khac` when none did. Getting it wrong produces a
 * spurious 400 on EVERY clean order — see `backend/app/services/cap8/service.py`
 * `record_kehoach`'s two `BadRequestError` branches.
 */

import {
  LO_CO_PHIEU,
  countCap8TasksDone,
  giamKhoiLuong,
  hanhViCanhBaoToSend,
  type Cap8Progress,
} from "./types"

describe("hanhViCanhBaoToSend — phải khớp với thứ THẬT SỰ bật (server 400 nếu lệch)", () => {
  it("KHÔNG cảnh báo nào → 'khong_canh_bao', dù user đã bấm nút nào trước đó", () => {
    expect(hanhViCanhBaoToSend(false, null)).toBe("khong_canh_bao")
    // Một lựa chọn còn sót từ mã trước KHÔNG được biến lệnh sạch thành mâu thuẫn.
    expect(hanhViCanhBaoToSend(false, "van_mua")).toBe("khong_canh_bao")
    expect(hanhViCanhBaoToSend(false, "giam_kl")).toBe("khong_canh_bao")
    expect(hanhViCanhBaoToSend(false, "chon_ma_khac")).toBe("khong_canh_bao")
    expect(hanhViCanhBaoToSend(false, "khong_canh_bao")).toBe("khong_canh_bao")
  })

  it("CÓ cảnh báo → gửi đúng nút user bấm", () => {
    expect(hanhViCanhBaoToSend(true, "van_mua")).toBe("van_mua")
    expect(hanhViCanhBaoToSend(true, "giam_kl")).toBe("giam_kl")
    expect(hanhViCanhBaoToSend(true, "chon_ma_khac")).toBe("chon_ma_khac")
  })

  it("★ CÓ cảnh báo mà user không bấm gì (mua thẳng) → 'van_mua', KHÔNG PHẢI 'khong_canh_bao'", () => {
    // Đây là ca hay gặp nhất: cảnh báo hiện, user bấm luôn MUA. Gửi
    // 'khong_canh_bao' ở đây là nói dối server và bị từ chối 400.
    expect(hanhViCanhBaoToSend(true, null)).toBe("van_mua")
  })

  it("★ CÓ cảnh báo mà state là 'khong_canh_bao' (rác từ lệnh trước) → 'van_mua'", () => {
    expect(hanhViCanhBaoToSend(true, "khong_canh_bao")).toBe("van_mua")
  })

  it("mọi đầu ra đều là 1 trong 4 giá trị server chấp nhận", () => {
    const hopLe = ["van_mua", "giam_kl", "chon_ma_khac", "khong_canh_bao"]
    for (const co of [true, false]) {
      for (const chon of [null, "van_mua", "giam_kl", "chon_ma_khac", "khong_canh_bao"] as const) {
        expect(hopLe).toContain(hanhViCanhBaoToSend(co, chon))
      }
    }
  })
})

describe("giamKhoiLuong — giảm một nửa, vẫn tôn trọng lô 100 của Cấp 3", () => {
  it("lô 100 là hằng số của sàn", () => {
    expect(LO_CO_PHIEU).toBe(100)
  })

  it("giảm còn một nửa khi nửa đó tròn lô", () => {
    expect(giamKhoiLuong(1000)).toBe(500)
    expect(giamKhoiLuong(400)).toBe(200)
  })

  it("★ làm tròn XUỐNG về bội số 100 — không bao giờ trả về lô lẻ", () => {
    expect(giamKhoiLuong(250)).toBe(100) // 125 → 100
    expect(giamKhoiLuong(300)).toBe(100) // 150 → 100
    expect(giamKhoiLuong(1500)).toBe(700) // 750 → 700
    expect(giamKhoiLuong(700) % 100).toBe(0)
  })

  it("★ không bao giờ xuống dưới 1 lô (100) — giảm không được biến thành lệnh không đặt được", () => {
    expect(giamKhoiLuong(100)).toBe(100)
    expect(giamKhoiLuong(150)).toBe(100)
    expect(giamKhoiLuong(0)).toBe(100)
    expect(giamKhoiLuong(-500)).toBe(100)
    expect(giamKhoiLuong(Number.NaN)).toBe(100)
  })
})

describe("countCap8TasksDone", () => {
  const base = {
    task_1_done_at: null,
    task_2_done_at: null,
    task_3_done_at: null,
  } as unknown as Cap8Progress

  it("null/undefined → 0", () => {
    expect(countCap8TasksDone(null)).toBe(0)
    expect(countCap8TasksDone(undefined)).toBe(0)
  })

  it("đếm đúng số mốc đã có thời điểm", () => {
    expect(countCap8TasksDone(base)).toBe(0)
    expect(countCap8TasksDone({ ...base, task_1_done_at: "2026-08-01T00:00:00Z" })).toBe(1)
    expect(
      countCap8TasksDone({
        ...base,
        task_1_done_at: "2026-08-01T00:00:00Z",
        task_3_done_at: "2026-08-01T00:00:00Z",
      }),
    ).toBe(2)
  })
})
