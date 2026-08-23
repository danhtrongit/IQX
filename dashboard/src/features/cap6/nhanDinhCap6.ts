import type { MucTuTin } from "@/features/cap3/types"
import type { Lop } from "@/features/cap4/types"
import type { ConflictLevel, MauThuanCap6 } from "./mauThuanTypes"
import type { Cap6Progress } from "./types"

/**
 * Cấp 6 «Bậc thầy» — helper THUẦN (không React, không fetch) cho bảng mâu thuẫn,
 * ô nhận định 4 mức và cổng tốt nghiệp hành vi. Spec `demo-trading/LEVEL 6/
 * IQX-Cap6-Spec.md` §5-§9.
 *
 * ★ KHÔNG có bảng phân loại lớp phủ quyết ở đây: `la_phu_quyet` /
 * `phu_quyet_kich_hoat` do server gửi (spec §12.1 còn để mở việc có nâng 💰 Dòng
 * tiền lên nhóm phủ quyết hay không). Một bản sao ở FE sẽ âm thầm phân kỳ.
 */

/**
 * 4 mức nhận định (spec §6) — icon + tiêu đề + mô tả ĐÚNG CHỮ mockup
 * `iqx-cap6-datlenh.html` (`.sr-opt`).
 *
 * ★ Thuần nhận định: KHÔNG lựa chọn nào dính tới khối lượng ("vào giảm khối
 * lượng" bị spec §6 loại thẳng vì trùng phần khối lượng bên dưới).
 */
export const CONFLICT_LEVEL_OPTIONS: readonly {
  value: ConflictLevel
  icon: string
  title: string
  desc: string
}[] = [
  {
    value: "nhe",
    icon: "🟢",
    title: "Mâu thuẫn nhẹ",
    desc: "Các lớp ủng hộ đáng tin hơn, lớp ngược không nghiêm trọng",
  },
  {
    value: "ngai",
    icon: "🟡",
    title: "Đáng ngại — cần thận trọng",
    desc: "Có rủi ro thật, phải cân nhắc kỹ",
  },
  {
    value: "nghiem",
    icon: "🔴",
    title: "Nghiêm trọng",
    desc: "Lớp phủ quyết quá xấu, lấn át mọi tín hiệu tốt",
  },
  {
    value: "chua_ro",
    icon: "⚪",
    title: "Chưa rõ",
    desc: "Cần thêm thông tin/thời gian mới đánh giá được",
  },
] as const

/** Nhãn ngắn của một mức — dùng ở Kết sổ, khối ⑭⑮ và câu "Không mua". */
const LABEL: Record<ConflictLevel, string> = {
  nhe: "Mâu thuẫn nhẹ",
  ngai: "Đáng ngại",
  nghiem: "Nghiêm trọng",
  chua_ro: "Chưa rõ",
}

const ICON: Record<ConflictLevel, string> = {
  nhe: "🟢",
  ngai: "🟡",
  nghiem: "🔴",
  chua_ro: "⚪",
}

export function conflictLevelLabel(level: ConflictLevel): string {
  return LABEL[level]
}

export function conflictLevelIcon(level: ConflictLevel): string {
  return ICON[level]
}

/** "🔴 Nghiêm trọng" — icon + nhãn, một chỗ duy nhất để không lệch nhau. */
export function conflictLevelText(level: ConflictLevel): string {
  return `${ICON[level]} ${LABEL[level]}`
}

/**
 * Phản hồi ngắn sau khi user chọn một mức (spec §6 "Chọn xong hiện phản hồi
 * ngắn (ghi nhận + gợi ý nhẹ)").
 *
 * ★★ **LỆCH CÓ CHỦ ĐÍCH SO VỚI MOCKUP.** `CF_AFTER` trong
 * `iqx-cap6-datlenh.html` nhắc "khối lượng **và cắt lỗ**" ở mức 🟡 và 🔴. Nhưng
 * spec §4.3 nói thẳng "Chỉ soi khối lượng — KHÔNG soi cắt lỗ (cắt lỗ chỉ là chọn
 * cách tính, không phản ánh mức thận trọng)", §6 ghi ô này "KHÔNG dính khối
 * lượng/cắt lỗ", và §8/§9 lặp lại "CHỈ nói khối lượng + tự tin, KHÔNG nhắc cắt
 * lỗ". Nhắc cắt lỗ ở đây rồi Kết sổ lại im về nó là dạy một điều mà hệ không đo.
 */
const FEEDBACK: Record<ConflictLevel, string> = {
  nhe: 'Bạn đọc đây là mâu thuẫn nhẹ. Nhận định này được ghi lại — khi kết sổ, bạn sẽ thấy những lần đọc "nhẹ" của mình có chính xác không.',
  ngai: "Bạn đọc đây là đáng ngại. Ghi nhận rồi. Cân nhắc để khối lượng và mức tự tin ở phần bên dưới khớp với mức thận trọng này.",
  nghiem:
    "Bạn đọc đây là nghiêm trọng — lớp phủ quyết lấn át. Nếu vậy, hãy để hành động (khối lượng, mức tự tin, hoặc đứng ngoài) khớp với nhận định. Kết sổ sẽ soi sự nhất quán này.",
  chua_ro:
    "Bạn thấy chưa rõ. Ghi nhận. Nếu chưa đủ tự tin, chờ thêm phiên cũng là một lựa chọn hợp lý với mâu thuẫn có lớp phủ quyết.",
}

export function feedbackNhanDinh(level: ConflictLevel): string {
  return FEEDBACK[level]
}

/** Câu chốt của bảng mâu thuẫn — VERBATIM spec §5.2 / mockup `.cf-note`. */
export const CAU_CHOT_MAU_THUAN =
  "IQX chỉ ra mâu thuẫn — nhận định của bạn được ghi lại để nhìn lại khi kết sổ. Quyết định vẫn là của bạn."

/** Chú thích phân loại lớp — VERBATIM mockup `.cf-legend` (spec §5.2 mục 3). */
export const CHU_THICH_PHU_QUYET =
  "Lớp phủ quyết: 📰 Tin tức · 👤 Nội bộ — khi rất xấu, có thể phủ định mọi lớp khác."
export const CHU_THICH_DIEM_TRU =
  "Lớp điểm trừ: 🎯 Kỹ thuật · 💰 Dòng tiền · 💎 Định giá — xấu thì trừ điểm, không phủ định."
export const CHU_THICH_KHUNG_THAM_KHAO =
  "(Khung tham khảo của IQX, không phải quy tắc bắt buộc.)"

/**
 * spec §5.1 — bảng mâu thuẫn CHỈ hiện khi có **đồng thời ≥1 lớp ủng hộ VÀ ≥1 lớp
 * ngược chiều**. 5 lớp cùng chiều → không có mâu thuẫn → không bảng.
 *
 * ★ `chua_du_du_lieu` chặn trước mọi thứ: chưa đọc đủ 5 lớp thì không có gì để
 * chia phe, và nói "không mâu thuẫn" ở đó là một khẳng định bịa.
 */
export function coBangMauThuan(mauThuan: MauThuanCap6 | null | undefined): boolean {
  if (!mauThuan) return false
  if (mauThuan.chua_du_du_lieu) return false
  return (
    mauThuan.co_mau_thuan && mauThuan.ung_ho.length > 0 && mauThuan.nguoc.length > 0
  )
}

/**
 * Lý do vào lệnh SUY RA từ bản đọc 5 lớp của SERVER — chỉ để lấp cột `lyDo`
 * NOT NULL mà Cấp 1 vẫn giữ.
 *
 * ★★ VÌ SAO PHẢI CÓ HÀM NÀY: ở Cấp 6 khối "đọc 5 lớp" của Cấp 4 bị THAY (spec
 * §5.2/§14), nên user không còn tự chấm từng lớp — mà `deriveLyDoForCap1` của
 * Cấp 4 với bản chấm RỖNG sẽ trả về `"ky_thuat"` cứng, tức GHI MỘT LỜI KHAI USER
 * CHƯA BAO GIỜ NÓI vào hồ sơ mọi lệnh Cấp 6. Thay vào đó lấy đúng một SỰ THẬT về
 * mã: lớp đang ủng hộ theo bản đọc của IQX.
 *
 * Luật, tất định: lớp `ung_ho` đầu tiên → nếu không có, `trung_tinh` đầu tiên →
 * nếu không có, `nguoc` đầu tiên (thứ tự do server gửi, vốn là `LOP_KEYS`).
 *
 * ★ `null` khi KHÔNG đọc được gì (query lỗi / chưa đủ dữ liệu / cả ba mảng
 * rỗng). Caller PHẢI xử `null` bằng cách để user tự khai (trường lý do của Cấp 1
 * hiện lại) — TUYỆT ĐỐI không đắp một lớp mặc định.
 */
export function lyDoTuMauThuan(mauThuan: MauThuanCap6 | null | undefined): Lop | null {
  if (!mauThuan) return null
  return (
    mauThuan.ung_ho[0]?.lop ?? mauThuan.trung_tinh[0]?.lop ?? mauThuan.nguoc[0]?.lop ?? null
  )
}

/**
 * Cái bẫy "nghĩ một đằng, làm một nẻo" (spec §1 insight 2, §8 khối cảnh báo lệch).
 *
 * **Luật ở đây, viết ra để không ai đoán:** lệch = đọc **🔴 Nghiêm trọng** mà
 * mức tự tin của lệnh KHÔNG ở mức thấp nhất. Vì sao lấy mức tự tin: ở Cấp 3 khối
 * lượng = *trần khẩu vị × mức tự tin*, nên **mức tự tin là nút DUY NHẤT điều
 * chỉnh khối lượng của MỘT lệnh** (khẩu vị áp cho mọi lệnh, không phải quyết
 * định riêng của lệnh này). "Mua nhỏ" theo spec §2 vì thế = hạ mức tự tin.
 *
 * ★ CHỈ khối lượng + tự tin. KHÔNG xét cắt lỗ (spec §4.3/§8/§9).
 * ★ `null` = chưa biết (chưa chọn mức, hoặc lệnh không có mức tự tin) — KHÔNG
 *   phải "không lệch": một `false` ở đó sẽ khẳng định sự nhất quán chưa từng được
 *   kiểm.
 */
export function lechNhanDinhHanhDong(
  level: ConflictLevel | null | undefined,
  mucTuTin: MucTuTin | null | undefined,
): boolean | null {
  if (level == null || mucTuTin == null) return null
  if (level !== "nghiem") return false
  return mucTuTin > 1
}

/**
 * Mục tiêu mặc định — CHỈ dùng khi chưa có hồ sơ Cấp 6 nào để đọc.
 *
 * ★★ Không được dùng như "giá trị đúng": `mucTieuNhatQuan`/`mucTieuVeto` bên dưới
 * ĐỌC SERVER trước. Fixture test phải đặt số KHÁC hai hằng này, nếu không bài
 * kiểm không phân biệt được "đọc server" với "trả hằng số".
 */
export const MUC_TIEU_NHAT_QUAN_MAC_DINH = 3
export const MUC_TIEU_VETO_MAC_DINH = 2

/** Mục tiêu "xử lý nhất quán" — của SERVER khi có, mặc định khi chưa có hồ sơ. */
export function mucTieuNhatQuan(progress: Cap6Progress | null | undefined): number {
  return progress?.muc_tieu_nhat_quan ?? MUC_TIEU_NHAT_QUAN_MAC_DINH
}

/** Mục tiêu "có phủ quyết" — của SERVER khi có, mặc định khi chưa có hồ sơ. */
export function mucTieuVeto(progress: Cap6Progress | null | undefined): number {
  return progress?.muc_tieu_veto ?? MUC_TIEU_VETO_MAC_DINH
}

/**
 * Cổng Cấp 6 (spec §2/§3) — **thuần hành vi, KHÔNG đo lãi**: đủ số lần xử lý
 * nhất quán VÀ đủ số lần trong đó có lớp phủ quyết rất xấu.
 *
 * Một chiều: `graduated_at` đã có thì không mở lại (mirror
 * `cap5/GraduationModalCap5.tsx#isGraduationReadyCap5`).
 */
export function datCongCap6(progress: Cap6Progress | null | undefined): boolean {
  if (!progress) return false
  return (
    progress.so_lan_xu_ly_nhat_quan >= mucTieuNhatQuan(progress) &&
    progress.so_lan_xu_ly_veto_nhat_quan >= mucTieuVeto(progress)
  )
}
