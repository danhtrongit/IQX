import { describe, expect, it } from "vitest"
import type { CoachParamsCap1, CoachSituationCap1 } from "@/features/cap1/coachTemplateCap1"
import type { CoachSituationCap2 } from "@/features/cap2/coachTemplateCap2"
import type { CoachSituationCap3 } from "@/features/cap3/coachTemplateCap3"
import type { CoachSituationCap4 } from "@/features/cap4/coachTemplateCap4"
import type { CoachSituationCap5 } from "@/features/cap5/coachTemplateCap5"
import type { CoachSituationCap6 } from "@/features/cap6/coachTemplateCap6"
import type { CoachSituationCap7 } from "@/features/cap7/coachTemplateCap7"
import {
  composeCoachCap8,
  pickCoachCap8,
  type CoachSituationCap8,
} from "./coachTemplateCap8"

/**
 * Lớp coach thứ 8 = "cảnh báo danh mục lúc mua vs cách xử lý" (spec §6) — 4 mẫu:
 * có cảnh báo + nghe · có cảnh báo + vẫn mua + thua · có cảnh báo + vẫn mua +
 * thắng · không cảnh báo.
 *
 * ★ Ba bất biến bao trùm cả file:
 *  1. Ô "vẫn mua + thua" KHÔNG quy nhân quả — nó phải nói thẳng "Không chắc thua
 *     vì điều đó". Một câu đổ lỗi cho cảnh báo là bịa: IQX không biết vì sao lệnh
 *     đó thua.
 *  2. "Vẫn mua" KHÔNG BỊ PHẠT (§C8) — không ô nào gọi user là sai/vi phạm.
 *  3. Lệnh chưa qua bước Kiểm tra danh mục (`hanhVi === null`) → KHÔNG có đoạn
 *     coach nào, không ô nào bị đoán.
 */
const CAM_TU = ["sai lầm", "vi phạm", "bị phạt", "lẽ ra", "bạn dở", "không nên mua"]

function situation(overrides: Partial<CoachSituationCap8> = {}): CoachSituationCap8 {
  return {
    canhBaoTen: ["Dồn ngành"],
    hanhVi: "giam_kl",
    pnlPct: 5.3,
    ...overrides,
  }
}

describe("pickCoachCap8 — lệnh chưa qua bước Kiểm tra danh mục", () => {
  it("hanhVi === null → null (không đoán ô nào)", () => {
    expect(pickCoachCap8(situation({ hanhVi: null }))).toBeNull()
    expect(pickCoachCap8(situation({ hanhVi: null, canhBaoTen: null }))).toBeNull()
  })
})

describe("pickCoachCap8 — ô CÓ CẢNH BÁO + NGHE (spec §6)", () => {
  it("giam_kl → nguyên văn spec, gọi tên đúng loại cảnh báo", () => {
    const coach = pickCoachCap8(situation({ hanhVi: "giam_kl" }))!
    expect(coach.id).toBe("nghe")
    expect(coach.text).toBe(
      "Bạn thấy cảnh báo dồn ngành và điều chỉnh — đúng tinh thần phân tán. " +
        "Danh mục bạn an toàn hơn nhờ vậy.",
    )
    expect(coach.canhBao).toBe(false)
  })

  it("chon_ma_khac cũng là 'nghe' — spec §6 gộp giảm KL và đổi mã vào một ô", () => {
    const coach = pickCoachCap8(situation({ hanhVi: "chon_ma_khac" }))!
    expect(coach.id).toBe("nghe")
    expect(coach.text).toContain("đúng tinh thần phân tán")
  })

  it("nhiều cảnh báo → liệt kê ĐỦ, không rút gọn còn một loại", () => {
    const coach = pickCoachCap8(
      situation({ canhBaoTen: ["Dồn ngành", "Tương quan cao"] }),
    )!
    expect(coach.text).toContain("dồn ngành và tương quan cao")
  })

  it("hệ không ghi lại được tên cảnh báo → nói chung, KHÔNG bịa một loại", () => {
    const coach = pickCoachCap8(situation({ canhBaoTen: null }))!
    expect(coach.text).toContain("Bạn thấy cảnh báo danh mục và điều chỉnh")
    expect(coach.text).not.toContain("dồn ngành và")
  })
})

describe("pickCoachCap8 — ô CÓ CẢNH BÁO + VẪN MUA + THUA (spec §6)", () => {
  it("nguyên văn spec và KHÔNG quy nhân quả", () => {
    const coach = pickCoachCap8(
      situation({ hanhVi: "van_mua", pnlPct: -4.2, canhBaoTen: ["Dồn ngành"] }),
    )!
    expect(coach.id).toBe("van_mua_thua")
    expect(coach.text).toBe(
      "Lệnh này thua (−4.2%), và lúc mua đã có cảnh báo dồn ngành. Không chắc " +
        "thua vì điều đó — nhưng dồn ngành/tương quan cao làm cả danh mục dễ " +
        "tổn thương cùng lúc.",
    )
    // ★ Câu chống-nhân-quả là phần được nhấn — nó là bài học của ô này.
    expect(coach.nhanManh).toContain("Không chắc thua vì điều đó")
    expect(coach.canhBao).toBe(false)
  })

  it("KHÔNG có câu nào nói lệnh thua VÌ cảnh báo", () => {
    const coach = pickCoachCap8(situation({ hanhVi: "van_mua", pnlPct: -4.2 }))!
    // Bỏ đúng mệnh đề PHỦ ĐỊNH nhân quả của spec ra khỏi text, rồi soi phần còn
    // lại: nếu ở đâu đó vẫn còn một lời quy kết ("thua vì …", "khiến lệnh
    // thua"), nó sẽ lộ ra ở đây — kể cả khi mệnh đề phủ định kia bị xóa mất.
    expect(coach.text).toContain("Không chắc thua vì điều đó")
    const conLai = coach.text.replace("Không chắc thua vì điều đó", "")
    expect(conLai).not.toMatch(/thua vì|vì điều đó|do dồn ngành|khiến (lệnh|bạn) thua/)
  })

  it("lệnh hòa (0%) tính là thua — cùng quy ước Cấp 5/6", () => {
    const coach = pickCoachCap8(situation({ hanhVi: "van_mua", pnlPct: 0 }))!
    expect(coach.id).toBe("van_mua_thua")
    expect(coach.text).toContain("0.0%")
  })
})

describe("pickCoachCap8 — ô CÓ CẢNH BÁO + VẪN MUA + THẮNG (spec §6)", () => {
  it("nguyên văn spec và NỐI LẠI bài 'sai mà thắng' của Cấp 5", () => {
    const coach = pickCoachCap8(
      situation({ hanhVi: "van_mua", pnlPct: 6.1, canhBaoTen: ["Tương quan cao"] }),
    )!
    expect(coach.id).toBe("van_mua_thang")
    expect(coach.text).toBe(
      "Thắng (+6.1%), nhưng bạn đã bỏ qua cảnh báo tương quan cao. Thắng lần " +
        "này không có nghĩa dồn rủi ro là đúng — như Cấp 5 đã dạy, coi chừng " +
        "'sai mà thắng'.",
    )
    expect(coach.text).toContain("Cấp 5")
    expect(coach.nhanManh).toContain("sai mà thắng")
    // Ô duy nhất được tô cảnh báo: nó chống việc củng cố một thói quen rủi ro.
    expect(coach.canhBao).toBe(true)
  })
})

describe("pickCoachCap8 — ô KHÔNG CẢNH BÁO (spec §6)", () => {
  it("nguyên văn spec", () => {
    const coach = pickCoachCap8(
      situation({ hanhVi: "khong_canh_bao", canhBaoTen: [] }),
    )!
    expect(coach.id).toBe("khong_canh_bao")
    expect(coach.text).toBe(
      "Lệnh này không làm danh mục mất cân đối — thêm vào lành mạnh.",
    )
    expect(coach.canhBao).toBe(false)
  })

  it("thắng hay thua đều CÙNG một câu — ô này không xét kết quả", () => {
    const thang = pickCoachCap8(situation({ hanhVi: "khong_canh_bao", pnlPct: 9 }))!
    const thua = pickCoachCap8(situation({ hanhVi: "khong_canh_bao", pnlPct: -9 }))!
    expect(thang.text).toBe(thua.text)
  })
})

describe("pickCoachCap8 — không ô nào mắng user", () => {
  it.each([
    ["nghe", situation({ hanhVi: "giam_kl" })],
    ["vẫn mua + thua", situation({ hanhVi: "van_mua", pnlPct: -7 })],
    ["vẫn mua + thắng", situation({ hanhVi: "van_mua", pnlPct: 7 })],
    ["không cảnh báo", situation({ hanhVi: "khong_canh_bao", canhBaoTen: [] })],
  ])("ô %s không dùng từ buộc tội", (_ten, s) => {
    const text = pickCoachCap8(s)!.text.toLowerCase()
    for (const tu of CAM_TU) expect(text).not.toContain(tu)
  })

  it("mọi cụm nhấn đều CÓ MẶT nguyên văn trong text", () => {
    for (const s of [
      situation({ hanhVi: "giam_kl" }),
      situation({ hanhVi: "van_mua", pnlPct: -7 }),
      situation({ hanhVi: "van_mua", pnlPct: 7 }),
      situation({ hanhVi: "khong_canh_bao", canhBaoTen: [] }),
    ]) {
      const coach = pickCoachCap8(s)!
      expect(coach.nhanManh.length).toBeGreaterThan(0)
      for (const cum of coach.nhanManh) expect(coach.text).toContain(cum)
    }
  })

  it("số âm dùng dấu trừ typographic − (U+2212), không phải hyphen", () => {
    const coach = pickCoachCap8(situation({ hanhVi: "van_mua", pnlPct: -4.2 }))!
    expect(coach.text).toContain("−4.2%")
    expect(coach.text).not.toContain("-4.2%")
  })
})

// ── composeCoachCap8 — cộng dồn, KHÔNG thay thế ─────────────────────────────

const cap1Situation: CoachSituationCap1 = {
  pnlPositive: true,
  trangThaiLucDat: "ung_ho",
  soPhienGiu: 6,
}
const cap1Params: CoachParamsCap1 = {
  pnlPct: 5.3,
  lyDo: "dinh_gia",
  soPhienGiu: 6,
  emotion: null,
}
const cap2Situation: CoachSituationCap2 = {
  phuongPhapSlTp: "ho_tro_khang_cu",
  catLo: 28_500,
  chotLoi: 32_500,
  // `CoachFlagsCap2` chỉ gồm 6 cờ vi phạm — KHÔNG có `order_id` (nó thuộc
  // `KetsoInputCap2`, không phải đầu vào của coach).
  flags: {},
  giaSauKhiCat: null,
}
const cap3Situation: CoachSituationCap3 = {
  mucTuTin: 3,
  pnlPositive: true,
  pnlPct: 5.3,
  cachKhoiLuong: "linh_hoat",
  khoiLuong: 200,
  pctVon: 15,
}
const cap4Situation: CoachSituationCap4 = {
  doc5Lop: { ky_thuat: "ok", dong_tien: "ok", noi_bo: "neu", tin_tuc: "ok", dinh_gia: "bad" },
  ai5Lop: null,
  pnlPositive: true,
  pnlPct: 5.3,
}
// Cấp 5 mới = SĂN MÃ: mã do bộ lọc «Khối ngoại gom» săn ra, chờ 2 phiên trong
// Watchlist, vào lệnh khi lên 4/5 lớp ủng hộ.
const cap5Situation: CoachSituationCap5 = {
  huntFilter: "ngoai",
  huntSoPhienCho: 2,
  huntSoLopLucVao: 4,
  pnlPct: 5.3,
}
const cap6Situation: CoachSituationCap6 = {
  khopGoiY: true,
  pnlPct: 5.3,
  lopQuyetDinh: "dinh_gia",
  kieuTen: "Ngân hàng",
  lopUuTien: ["dinh_gia", "noi_bo"],
}
const cap7Situation: CoachSituationCap7 = {
  docLucDung: true,
  lucDocUser: "manh",
  lucDocUserTen: "Cầu mạnh",
  dienBienPct: 1.2,
  soPhienCham: 2,
  deadBandPct: 1,
  coCanhGiac: false,
  hanhViCo: null,
  giaCo: null,
}

function compose(cap8: CoachSituationCap8 | null) {
  return composeCoachCap8(
    cap1Situation,
    cap1Params,
    cap2Situation,
    cap3Situation,
    cap4Situation,
    cap5Situation,
    cap6Situation,
    cap7Situation,
    cap8,
  )
}

describe("composeCoachCap8 — 8 lớp coach cạnh nhau", () => {
  it("giữ NGUYÊN 7 đoạn Cấp 1-7 và THÊM đoạn Cấp 8", () => {
    const composed = compose(situation())
    expect(composed.cap1Text.length).toBeGreaterThan(0)
    expect(composed.cap2.text.length).toBeGreaterThan(0)
    expect(composed.cap3.text.length).toBeGreaterThan(0)
    expect(composed.cap4.text.length).toBeGreaterThan(0)
    expect(composed.cap5?.text.length).toBeGreaterThan(0)
    expect(composed.cap6?.text.length).toBeGreaterThan(0)
    expect(composed.cap7?.text.length).toBeGreaterThan(0)
    expect(composed.cap8?.id).toBe("nghe")
  })

  it("KHÔNG viết lại đoạn nào của cấp dưới — 7 đoạn y hệt khi Cấp 8 vắng mặt", () => {
    const co = compose(situation())
    const khong = compose(null)
    expect(khong.cap8).toBeNull()
    expect(khong.cap1Text).toBe(co.cap1Text)
    expect(khong.cap2.text).toBe(co.cap2.text)
    expect(khong.cap3.text).toBe(co.cap3.text)
    expect(khong.cap4.text).toBe(co.cap4.text)
    expect(khong.cap5?.text).toBe(co.cap5?.text)
    expect(khong.cap6?.text).toBe(co.cap6?.text)
    expect(khong.cap7?.text).toBe(co.cap7?.text)
  })

  it("lệnh chưa qua bước Kiểm tra danh mục → cap8 = null, 7 đoạn dưới vẫn còn", () => {
    const composed = compose(situation({ hanhVi: null }))
    expect(composed.cap8).toBeNull()
    expect(composed.cap7?.text.length).toBeGreaterThan(0)
    expect(composed.cap1Text.length).toBeGreaterThan(0)
  })
})
