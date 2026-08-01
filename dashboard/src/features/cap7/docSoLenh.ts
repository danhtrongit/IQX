import type { BandLuc, QuyTacCap7 } from "./types"

/**
 * Khối "Đọc sổ lệnh" — PURE helpers (spec §4/§5).
 *
 * Everything the block needs that isn't rendering or fetching lives here so it
 * can be unit-tested without React: the chỉ số Lực, the band it falls in, the
 * gauge, and the cờ cảnh giác heuristic.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ★★ EVERY THRESHOLD IS A PARAMETER, NEVER A LITERAL IN THIS FILE ★★
 * ══════════════════════════════════════════════════════════════════════════
 * `GET /cap7/phien` publishes `quy_tac` — the band cut-offs, the cờ's hệ số and
 * minimum level count, the dead band and the chấm window. Those exact numbers
 * decide, SERVER-SIDE, whether a user's reading counted as right. If this file
 * hardcoded `1.5`, the gauge would silently disagree with the chấm the day the
 * backend retunes its bands, and the user would be shown a band that
 * contradicts how their own reading was scored.
 *
 * So `bandLuc` and `coCanhGiac` take the server's rules as an argument and
 * return `null` when they have none — an honest "chưa đọc được" instead of a
 * fabricated verdict.
 *
 * ★ The cờ is a SHAPE HEURISTIC on a static snapshot. A hit means "look twice",
 * never "IQX found a fake order" — telling a real wall from a spoof needs
 * continuous tick data, which spec §9 puts explicitly out of scope.
 */

/** One level of the bid/ask ladder — the shape `usePrice(symbol)` already has. */
export interface MucSoLenh {
  price: number
  volume: number
}

/** Which level tripped the cờ, so the copy can name the price (spec §5). */
export interface CoCanhGiac {
  /** Always `true` when present — the absent case is the `null` return. */
  hit: boolean
  price: number
  volume: number
}

/** Just the two band cut-offs out of `quy_tac`. */
export type NguongLuc = Pick<QuyTacCap7, "nguong_cau_ap_dao" | "nguong_cung_ap_dao">
/** Just the cờ rule out of `quy_tac`. */
export type QuyTacCo = Pick<QuyTacCap7, "co_canh_giac_he_so" | "co_canh_giac_min_muc">

/** Số ô của thanh Lực (thuần hiển thị — không phải một ngưỡng). */
export const SO_O_GAUGE = 10

function volumeOf(muc: MucSoLenh | null | undefined): number {
  const v = Number(muc?.volume)
  return Number.isFinite(v) && v > 0 ? v : 0
}

/** Tổng khối lượng dư của các mức đã cho (0 cho sổ rỗng — không bao giờ NaN). */
export function tongDu(levels: readonly MucSoLenh[] | null | undefined): number {
  if (!levels?.length) return 0
  return levels.reduce((sum, muc) => sum + volumeOf(muc), 0)
}

/**
 * Chỉ số Lực = tổng dư MUA (3 mức) / tổng dư BÁN (3 mức).
 *
 * ★ `null` — never `Infinity`, never a divide-by-zero render — when either side
 * has no volume at all:
 *   · dư BÁN = 0 would be a division by zero;
 *   · dư MUA = 0 would give 0, which `POST /cap7/kehoach` rejects (the ratio
 *     must be finite and > 0).
 * Both cases mean the same honest thing: **the book is too thin to read.**
 */
export function lucChiSo(
  bid: readonly MucSoLenh[] | null | undefined,
  ask: readonly MucSoLenh[] | null | undefined,
): number | null {
  const mua = tongDu(bid)
  const ban = tongDu(ask)
  if (mua <= 0 || ban <= 0) return null
  const ratio = mua / ban
  return Number.isFinite(ratio) && ratio > 0 ? ratio : null
}

/**
 * The band a chỉ số Lực falls in — **using the SERVER's cut-offs** (`quy_tac`).
 *
 * `null` when there is no ratio, when the ratio is not a usable number, or when
 * the server's rules have not arrived yet. The FE never guesses a band.
 */
export function bandLuc(
  ratio: number | null | undefined,
  nguong: NguongLuc | null | undefined,
): BandLuc | null {
  if (ratio == null || !nguong) return null
  if (!Number.isFinite(ratio) || ratio <= 0) return null
  if (ratio >= nguong.nguong_cau_ap_dao) return "cau_ap_dao"
  if (ratio <= nguong.nguong_cung_ap_dao) return "cung_ap_dao"
  return "can_bang"
}

/**
 * Số ô sáng của thanh Lực — phần dư MUA chiếm trong TỔNG dư hai bên.
 *
 * Deliberately a share, not a re-encoding of the bands: it is monotonic, has no
 * threshold of its own to drift from the server's, and reproduces spec §4's own
 * drawing (1,240,000 vs 640,000 → `▓▓▓▓▓▓▓░░░`).
 */
export function gaugeFill(tongMua: number, tongBan: number, soO: number = SO_O_GAUGE): number {
  const tong = tongMua + tongBan
  if (!Number.isFinite(tong) || tong <= 0) return 0
  const phan = Math.round((tongMua / tong) * soO)
  return Math.min(soO, Math.max(0, phan))
}

/**
 * Cờ cảnh giác — the level whose volume is abnormally large versus the others,
 * or `null` when the rule stays silent. Mirrors the backend's `co_canh_giac`.
 *
 * Rule (spec §5, the exact numbers published in `quy_tac`): one level's volume >
 * `co_canh_giac_he_so` × the MEAN OF THE REMAINING levels, applied across the
 * bid + ask levels TOGETHER. Only the largest level can ever trip it, so the
 * answer is unambiguous and the copy can name the price.
 *
 * Silent — never a guess — when there are fewer than `co_canh_giac_min_muc`
 * levels (the "mean of the remaining" would be too few samples), when the
 * remaining levels have no volume to compare against, or when the server's rule
 * has not arrived.
 *
 * ★ A hit means "look twice", NOT "this is a fake order".
 */
export function coCanhGiac(
  levels: readonly MucSoLenh[] | null | undefined,
  quyTac: QuyTacCo | null | undefined,
): CoCanhGiac | null {
  if (!levels?.length || !quyTac) return null
  const minMuc = quyTac.co_canh_giac_min_muc
  const heSo = quyTac.co_canh_giac_he_so
  if (!Number.isFinite(minMuc) || !Number.isFinite(heSo)) return null
  if (levels.length < minMuc) return null

  let peak = 0
  for (let i = 1; i < levels.length; i += 1) {
    if (volumeOf(levels[i]) > volumeOf(levels[peak])) peak = i
  }
  const conLai = levels.filter((_, i) => i !== peak)
  if (!conLai.length) return null
  const trungBinh = tongDu(conLai) / conLai.length
  if (trungBinh <= 0) return null
  const dinh = volumeOf(levels[peak])
  if (dinh <= heSo * trungBinh) return null
  return { hit: true, price: levels[peak].price, volume: dinh }
}

/** One reading of the book — what the block renders AND what the buy records. */
export interface SnapshotSoLenh {
  tongMua: number
  tongBan: number
  /** `null` = sổ quá mỏng để đọc (xem `lucChiSo`). */
  chiSo: number | null
  band: BandLuc | null
  co: CoCanhGiac | null
  /** Có đủ dữ liệu để hiện gauge và để GHI bước đọc lực hay không. */
  docDuoc: boolean
}

/**
 * One snapshot of the book, shared by the block (what the user sees) and by the
 * panel (what `POST /cap7/kehoach` records) — computed once per render so the
 * number the user read and the number committed are the SAME number.
 */
export function docSoLenhSnapshot(
  bid: readonly MucSoLenh[] | null | undefined,
  ask: readonly MucSoLenh[] | null | undefined,
  quyTac: QuyTacCap7 | null | undefined,
): SnapshotSoLenh {
  const tongMua = tongDu(bid)
  const tongBan = tongDu(ask)
  const chiSo = lucChiSo(bid, ask)
  return {
    tongMua,
    tongBan,
    chiSo,
    band: bandLuc(chiSo, quyTac),
    co: coCanhGiac([...(bid ?? []), ...(ask ?? [])], quyTac),
    docDuoc: chiSo != null,
  }
}
