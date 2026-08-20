import type { CoachParamsCap1, CoachSituationCap1 } from "@/features/cap1/coachTemplateCap1"
import type { CoachSituationCap2 } from "@/features/cap2/coachTemplateCap2"
import type { CoachSituationCap3 } from "@/features/cap3/coachTemplateCap3"
import {
  composeCoachCap4,
  type ComposedCoachCap4,
  type CoachSituationCap4,
} from "@/features/cap4/coachTemplateCap4"
import { huntFilterTen, type HuntFilter } from "./types"

/**
 * Cấp 5 Kết sổ coach — lớp **SĂN MÃ** (spec `IQX-Cap5-Spec.md` §8, mockup
 * `iqx-cap5-ketso.html` khối `.coach` "NHÌN LẠI · SĂN MÃ").
 *
 * ★★ **BỐN MẪU COACH CŨ ĐÃ NGHỈ HƯU** (`dung_thang` / `dung_thua` /
 * `sai_thang` / `sai_thua`): bước phân loại 4 ô không còn tồn tại ở bất cứ cấp
 * nào, nên một câu coach nói về "ô nguy hiểm nhất" giờ sẽ là khen/chê một việc
 * user KHÔNG hề làm (luật 3 của repo).
 *
 * **Cộng dồn, KHÔNG thay thế.** `composeCoachCap5` gọi `composeCoachCap4` (chính
 * nó gọi Cấp 3 → Cấp 2 → Cấp 1) rồi THÊM đoạn thứ 5. Cấp 6/7/8 dùng lại nguyên
 * hàm này, nên đoạn săn mã tự cộng dồn lên các cấp trên — đúng tinh thần "panel
 * Cấp N = panel Cấp N-1 + delta".
 *
 * ★ **KHÔNG BAO GIỜ BỊA NGUỒN SĂN** (luật 1 + Kết sổ §8): nguồn duy nhất là
 * `huntFilter` ghi trên chính lệnh. `null` ⇒ mẫu `khong_san` nói THẲNG mã không
 * đến từ săn mã, không nặn ra một bộ lọc. Tương tự `huntSoLopLucVao === null`
 * nghĩa là mẻ chấm 5 lớp chưa chạy cho mã đó ⇒ mẫu `chua_ro_lop`, KHÔNG hiểu
 * thành "0 lớp ủng hộ".
 */

export type CoachIdCap5 = "khong_san" | "san_cho_chin" | "san_vao_som" | "san_chua_ro_lop"

/** Số lớp ủng hộ tối thiểu để một mã được coi là "đã chín" (spec §6.1). */
export const CAP5_LOP_CHIN = 4

export interface CoachSituationCap5 {
  /** Bộ lọc đã săn ra mã. `null` = user tự gõ mã, KHÔNG đến từ săn mã. */
  huntFilter: HuntFilter | null
  /** Số phiên mã nằm trong Watchlist trước khi vào lệnh. `null` = không đo được. */
  huntSoPhienCho: number | null
  /** Số lớp ủng hộ (0-5) lúc vào lệnh. `null` = CHƯA BIẾT, không phải 0. */
  huntSoLopLucVao: number | null
  pnlPct: number
}

export interface CoachResultCap5 {
  id: CoachIdCap5
  text: string
  /** Cụm từ cần in đậm — mọi cụm LUÔN có mặt nguyên văn trong `text`. */
  nhanManh: string[]
  /** Mẫu mang tính CẢNH BÁO (vào lệnh khi mã chưa chín), không phải lời khen. */
  canhBao: boolean
}

/** `+5.3%` / `−4.2%` / `0.0%` — dấu trừ typographic "−" (U+2212), như Cấp 0-4. */
function fmtPct(pct: number): string {
  const rounded = Math.round(pct * 10) / 10
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : ""
  return `${sign}${Math.abs(rounded).toFixed(1)}%`
}

/** " · chờ 2 phiên trong Watchlist" — bỏ hẳn vế này khi không đo được. */
function veCho(soPhien: number | null): string {
  if (soPhien == null || soPhien < 0) return ""
  if (soPhien === 0) return " ngay trong phiên đưa mã vào Watchlist"
  return ` sau ${soPhien.toLocaleString("en-US")} phiên chờ trong Watchlist`
}

const DUOI_PHAN_TICH =
  "Phân tích danh mục sẽ cho biết bộ lọc nào đang mang lại mã thắng nhiều nhất cho bạn."

/** Chọn + render đoạn coach "săn mã" cho lệnh vừa đóng. */
export function pickCoachCap5(situation: CoachSituationCap5): CoachResultCap5 {
  const { huntFilter, huntSoPhienCho, huntSoLopLucVao, pnlPct } = situation
  const pct = fmtPct(pnlPct)
  const ten = huntFilterTen(huntFilter)

  if (ten == null) {
    return {
      id: "khong_san",
      text:
        `Lệnh này kết quả ${pct}. Mã này KHÔNG đến từ săn mã — bạn tự chọn mã rồi vào lệnh, nên ` +
        "không có bộ lọc nào đứng sau nó để đối chiếu. Ở Cấp 5, hãy thử ngược lại: mở màn Săn mã, " +
        "để bộ lọc quét cả sàn, đưa mã vào Watchlist rồi chờ mã chín. " +
        DUOI_PHAN_TICH,
      nhanManh: ["KHÔNG đến từ săn mã"],
      canhBao: false,
    }
  }

  if (huntSoLopLucVao == null) {
    return {
      id: "san_chua_ro_lop",
      text:
        `Lệnh này kết quả ${pct}. Bạn săn mã bằng bộ lọc «${ten}» và vào lệnh${veCho(
          huntSoPhienCho,
        )}. Hệ chưa chấm được điểm đồng thuận 5 lớp cho mã này lúc bạn vào, nên chưa nói được mã ` +
        "đã chín hay chưa — điểm 5 lớp chạy theo mẻ 1 lần/ngày sau phiên. " +
        DUOI_PHAN_TICH,
      nhanManh: [`«${ten}»`, "chưa chấm được"],
      canhBao: false,
    }
  }

  if (huntSoLopLucVao >= CAP5_LOP_CHIN) {
    return {
      id: "san_cho_chin",
      text:
        `Lệnh này kết quả ${pct}. Bạn săn mã bằng bộ lọc «${ten}», kiên nhẫn chờ trong Watchlist ` +
        `đến khi lên ${huntSoLopLucVao}/5 lớp ủng hộ mới vào${veCho(huntSoPhienCho)} — đúng quy ` +
        'trình "săn rồi sàng, không mua vội". ' +
        DUOI_PHAN_TICH,
      nhanManh: [`«${ten}»`, `${huntSoLopLucVao}/5 lớp ủng hộ`, "săn rồi sàng, không mua vội"],
      canhBao: false,
    }
  }

  return {
    id: "san_vao_som",
    text:
      `Lệnh này kết quả ${pct}. Bạn săn mã bằng bộ lọc «${ten}» nhưng vào lệnh khi mã mới có ` +
      `${huntSoLopLucVao}/5 lớp ủng hộ${veCho(huntSoPhienCho)} — chưa tới mốc ` +
      `${CAP5_LOP_CHIN}/5 «Đáng chú ý». Săn mã là để có danh sách quan sát, không phải danh sách ` +
      "mua ngay: lần sau hãy để mã chờ trong Watchlist tới khi đủ lớp ủng hộ. " +
      DUOI_PHAN_TICH,
    nhanManh: [`«${ten}»`, `${huntSoLopLucVao}/5 lớp ủng hộ`, "không phải danh sách mua ngay"],
    canhBao: true,
  }
}

export interface EmphasisPart {
  text: string
  strong: boolean
}

/**
 * Cắt câu thành các đoạn để in đậm đúng cụm từ được nhấn. Không bao giờ mất chữ
 * (ghép lại luôn bằng câu gốc) và giữ THỨ TỰ XUẤT HIỆN trong câu, không phải
 * thứ tự trong `phrases`.
 */
export function splitEmphasis(text: string, phrases: string[]): EmphasisPart[] {
  const hits: { start: number; end: number }[] = []
  for (const phrase of phrases) {
    if (!phrase) continue
    let from = 0
    for (;;) {
      const idx = text.indexOf(phrase, from)
      if (idx === -1) break
      hits.push({ start: idx, end: idx + phrase.length })
      from = idx + phrase.length
    }
  }
  hits.sort((a, b) => a.start - b.start)

  const parts: EmphasisPart[] = []
  let cursor = 0
  for (const hit of hits) {
    // Bỏ qua cụm chồng lấn cụm đã lấy (giữ cụm xuất hiện trước).
    if (hit.start < cursor) continue
    if (hit.start > cursor) parts.push({ text: text.slice(cursor, hit.start), strong: false })
    parts.push({ text: text.slice(hit.start, hit.end), strong: true })
    cursor = hit.end
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), strong: false })
  return parts.length > 0 ? parts : [{ text, strong: false }]
}

export interface ComposedCoachCap5 extends ComposedCoachCap4 {
  /**
   * Đoạn coach săn mã của Cấp 5 — `null` khi chưa có dữ liệu nguồn săn nào để
   * nói (`cap5Situation === null`). KHÔNG bao giờ là một câu mặc định.
   */
  cap5: CoachResultCap5 | null
}

/**
 * Composes CẢ 5 lớp coach cho `KetsoModalCap5` (và cho Cấp 6/7/8, vốn gọi lại
 * chính hàm này): gọi `composeCoachCap4` (Cấp 1-4, không bao giờ viết lại) rồi
 * thêm lớp Cấp 5. `cap5Situation === null` → 4 lớp dưới VẪN đủ, `cap5` là `null`.
 */
export function composeCoachCap5(
  cap1Situation: CoachSituationCap1,
  cap1Params: CoachParamsCap1,
  cap2Situation: CoachSituationCap2,
  cap3Situation: CoachSituationCap3,
  cap4Situation: CoachSituationCap4,
  cap5Situation: CoachSituationCap5 | null,
): ComposedCoachCap5 {
  const cap4Composed = composeCoachCap4(
    cap1Situation,
    cap1Params,
    cap2Situation,
    cap3Situation,
    cap4Situation,
  )
  return {
    ...cap4Composed,
    cap5: cap5Situation ? pickCoachCap5(cap5Situation) : null,
  }
}
