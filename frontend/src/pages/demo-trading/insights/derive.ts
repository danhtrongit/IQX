/**
 * Pure derivations for the hunt panels.
 *
 * Three-state discipline: `kha_dung === false` means "not enough data to run
 * this filter" and is never drawn as "0 mã"; a missing price is "-", never 0.
 */
import type { HuntFilterKey } from "./copy"
import type { HuntResult, LocSanTieuChi, SanMaIndex } from "./api"

/* ── Hunt filter availability / coverage ───────────────────────────────── */

export function huntFilterAvailability(
  index: SanMaIndex | null | undefined,
  ma: HuntFilterKey
): { kha_dung: boolean | null; ly_do: string | null } {
  const row = index?.bo_loc.find((item) => item.ma === ma)
  if (!row) return { kha_dung: null, ly_do: null }
  return { kha_dung: row.kha_dung, ly_do: row.ly_do_chua_kha_dung ?? null }
}

export function splitLocSan(
  locSan: readonly LocSanTieuChi[] | null | undefined
): { apDung: string[]; chuaApDung: string[] } {
  const apDung: string[] = []
  const chuaApDung: string[] = []
  for (const dk of locSan ?? []) (dk.ap_dung ? apDung : chuaApDung).push(dk.ten)
  return { apDung, chuaApDung }
}

/** Never prints a total the server did not send. */
export function describeHuntTotal(
  result: HuntResult,
  def: { ghi_chu_top: string }
): string {
  const shown = result.items.length.toLocaleString("vi-VN")
  if (result.tong_so_ma == null)
    return `Chưa đếm được tổng số mã thỏa điều kiện · đang hiện ${shown} ${def.ghi_chu_top}`
  return `${result.tong_so_ma.toLocaleString("vi-VN")} mã HOSE thỏa điều kiện · hiện ${shown} ${def.ghi_chu_top}`
}

export type CoverageState = {
  trangThai: "day_du" | "thieu" | "chua_biet"
  text: string
}

/** "N mã thỏa điều kiện" alone claims the whole exchange - this says what was actually scanned. */
export function describeHuntBaoPhu(result: HuntResult): CoverageState {
  const ro = result.so_ma_trong_ro
  const xet = result.so_ma_xet
  const boQua = result.so_ma_bo_qua_thieu_du_lieu

  if (result.ket_qua_day_du === true) {
    return {
      trangThai: "day_du",
      text:
        ro != null
          ? `Đã xét đủ ${ro.toLocaleString("vi-VN")} mã HOSE trong rổ - không mã nào bị bỏ vì thiếu dữ liệu.`
          : "Máy chủ khẳng định đã xét đủ rổ mã của lần chạy này.",
    }
  }
  if (result.ket_qua_day_du === false) {
    if (result.canh_bao_thieu_du_lieu)
      return { trangThai: "thieu", text: result.canh_bao_thieu_du_lieu }
    const veXet =
      xet != null && ro != null
        ? `đã xét ${xet.toLocaleString("vi-VN")}/${ro.toLocaleString("vi-VN")} mã`
        : "chưa xét được hết rổ mã"
    const veBoQua =
      boQua != null
        ? ` - ${boQua.toLocaleString("vi-VN")} mã thiếu dữ liệu`
        : " - một số mã thiếu dữ liệu"
    return {
      trangThai: "thieu",
      text: `Kết quả CHƯA đầy đủ: ${veXet}${veBoQua}, nên danh sách có thể còn sót mã thỏa điều kiện.`,
    }
  }
  return {
    trangThai: "chua_biet",
    text: "Máy chủ chưa cho biết đã xét được bao nhiêu mã trong rổ, nên chưa thể nói con số trên là của cả sàn.",
  }
}

export const HUNT_TOP_NOTE =
  "Tích Theo dõi để đưa mã vào danh sách quan sát - săn mã chưa phải là mua."
