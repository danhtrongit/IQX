import { describe, expect, it } from "vitest"
import type { CoachParamsCap1, CoachSituationCap1 } from "@/features/cap1/coachTemplateCap1"
import type { CoachSituationCap2 } from "@/features/cap2/coachTemplateCap2"
import type { CoachSituationCap3 } from "@/features/cap3/coachTemplateCap3"
import type { CoachSituationCap4 } from "@/features/cap4/coachTemplateCap4"
import {
  composeCoachCap5,
  deriveO4,
  pickCoachCap5,
  splitEmphasis,
  viPhamTuSignals,
  type CoachSituationCap5,
} from "./coachTemplateCap5"
import type { VerdictSignal } from "./types"

/** 4 tín hiệu của BE (`services/cap5/service.py#_compute_signals`) — tất cả đạt. */
const SIGNALS_PASS: VerdictSignal[] = [
  {
    ma: "co_so",
    ten: "Có cơ sở lúc đặt lệnh",
    dat: true,
    giai_thich: "Lúc đặt, 4/5 lớp bạn đọc là Ủng hộ.",
  },
  {
    ma: "ky_luat_thoat",
    ten: "Tôn trọng cắt lỗ / chốt lời đã cam kết",
    dat: true,
    giai_thich: "Bạn thoát lệnh theo đúng ngưỡng đã cam kết lúc đặt.",
  },
  {
    ma: "khong_nhoi",
    ten: "Không nhồi lệnh khi lỗ",
    dat: true,
    giai_thich: "Bạn không mua thêm mã này trong lúc đang lỗ.",
  },
  {
    ma: "khoi_luong_khop",
    ten: "Khối lượng khớp khẩu vị",
    dat: true,
    giai_thich: "Khối lượng dùng 15.0% vốn, trong trần 20% của khẩu vị Cân bằng.",
  },
]

/** 2 tín hiệu trượt: kỷ luật thoát + nhồi lệnh. */
const SIGNALS_FAIL: VerdictSignal[] = [
  SIGNALS_PASS[0],
  {
    ma: "ky_luat_thoat",
    ten: "Tôn trọng cắt lỗ / chốt lời đã cam kết",
    dat: false,
    giai_thich: "Vi phạm ghi nhận: chạm ngưỡng cắt lỗ nhưng không cắt.",
  },
  {
    ma: "khong_nhoi",
    ten: "Không nhồi lệnh khi lỗ",
    dat: false,
    giai_thich: "Vi phạm ghi nhận: bạn mua thêm mã này trong lúc đang lỗ.",
  },
  SIGNALS_PASS[3],
]

function situation(overrides: Partial<CoachSituationCap5> = {}): CoachSituationCap5 {
  return {
    o4: "dung_thang",
    verdict: "dung",
    pnlPct: 5.3,
    signals: SIGNALS_PASS,
    ...overrides,
  }
}

describe("deriveO4 — 4 ô = verdict cuối × kết quả (mirror BE `_derive_o_4`)", () => {
  it("đúng + lãi → dung_thang", () => {
    expect(deriveO4("dung", 5.3)).toBe("dung_thang")
  })

  it("đúng + lỗ → dung_thua", () => {
    expect(deriveO4("dung", -4.2)).toBe("dung_thua")
  })

  it("sai + lãi → sai_thang", () => {
    expect(deriveO4("sai", 7.1)).toBe("sai_thang")
  })

  it("sai + lỗ → sai_thua", () => {
    expect(deriveO4("sai", -6)).toBe("sai_thua")
  })

  it("lệnh đóng ngang giá (0%) tính là THUA, đúng như BE", () => {
    expect(deriveO4("dung", 0)).toBe("dung_thua")
    expect(deriveO4("sai", 0)).toBe("sai_thua")
  })
})

describe("viPhamTuSignals — vi phạm cụ thể lấy từ provenance", () => {
  it("chỉ lấy tín hiệu TRƯỢT, diễn đạt bằng lời người dùng hiểu", () => {
    const viPham = viPhamTuSignals(SIGNALS_FAIL)
    expect(viPham).toEqual([
      "không tôn trọng ngưỡng cắt lỗ / chốt lời đã cam kết",
      "nhồi lệnh khi đang lỗ",
    ])
  })

  it("tín hiệu CHƯA RÕ (dat null) KHÔNG bao giờ bị tính là vi phạm", () => {
    const signals: VerdictSignal[] = [
      { ma: "khoi_luong_khop", ten: "Khối lượng khớp khẩu vị", dat: null, giai_thich: "Chưa có dữ liệu." },
      ...SIGNALS_PASS.slice(0, 3),
    ]
    expect(viPhamTuSignals(signals)).toEqual([])
  })

  it("không có tín hiệu nào → danh sách rỗng (không bịa vi phạm)", () => {
    expect(viPhamTuSignals([])).toEqual([])
  })
})

describe("pickCoachCap5 — 4 template theo ô (spec §4)", () => {
  it("Đúng-Thắng: chuẩn mực, mẫu để lặp lại, nêu %lãi", () => {
    const res = pickCoachCap5(situation())
    expect(res.id).toBe("dung_thang")
    expect(res.text).toMatch(/Chuẩn mực/)
    expect(res.text).toMatch(/mẫu để lặp lại/)
    expect(res.text).toMatch(/\+5\.3%/)
    expect(res.canhBao).toBe(false)
  })

  it("Đúng-Thua: «không phải lỗi của bạn», đừng đổi cách làm đúng vì một lần thua", () => {
    const res = pickCoachCap5(
      situation({ o4: "dung_thua", pnlPct: -4.2, verdict: "dung" }),
    )
    expect(res.id).toBe("dung_thua")
    expect(res.text).toMatch(/không phải lỗi của bạn/)
    expect(res.text).toMatch(/một quyết định tốt vẫn có thể thua/)
    expect(res.text).toMatch(/Đừng đổi cách làm đúng/)
    expect(res.text).toMatch(/−4\.2%/)
    // Ô phản trực giác #1 — cụm từ được nhấn mạnh phải nằm TRONG câu.
    expect(res.nhanManh).toContain("không phải lỗi của bạn")
    for (const phrase of res.nhanManh) expect(res.text).toContain(phrase)
    expect(res.canhBao).toBe(false)
  })

  it("Sai-Thắng: ⚠ nguy hiểm nhất, may mắn KHÔNG phải năng lực, củng cố thói quen xấu", () => {
    const res = pickCoachCap5(
      situation({ o4: "sai_thang", verdict: "sai", pnlPct: 7.1, signals: SIGNALS_FAIL }),
    )
    expect(res.id).toBe("sai_thang")
    expect(res.text).toMatch(/⚠/)
    expect(res.text).toMatch(/nguy hiểm nhất/i)
    expect(res.text).toMatch(/may mắn/)
    expect(res.text).toMatch(/không phải năng lực/)
    expect(res.text).toMatch(/củng cố thói quen xấu/)
    // Ô phản trực giác #2 — cảnh báo, và vẫn nêu vi phạm cụ thể (§C12c).
    expect(res.canhBao).toBe(true)
    expect(res.nhanManh.length).toBeGreaterThanOrEqual(2)
    for (const phrase of res.nhanManh) expect(res.text).toContain(phrase)
    expect(res.text).toMatch(/nhồi lệnh khi đang lỗ/)
  })

  it("Sai-Thua: bài học rõ nhất + nêu ĐÚNG vi phạm từ provenance", () => {
    const res = pickCoachCap5(
      situation({ o4: "sai_thua", verdict: "sai", pnlPct: -6, signals: SIGNALS_FAIL }),
    )
    expect(res.id).toBe("sai_thua")
    expect(res.text).toMatch(/Bài học/)
    expect(res.text).toMatch(/không tôn trọng ngưỡng cắt lỗ/)
    expect(res.text).toMatch(/nhồi lệnh khi đang lỗ/)
    expect(res.text).toMatch(/−6\.0%/)
    expect(res.viPham).toHaveLength(2)
  })

  it("Sai-* mà hệ không thấy vi phạm nào (user tự đảo verdict) → nói thẳng, KHÔNG bịa vi phạm", () => {
    const res = pickCoachCap5(
      situation({ o4: "sai_thua", verdict: "sai", pnlPct: -6, signals: SIGNALS_PASS }),
    )
    expect(res.viPham).toEqual([])
    expect(res.text).toMatch(/bạn tự đánh giá/i)
    expect(res.text).toMatch(/hệ không tìm thấy vi phạm/i)
  })

  it("Đúng-* mà lệnh chưa ghi tín hiệu nào → không bịa «bạn giữ đúng X»", () => {
    const res = pickCoachCap5(situation({ signals: [] }))
    expect(res.text).toMatch(/chưa ghi tín hiệu quy trình nào/i)
  })
})

describe("splitEmphasis — in đậm đúng cụm từ được nhấn", () => {
  it("cắt câu thành các đoạn, đoạn khớp cụm từ được đánh dấu strong", () => {
    const parts = splitEmphasis("a không phải lỗi của bạn b", ["không phải lỗi của bạn"])
    expect(parts).toEqual([
      { text: "a ", strong: false },
      { text: "không phải lỗi của bạn", strong: true },
      { text: " b", strong: false },
    ])
  })

  it("nhiều cụm từ, giữ đúng thứ tự xuất hiện trong câu", () => {
    const parts = splitEmphasis("x A y B z", ["B", "A"])
    expect(parts.filter((p) => p.strong).map((p) => p.text)).toEqual(["A", "B"])
    expect(parts.map((p) => p.text).join("")).toBe("x A y B z")
  })

  it("không có cụm từ nào → 1 đoạn thường (không bao giờ mất chữ)", () => {
    expect(splitEmphasis("nguyên câu", [])).toEqual([{ text: "nguyên câu", strong: false }])
    expect(splitEmphasis("nguyên câu", ["vắng mặt"])).toEqual([
      { text: "nguyên câu", strong: false },
    ])
  })
})

describe("composeCoachCap5 — CỘNG DỒN cả 5 lớp coach", () => {
  const cap1Situation: CoachSituationCap1 = {
    pnlPositive: true,
    trangThaiLucDat: "ung_ho",
    soPhienGiu: 7,
  }
  const cap1Params: CoachParamsCap1 = {
    pnlPct: 5.3,
    lyDo: "tin_tuc",
    soPhienGiu: 7,
    emotion: null,
  }
  const cap2Situation: CoachSituationCap2 = {
    phuongPhapSlTp: "ho_tro_khang_cu",
    catLo: 60_700,
    chotLoi: 65_800,
    flags: {},
  }
  const cap3Situation: CoachSituationCap3 = {
    mucTuTin: 2,
    pnlPositive: true,
    pnlPct: 5.3,
    cachKhoiLuong: "linh_hoat",
    khoiLuong: 200,
    pctVon: 15,
  }
  const cap4Situation: CoachSituationCap4 = {
    doc5Lop: { ky_thuat: "ok", dong_tien: "ok", noi_bo: "neu", tin_tuc: "ok", dinh_gia: "ok" },
    ai5Lop: { ky_thuat: "ok", dong_tien: "ok", noi_bo: "neu", tin_tuc: "bad", dinh_gia: "ok" },
    pnlPositive: true,
    pnlPct: 5.3,
  }

  it("giữ nguyên 4 đoạn Cấp 1/2/3/4 và THÊM đoạn Cấp 5", () => {
    const coach = composeCoachCap5(
      cap1Situation,
      cap1Params,
      cap2Situation,
      cap3Situation,
      cap4Situation,
      situation(),
    )
    expect(coach.cap1Text).toMatch(/Lệnh lãi \+5\.3%/)
    expect(coach.cap2.text.length).toBeGreaterThan(10)
    expect(coach.cap3.text).toMatch(/⭐⭐ Vừa/)
    expect(coach.cap4.id).toBe("khac_ai_thang")
    expect(coach.cap5?.id).toBe("dung_thang")
  })

  it("5 đoạn là 5 chuỗi khác nhau (không lớp nào ghi đè lớp nào)", () => {
    const coach = composeCoachCap5(
      cap1Situation,
      cap1Params,
      cap2Situation,
      cap3Situation,
      cap4Situation,
      situation(),
    )
    const texts = [
      coach.cap1Text,
      coach.cap2.text,
      coach.cap3.text,
      coach.cap4.text,
      coach.cap5?.text ?? "",
    ]
    expect(new Set(texts).size).toBe(5)
  })

  it("chưa chốt phân loại (situation null) → 4 lớp dưới VẪN đủ, lớp Cấp 5 là null", () => {
    const coach = composeCoachCap5(
      cap1Situation,
      cap1Params,
      cap2Situation,
      cap3Situation,
      cap4Situation,
      null,
    )
    expect(coach.cap5).toBeNull()
    expect(coach.cap1Text.length).toBeGreaterThan(10)
    expect(coach.cap2.text.length).toBeGreaterThan(10)
    expect(coach.cap3.text.length).toBeGreaterThan(10)
    expect(coach.cap4.text.length).toBeGreaterThan(10)
  })
})
