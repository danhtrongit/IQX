import { describe, expect, it } from "vitest"
import type { CoachParamsCap1, CoachSituationCap1 } from "@/features/cap1/coachTemplateCap1"
import type { CoachSituationCap2 } from "@/features/cap2/coachTemplateCap2"
import type { CoachSituationCap3 } from "@/features/cap3/coachTemplateCap3"
import type { CoachSituationCap4 } from "@/features/cap4/coachTemplateCap4"
import type { CoachSituationCap5 } from "@/features/cap5/coachTemplateCap5"
import type { CoachSituationCap6 } from "@/features/cap6/coachTemplateCap6"
import {
  composeCoachCap7,
  pickCoachCap7,
  type CoachSituationCap7,
} from "./coachTemplateCap7"

/**
 * Lớp coach thứ 7 = "đọc lực vs diễn biến ngay sau" (spec §6) — 4 mẫu:
 * đọc đúng · đọc sai · có cờ + chờ xác nhận · có cờ + mua đuổi.
 *
 * ★ Hai bất biến bao trùm cả file:
 *  1. `docLucDung === null` = CHƯA TỚI HẠN CHẤM, không phải một phán quyết →
 *     KHÔNG có đoạn coach nào (`null`), không ô nào được đoán.
 *  2. Ô "đọc sai" KHÔNG mắng: nó nói lực sổ lệnh nhiễu, không nói user dở; và ô
 *     "mua đuổi" là một NHẮC NHỞ, không phải phạt (spec §5 "không phạt cứng").
 */
const CAM_TU_DOC_SAI = ["bạn dở", "kém", "thiếu kỷ luật", "lẽ ra bạn", "đáng ra"]

function situation(overrides: Partial<CoachSituationCap7> = {}): CoachSituationCap7 {
  return {
    docLucDung: true,
    lucDocUser: "manh",
    lucDocUserTen: "Cầu mạnh",
    dienBienPct: 1.2,
    soPhienCham: 2,
    deadBandPct: 1,
    coCanhGiac: false,
    hanhViCo: null,
    giaCo: null,
    ...overrides,
  }
}

describe("pickCoachCap7 — chưa tới hạn chấm", () => {
  it("docLucDung === null → KHÔNG có ô nào (null), kể cả khi có cờ", () => {
    expect(pickCoachCap7(situation({ docLucDung: null, dienBienPct: null }))).toBeNull()
    expect(
      pickCoachCap7(
        situation({
          docLucDung: null,
          dienBienPct: null,
          coCanhGiac: true,
          hanhViCo: "mua_duoi_theo",
          giaCo: 62_000,
        }),
      ),
    ).toBeNull()
  })

  it("lệnh không ghi bước đọc lực (lucDocUser null + chưa chấm) → null", () => {
    expect(
      pickCoachCap7(
        situation({ docLucDung: null, lucDocUser: null, lucDocUserTen: null, dienBienPct: null }),
      ),
    ).toBeNull()
  })
})

describe("pickCoachCap7 — ô ĐỌC ĐÚNG (spec §6)", () => {
  it("nêu cách user đọc + %diễn biến + số phiên, và giữ nguyên văn bài học", () => {
    const coach = pickCoachCap7(situation())!
    expect(coach.id).toBe("doc_dung")
    expect(coach.docDung).toBe(true)
    expect(coach.coId).toBeNull()
    expect(coach.text).toContain('"Cầu mạnh"')
    expect(coach.text).toContain("giá đi đúng hướng ngay sau")
    expect(coach.text).toContain("+1.2%")
    expect(coach.text).toContain("2 phiên")
    expect(coach.text).toContain("Đọc lực đang lên tay")
    expect(coach.text).toContain("lực chỉ đúng cho thời điểm rất ngắn")
  })

  it("đọc 'Cân bằng' mà giá đứng yên → nói ĐỨNG YÊN, không nói 'đi đúng hướng'", () => {
    const coach = pickCoachCap7(
      situation({ lucDocUser: "can", lucDocUserTen: "Cân bằng", dienBienPct: 0.3 }),
    )!
    expect(coach.id).toBe("doc_dung")
    expect(coach.text).toContain("gần như đứng yên")
    expect(coach.text).not.toContain("giá đi đúng hướng")
    expect(coach.text).toContain("+0.3%")
  })

  it("dấu trừ typographic − (U+2212) cho diễn biến âm, không dùng '-'", () => {
    const coach = pickCoachCap7(
      situation({ lucDocUser: "yeu", lucDocUserTen: "Cầu yếu", dienBienPct: -3.4 }),
    )!
    expect(coach.text).toContain("−3.4%")
    expect(coach.text).not.toContain("-3.4%")
  })

  it("mọi cụm nhấn mạnh đều CÓ THẬT nguyên văn trong text", () => {
    const coach = pickCoachCap7(situation())!
    expect(coach.nhanManh.length).toBeGreaterThan(0)
    for (const cum of coach.nhanManh) expect(coach.text).toContain(cum)
  })
})

describe("pickCoachCap7 — ô ĐỌC SAI (spec §6) — KHÔNG mắng", () => {
  it("giữ NGUYÊN VĂN câu bài học của spec về lực sổ lệnh nhiễu", () => {
    const coach = pickCoachCap7(situation({ docLucDung: false, dienBienPct: -2.5 }))!
    expect(coach.id).toBe("doc_sai")
    expect(coach.docDung).toBe(false)
    expect(coach.text).toContain(
      "Lực sổ lệnh nhiễu và đổi nhanh — đừng đặt cược lớn chỉ vào lực tức thời.",
    )
  })

  it("đoán 'Cầu mạnh' mà giá giảm → 'giá đi ngược ngay sau' (nguyên văn spec)", () => {
    const coach = pickCoachCap7(situation({ docLucDung: false, dienBienPct: -2.5 }))!
    expect(coach.text).toContain("giá đi ngược ngay sau")
  })

  it("đoán 'Cầu mạnh' mà giá ĐỨNG YÊN → không nói 'đi ngược' (không có thật)", () => {
    const coach = pickCoachCap7(situation({ docLucDung: false, dienBienPct: 0.2 }))!
    expect(coach.text).not.toContain("đi ngược")
    expect(coach.text).toContain("gần như đứng yên")
  })

  it("đoán 'Cân bằng' mà giá chạy → nói đi khỏi vùng đứng yên, không nói 'đi ngược'", () => {
    const coach = pickCoachCap7(
      situation({
        docLucDung: false,
        lucDocUser: "can",
        lucDocUserTen: "Cân bằng",
        dienBienPct: 4.1,
      }),
    )!
    expect(coach.text).toContain("đi khỏi vùng đứng yên")
    expect(coach.text).not.toContain("đi ngược")
  })

  it("KHÔNG có từ nào mắng user", () => {
    const coach = pickCoachCap7(situation({ docLucDung: false, dienBienPct: -2.5 }))!
    for (const tu of CAM_TU_DOC_SAI) expect(coach.text.toLowerCase()).not.toContain(tu)
  })
})

describe("pickCoachCap7 — ô CÓ CỜ + CHỜ XÁC NHẬN (spec §6)", () => {
  it("thêm đoạn ghi nhận đúng phản xạ, giữ nguyên câu của spec", () => {
    const coach = pickCoachCap7(
      situation({ coCanhGiac: true, hanhViCo: "cho_xac_nhan", giaCo: 62_000 }),
    )!
    expect(coach.coId).toBe("co_cho_xac_nhan")
    expect(coach.text).toContain(
      "Bạn thấy lệnh treo lớn và chờ khớp thật — đúng phản xạ. Tỉnh táo với lệnh \"hù\".",
    )
    // Đoạn đọc-lực vẫn còn nguyên bên trên nó.
    expect(coach.text).toContain("Đọc lực đang lên tay")
  })
})

describe("pickCoachCap7 — ô CÓ CỜ + MUA ĐUỔI (spec §6) — nhắc nhẹ, KHÔNG phạt", () => {
  it("nêu giá của mức bị gắn cờ khi hệ có ghi lại", () => {
    const coach = pickCoachCap7(
      situation({ coCanhGiac: true, hanhViCo: "mua_duoi_theo", giaCo: 62_000 }),
    )!
    expect(coach.coId).toBe("co_mua_duoi_theo")
    expect(coach.text).toContain("62,000")
    expect(coach.text).toContain("Lần sau chờ nó khớp thật")
  })

  it("KHÔNG bịa giá khi hệ chưa ghi lại mức bị gắn cờ", () => {
    const coach = pickCoachCap7(
      situation({ coCanhGiac: true, hanhViCo: "mua_duoi_theo", giaCo: null }),
    )!
    expect(coach.text).toContain("lệnh treo lớn")
    expect(coach.text).not.toContain(" ở ")
  })

  it("NÓI THẲNG đây không phải điểm trừ (spec §5 'không phạt cứng')", () => {
    const coach = pickCoachCap7(
      situation({ coCanhGiac: true, hanhViCo: "mua_duoi_theo", giaCo: 62_000 }),
    )!
    expect(coach.text).toContain("không phải điểm trừ")
    expect(coach.text.toLowerCase()).not.toContain("vi phạm")
    expect(coach.text.toLowerCase()).not.toContain("bị phạt vì")
  })

  it("nói RÕ đây là giả định ('Nếu đó là…'), KHÔNG kết luận lệnh treo là giả", () => {
    const coach = pickCoachCap7(
      situation({ coCanhGiac: true, hanhViCo: "mua_duoi_theo", giaCo: 62_000 }),
    )!
    expect(coach.text).toContain("Nếu đó là lệnh kê giá rồi rút")
    expect(coach.text).not.toMatch(/lệnh giả/i)
    expect(coach.text).not.toMatch(/phát hiện/i)
  })

  it("mua đuổi vẫn có thể ĐỌC ĐÚNG — hai đoạn độc lập, không đoạn nào phủ đoạn kia", () => {
    const coach = pickCoachCap7(
      situation({ docLucDung: true, coCanhGiac: true, hanhViCo: "mua_duoi_theo" }),
    )!
    expect(coach.id).toBe("doc_dung")
    expect(coach.coId).toBe("co_mua_duoi_theo")
    expect(coach.text).toContain("Đọc lực đang lên tay")
    expect(coach.text).toContain("Lần sau chờ nó khớp thật")
  })
})

describe("pickCoachCap7 — cờ có nhưng hệ không ghi hành vi", () => {
  it("hanhViCo === null → KHÔNG đoán ô cờ nào", () => {
    const coach = pickCoachCap7(situation({ coCanhGiac: true, hanhViCo: null }))!
    expect(coach.coId).toBeNull()
    expect(coach.text).not.toContain("chờ khớp thật")
    expect(coach.text).not.toContain("mua đuổi")
  })

  it("KHÔNG có cờ nhưng có hanhViCo (dữ liệu lệch) → vẫn không dựng ô cờ", () => {
    const coach = pickCoachCap7(situation({ coCanhGiac: false, hanhViCo: "cho_xac_nhan" }))!
    expect(coach.coId).toBeNull()
  })
})

describe("pickCoachCap7 — thiếu dữ liệu thì NÓI THẲNG (§C12c)", () => {
  it("không có %diễn biến → không bịa số, nói chung chung + ghi chú thiếu", () => {
    const coach = pickCoachCap7(situation({ dienBienPct: null }))!
    expect(coach.text).not.toContain("%")
    expect(coach.text).toContain("Hệ chưa ghi lại được")
  })

  it("không có tên cách đọc → không đặt tên thay user", () => {
    const coach = pickCoachCap7(situation({ lucDocUser: null, lucDocUserTen: null }))!
    expect(coach.text).not.toContain('""')
    expect(coach.text).toContain("Hệ chưa ghi lại được")
  })
})

// ── composeCoachCap7 — cộng dồn, KHÔNG thay thế ─────────────────────────────

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

describe("composeCoachCap7 — 7 lớp coach cạnh nhau", () => {
  it("giữ NGUYÊN 6 đoạn Cấp 1-6 và THÊM đoạn Cấp 7", () => {
    const composed = composeCoachCap7(
      cap1Situation,
      cap1Params,
      cap2Situation,
      cap3Situation,
      cap4Situation,
      cap5Situation,
      cap6Situation,
      situation(),
    )
    expect(composed.cap1Text.length).toBeGreaterThan(0)
    expect(composed.cap2.text.length).toBeGreaterThan(0)
    expect(composed.cap3.text.length).toBeGreaterThan(0)
    expect(composed.cap4.text.length).toBeGreaterThan(0)
    expect(composed.cap5?.text.length).toBeGreaterThan(0)
    expect(composed.cap6?.id).toBe("khop_thang")
    expect(composed.cap7?.id).toBe("doc_dung")
  })

  it("cap7Situation === null → 6 lớp dưới VẪN đủ, cap7 là null", () => {
    const composed = composeCoachCap7(
      cap1Situation,
      cap1Params,
      cap2Situation,
      cap3Situation,
      cap4Situation,
      cap5Situation,
      cap6Situation,
      null,
    )
    expect(composed.cap7).toBeNull()
    expect(composed.cap6?.id).toBe("khop_thang")
    expect(composed.cap1Text.length).toBeGreaterThan(0)
  })

  it("cap6Situation === null (lệnh không mâu thuẫn) không chặn đoạn Cấp 7", () => {
    const composed = composeCoachCap7(
      cap1Situation,
      cap1Params,
      cap2Situation,
      cap3Situation,
      cap4Situation,
      cap5Situation,
      null,
      situation(),
    )
    expect(composed.cap6).toBeNull()
    expect(composed.cap7?.id).toBe("doc_dung")
  })

  it("KHÔNG viết lại đoạn Cấp 1-6: text giống HỆT composeCoachCap6 cho cùng tình huống", async () => {
    const { composeCoachCap6 } = await import("@/features/cap6/coachTemplateCap6")
    const cap6Composed = composeCoachCap6(
      cap1Situation,
      cap1Params,
      cap2Situation,
      cap3Situation,
      cap4Situation,
      cap5Situation,
      cap6Situation,
    )
    const composed = composeCoachCap7(
      cap1Situation,
      cap1Params,
      cap2Situation,
      cap3Situation,
      cap4Situation,
      cap5Situation,
      cap6Situation,
      situation(),
    )
    expect(composed.cap1Text).toBe(cap6Composed.cap1Text)
    expect(composed.cap2.text).toBe(cap6Composed.cap2.text)
    expect(composed.cap3.text).toBe(cap6Composed.cap3.text)
    expect(composed.cap4.text).toBe(cap6Composed.cap4.text)
    expect(composed.cap5?.text).toBe(cap6Composed.cap5?.text)
    expect(composed.cap6?.text).toBe(cap6Composed.cap6?.text)
  })
})
