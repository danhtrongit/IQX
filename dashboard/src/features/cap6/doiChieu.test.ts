import { describe, expect, it } from "vitest"
import type { Lop5Map, Lop5Partial } from "@/features/cap4/types"
import { coMauThuan, isDoiChieuValid, lopNguocChieu, lopUngHo } from "./doiChieu"

/**
 * Cấp 6 «Đối chiếu» — the PURE conflict rules (spec §4).
 *
 * The trigger, the two lists and the cổng-cứng predicate live here so the panel
 * block can be tested without React, and so the ONE rule the whole cấp turns on
 * ("≥1 Ủng hộ AND ≥1 Ngược chiều") is pinned by name.
 */

const CONFLICT: Lop5Map = {
  ky_thuat: "ok",
  dong_tien: "ok",
  noi_bo: "neu",
  tin_tuc: "neu",
  dinh_gia: "bad",
}

describe("coMauThuan — điều kiện hiện bước Đối chiếu (spec §4)", () => {
  it("true khi có ≥1 lớp Ủng hộ VÀ ≥1 lớp Ngược chiều", () => {
    expect(coMauThuan(CONFLICT)).toBe(true)
  })

  it("false khi mọi lớp cùng chiều Ủng hộ (không có lớp ngược)", () => {
    expect(
      coMauThuan({
        ky_thuat: "ok",
        dong_tien: "ok",
        noi_bo: "ok",
        tin_tuc: "ok",
        dinh_gia: "ok",
      }),
    ).toBe(false)
  })

  it("false khi mọi lớp Ngược chiều (không có lớp ủng hộ)", () => {
    expect(
      coMauThuan({
        ky_thuat: "bad",
        dong_tien: "bad",
        noi_bo: "bad",
        tin_tuc: "bad",
        dinh_gia: "bad",
      }),
    ).toBe(false)
  })

  it("false khi chỉ toàn trung tính — trung tính KHÔNG phải mâu thuẫn", () => {
    expect(
      coMauThuan({
        ky_thuat: "neu",
        dong_tien: "neu",
        noi_bo: "neu",
        tin_tuc: "neu",
        dinh_gia: "neu",
      }),
    ).toBe(false)
  })

  it("true ngay khi đúng 1 Ủng hộ + 1 Ngược chiều, các lớp khác chưa chấm", () => {
    expect(coMauThuan({ ky_thuat: "ok", dinh_gia: "bad" })).toBe(true)
  })

  it("false với map rỗng / null / undefined", () => {
    expect(coMauThuan({})).toBe(false)
    expect(coMauThuan(null)).toBe(false)
    expect(coMauThuan(undefined)).toBe(false)
  })

  it("bỏ qua giá trị lạ (không coi là Ủng hộ hay Ngược chiều)", () => {
    const bad = { ky_thuat: "wat", dinh_gia: "bad" } as unknown as Lop5Partial
    expect(coMauThuan(bad)).toBe(false)
  })
})

describe("lopUngHo / lopNguocChieu — hai phía của mâu thuẫn (spec §4)", () => {
  it("trả về đúng các lớp mỗi phía, theo thứ tự chuẩn LOP_KEYS", () => {
    expect(lopUngHo(CONFLICT)).toEqual(["ky_thuat", "dong_tien"])
    expect(lopNguocChieu(CONFLICT)).toEqual(["dinh_gia"])
  })

  it("giữ thứ tự chuẩn LOP_KEYS bất kể thứ tự khoá lúc chấm", () => {
    const scrambled: Lop5Partial = {
      dinh_gia: "ok",
      noi_bo: "ok",
      ky_thuat: "ok",
      tin_tuc: "bad",
      dong_tien: "bad",
    }
    // canonical: ky_thuat · dong_tien · noi_bo · tin_tuc · dinh_gia
    expect(lopUngHo(scrambled)).toEqual(["ky_thuat", "noi_bo", "dinh_gia"])
    expect(lopNguocChieu(scrambled)).toEqual(["dong_tien", "tin_tuc"])
  })

  it("KHÔNG tính lớp trung tính vào phía nào", () => {
    const all = [...lopUngHo(CONFLICT), ...lopNguocChieu(CONFLICT)]
    expect(all).not.toContain("noi_bo")
    expect(all).not.toContain("tin_tuc")
  })

  it("rỗng với map rỗng / null", () => {
    expect(lopUngHo({})).toEqual([])
    expect(lopNguocChieu(null)).toEqual([])
    expect(lopUngHo(undefined)).toEqual([])
  })
})

describe("isDoiChieuValid — cổng cứng khi có mâu thuẫn (spec §4)", () => {
  it("true khi đã chọn lớp quyết định VÀ ghi 1 dòng vì sao", () => {
    expect(isDoiChieuValid("dinh_gia", "Định giá rẻ hơn trung vị 20%")).toBe(true)
  })

  it("false khi chưa chọn lớp quyết định", () => {
    expect(isDoiChieuValid(null, "có lý do rồi")).toBe(false)
  })

  it("false khi lý do trống / chỉ khoảng trắng (mirror luật 422 của server)", () => {
    expect(isDoiChieuValid("dinh_gia", "")).toBe(false)
    expect(isDoiChieuValid("dinh_gia", "   ")).toBe(false)
    expect(isDoiChieuValid("dinh_gia", null)).toBe(false)
    expect(isDoiChieuValid("dinh_gia", undefined)).toBe(false)
  })

  it("false khi thiếu cả hai", () => {
    expect(isDoiChieuValid(null, "")).toBe(false)
  })

  it("KHÔNG quan tâm lớp đó có khớp gợi ý hay không — lệch gợi ý vẫn hợp lệ", () => {
    // Bất kỳ lớp nào trong 5 lớp cũng mở được cổng (spec §5: gợi ý, không phải luật).
    expect(isDoiChieuValid("ky_thuat", "tôi tin đà giá lần này")).toBe(true)
    expect(isDoiChieuValid("tin_tuc", "tin ngành vừa đổi")).toBe(true)
  })
})
