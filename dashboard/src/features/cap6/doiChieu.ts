import { LOP_KEYS } from "@/features/cap4/doc5Lop"
import type { Lop, Lop5Partial, NhanDinhLop } from "@/features/cap4/types"

/**
 * Bước "Đối chiếu" — PURE helpers (spec §4).
 *
 * Everything the block needs that isn't rendering or fetching lives here so it
 * can be unit-tested without React: the ONE conflict trigger the whole cấp turns
 * on, the two sides of that conflict, and the cổng-cứng predicate.
 *
 * ★ Nothing here judges WHICH lớp the user picks (spec §5/§10). The trọng-số
 * table is a suggestion; picking outside it is `khop_goi_y = false`, a NEUTRAL
 * fact the server records and the market — not this module — arbitrates.
 *
 * The lớp vocabulary + canonical order are Cấp 4's (`LOP_KEYS`), which is itself
 * the backend's, so Cấp 6 can never drift from the ratings it reads.
 */

/** `Lop5Partial` values that mean "Ủng hộ" / "Ngược chiều" (spec §4's trigger). */
const UNG_HO: NhanDinhLop = "ok"
const NGUOC_CHIEU: NhanDinhLop = "bad"

/**
 * spec §4 — the conflict trigger: the user's own 5-lớp ratings contain
 * **≥1 Ủng hộ (`ok`) AND ≥1 Ngược chiều (`bad`)**.
 *
 * Trung tính is neither side, so "all neutral" is NOT a conflict; nor is "all
 * Ủng hộ" or "all Ngược chiều" ("mọi lớp cùng chiều hoặc chỉ trung tính → không
 * hiện bước Đối chiếu").
 *
 * ★ This predicate is the FE's alone: the server records `co_mau_thuan` but
 * deliberately does NOT enforce it, so "render only when conflicting" (and the
 * MUA cổng cứng that follows) is owned here.
 */
export function coMauThuan(doc5Lop: Lop5Partial | null | undefined): boolean {
  if (!doc5Lop) return false
  return lopUngHo(doc5Lop).length > 0 && lopNguocChieu(doc5Lop).length > 0
}

/** Các lớp user chấm **Ủng hộ**, theo thứ tự chuẩn `LOP_KEYS`. */
export function lopUngHo(doc5Lop: Lop5Partial | null | undefined): Lop[] {
  if (!doc5Lop) return []
  return LOP_KEYS.filter((lop) => doc5Lop[lop] === UNG_HO)
}

/** Các lớp user chấm **Ngược chiều**, theo thứ tự chuẩn `LOP_KEYS`. */
export function lopNguocChieu(doc5Lop: Lop5Partial | null | undefined): Lop[] {
  if (!doc5Lop) return []
  return LOP_KEYS.filter((lop) => doc5Lop[lop] === NGUOC_CHIEU)
}

/**
 * spec §4 cổng cứng — when the lớp conflict, MUA stays locked until the user has
 * BOTH picked a lớp quyết định AND written the 1-dòng vì sao.
 *
 * The reason half mirrors the backend's own 422 rule (`POST /cap6/kehoach`
 * rejects a blank `ly_do_doi_chieu`) so the user never meets a raw server error.
 *
 * ★ ANY of the 5 lớp opens the gate — the trọng-số gợi ý is explicitly not a law
 * (spec §5), so a pick outside it is just as valid here.
 */
export function isDoiChieuValid(
  lopQuyetDinh: Lop | null | undefined,
  lyDo: string | null | undefined,
): boolean {
  if (!lopQuyetDinh) return false
  return (lyDo ?? "").trim().length > 0
}
