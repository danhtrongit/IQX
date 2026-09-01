import type { DanhMucCap8 } from "./types"

/** Honest copy for the retained pre-exit Level 8 UI: unknown stop coverage is not zero risk. */
export function caveatThieuCatLoCap8(danhMuc: DanhMucCap8 | null | undefined): string | null {
  const missing = danhMuc?.so_vi_the_thieu_cat_lo
  if (missing == null || missing === 0) return null
  return `${missing} vị thế chưa có mức cắt lỗ nên tổng rủi ro chưa thể xác nhận đầy đủ.`
}
