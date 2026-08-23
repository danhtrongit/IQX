import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { NhanDinhKetsoBlock, mergeNhanDinhCap6, type NhanDinhKetsoCap6 } from "./NhanDinhKetsoBlock"
import type { KehoachMauThuanCap6 } from "./mauThuanTypes"

/**
 * ★★ HỢP ĐỒNG GIỮA KẾT SỔ CẤP 6 VÀ SERVER ★★
 *
 * Khối "nhận định có khớp hành động không" đọc `GET /cap6/kehoach/{order_id}`.
 * Bộ bài này ghim BA thứ đã từng sai và sẽ sai lại nếu không canh:
 *
 * 1. **Tên trường.** Bản đầu đoán `pct_von`; server trả `khoi_luong_pct_von`.
 *    TypeScript bắt được ca đó, nhưng chỉ vì fixture có gõ kiểu — một hàng đọc
 *    `any` từ `api.get` thì lệch tên là im lặng vẽ "chưa biết".
 *
 * 2. **`nhat_quan` của SERVER thắng luật suy ở client.** Hai bên định nghĩa
 *    "mua nhỏ" KHÁC NHAU: server so `khoi_luong_pct_von` với trần khẩu vị Thận
 *    trọng (10%), `lechNhanDinhHanhDong` so MỨC TỰ TIN. Một user khẩu vị «Tấn
 *    công» chọn tự tin ⭐ Thấp vẫn mua 30% vốn ⇒ server "lệch", client "không
 *    lệch". Nếu Kết sổ tự suy thì nó khen user nhất quán trong khi cổng tốt
 *    nghiệp đang KHÔNG đếm lệnh đó — hai màn nói khác nhau về cùng một lệnh.
 *
 * 3. **`had_conflict == null` KHÁC `=== false`.** `false` = server khẳng định
 *    lệnh không có mâu thuẫn ⇒ bỏ khối. `null` = server chưa chấm được mã ⇒
 *    KHÔNG biết ⇒ giữ ảnh chụp của bus. Gộp hai ca bằng `!had_conflict` là đọc
 *    "chưa biết" thành "không có" và xoá mất khối của một lệnh đáng lẽ có.
 */

const LOCAL: NhanDinhKetsoCap6 = {
  pheUngHo: ["ky_thuat", "dong_tien"],
  pheNguoc: ["noi_bo", "tin_tuc"],
  conflictLevel: "nghiem",
  lopPhuQuyetXau: ["noi_bo"],
  pctVon: null,
  mucTuTin: 1,
}

function wire(overrides: Partial<KehoachMauThuanCap6> = {}): KehoachMauThuanCap6 {
  return {
    order_id: "order-1",
    had_conflict: true,
    conflict_level: "nghiem",
    had_veto: true,
    veto_layers: ["noi_bo"],
    khoi_luong_pct_von: 30,
    muc_tu_tin: 1,
    nhat_quan: false,
    ...overrides,
  }
}

describe("mergeNhanDinhCap6 — hàng của server thắng ảnh chụp của bus", () => {
  it("★ đọc `khoi_luong_pct_von` (KHÔNG phải `pct_von`)", () => {
    const r = mergeNhanDinhCap6(LOCAL, wire({ khoi_luong_pct_von: 27 }))
    expect(r?.pctVon).toBe(27)
  })

  it("★★ mang theo phán quyết `nhat_quan` của server", () => {
    expect(mergeNhanDinhCap6(LOCAL, wire({ nhat_quan: false }))?.nhatQuanServer).toBe(false)
    expect(mergeNhanDinhCap6(LOCAL, wire({ nhat_quan: true }))?.nhatQuanServer).toBe(true)
    expect(mergeNhanDinhCap6(LOCAL, wire({ nhat_quan: null }))?.nhatQuanServer).toBeNull()
  })

  it("★ `had_conflict === false` → bỏ hẳn khối (không dựng khối rỗng)", () => {
    expect(mergeNhanDinhCap6(LOCAL, wire({ had_conflict: false }))).toBeNull()
  })

  it("★★ `had_conflict === null` (chưa chấm được mã) → GIỮ ảnh chụp, KHÔNG bỏ khối", () => {
    const r = mergeNhanDinhCap6(LOCAL, wire({ had_conflict: null }))
    expect(r).not.toBeNull()
    expect(r?.conflictLevel).toBe("nghiem")
  })

  it("chưa đọc được hàng (query đang chạy / 404 / mất mạng) → trả lại y nguyên ảnh chụp", () => {
    expect(mergeNhanDinhCap6(LOCAL, undefined)).toEqual(LOCAL)
    expect(mergeNhanDinhCap6(LOCAL, null)).toEqual(LOCAL)
  })
})

describe("NhanDinhKetsoBlock — phán quyết server thắng luật suy ở client", () => {
  /**
   * Ca bất đồng THẬT, không phải giả định: khẩu vị «Tấn công» (trần 30%) +
   * tự tin ⭐ Thấp ⇒ `lechNhanDinhHanhDong("nghiem", 1) === false` ("không
   * lệch"), nhưng 30% vốn > trần Thận trọng 10% nên server trả
   * `nhat_quan: false` ("lệch"). Màn phải theo server.
   */
  it("★★★ tự tin ⭐ Thấp nhưng mua 30% vốn: server nói LỆCH thì màn phải nói lệch", () => {
    const merged = mergeNhanDinhCap6(LOCAL, wire({ muc_tu_tin: 1, khoi_luong_pct_von: 30, nhat_quan: false }))
    render(<NhanDinhKetsoBlock nhanDinh={merged!} pnlPct={-6.3} />)

    // Neo dương tính: khối thật sự render (không có nó thì mọi `not.toContain`
    // dưới đây xanh vô điều kiện).
    expect(screen.getByTestId("cap6-ketso-nhandinh")).toBeInTheDocument()
    expect(document.body.textContent).toMatch(/lệch|chưa tương xứng|nghĩ một đằng/i)
  })

  it("★ server nói NHẤT QUÁN thì màn không dựng cảnh báo lệch", () => {
    const merged = mergeNhanDinhCap6(LOCAL, wire({ muc_tu_tin: 3, khoi_luong_pct_von: 5, nhat_quan: true }))
    render(<NhanDinhKetsoBlock nhanDinh={merged!} pnlPct={2.1} />)

    expect(screen.getByTestId("cap6-ketso-nhandinh")).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/nghĩ một đằng, làm một nẻo/i)
  })
})
