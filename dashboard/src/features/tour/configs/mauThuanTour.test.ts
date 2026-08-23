// mauThuanTour.test.ts — tour «Xử lý mâu thuẫn» (tour thứ NĂM), spec
// `demo-trading/LEVEL 6/IQX-Tour-MauThuan.md` + `IQX-Cap6-Spec.md` §10.
import { describe, expect, it } from "vitest"
import { mauThuanTour } from "./mauThuanTour"

describe("mauThuanTour config", () => {
  it("đúng 7 bước (spec §10 «7 bước»)", () => {
    expect(mauThuanTour.steps).toHaveLength(7)
  })

  it("tên config là 'mauthuan' (tiền tố analytics)", () => {
    expect(mauThuanTour.name).toBe("mauthuan")
  })

  it("đúng thứ tự 7 chặng của file tour", () => {
    expect(mauThuanTour.steps.map((s) => s.targetId ?? s.targetSelector)).toEqual([
      "tour-cap6-toancanh",
      "tour-cap6-bang",
      "tour-cap6-phuquyet",
      "tour-cap6-nhandinh",
      "tour-cap6-khoiluong",
      "tour-cap6-khongmua",
      "#toolbar-journey",
    ])
  })

  it("★ mọi bước đều neo vào một phần tử THẬT — không bước nào bịa bong bóng giữa màn", () => {
    for (const step of mauThuanTour.steps) {
      expect(step.centered).toBeFalsy()
      expect(step.targetId ?? step.targetSelector).toBeTruthy()
    }
  })

  it("target không trùng nhau", () => {
    const ids = mauThuanTour.steps.map((s) => s.targetId ?? s.targetSelector)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("mỗi bước có tiêu đề + nội dung, không có template rỗng", () => {
    for (const step of mauThuanTour.steps) {
      expect(step.title.trim().length).toBeGreaterThan(0)
      expect(step.body.trim().length).toBeGreaterThan(20)
      expect(step.body).not.toContain("{")
    }
  })

  it("tiêu đề khớp NGUYÊN VĂN 7 tiêu đề của file tour", () => {
    expect(mauThuanTour.steps.map((s) => s.title)).toEqual([
      "Khi các lớp không cùng chiều",
      "Nhìn rõ hai phe",
      "Không phải lớp nào cũng ngang nhau",
      "Tự đọc trước",
      "Để hành động khớp với nhận định",
      "Đôi khi không mua là nước đi tốt nhất",
      "Nhìn lại để trưởng thành",
    ])
  })

  it("nội dung khớp file tour ở những câu chốt", () => {
    const bodies = mauThuanTour.steps.map((s) => s.body)
    expect(bodies[1]).toContain("tách rõ hai phe")
    expect(bodies[2]).toContain("📰 Tin tức và 👤 Nội bộ")
    expect(bodies[2]).toContain("chỉ là điểm trừ")
    expect(bodies[3]).toContain("nhẹ, đáng ngại, nghiêm trọng, hay chưa rõ")
    expect(bodies[4]).toContain("Đắn đo trong đầu mà tay vẫn mua lớn")
    expect(bodies[5]).toContain("Không mua lần này")
    expect(bodies[6]).toContain("Kết sổ và Phân tích danh mục")
  })

  it("★ bước 5 nói khối lượng, KHÔNG nhắc cắt lỗ (spec §4.3)", () => {
    const all = mauThuanTour.steps.map((s) => `${s.title} ${s.body}`).join(" ")
    expect(all).toContain("khối lượng")
    expect(all).not.toContain("cắt lỗ")
  })

  it("★ KHÔNG phán mua/không mua hộ user (spec §4.1 «dạy đọc, không đọc hộ»)", () => {
    const all = mauThuanTour.steps.map((s) => `${s.title} ${s.body}`).join(" ")
    for (const tu of ["sẽ tăng", "chắc chắn", "nên mua ngay", "khuyến nghị mua", "cam kết"]) {
      expect(all).not.toContain(tu)
    }
  })

  it("★ KHÔNG hứa IQX theo dõi giá mã sau khi đứng ngoài (spec §7/§13 ngoài phạm vi)", () => {
    const all = mauThuanTour.steps.map((s) => `${s.title} ${s.body}`).join(" ")
    // Neo dương tính: bước «Không mua» THẬT SỰ có trong tour.
    expect(all).toContain("Không mua lần này")
    for (const tu of ["theo dõi giá", "xem mã đó có tăng", "bạn đã đúng hay sai"]) {
      expect(all).not.toContain(tu)
    }
  })
})
