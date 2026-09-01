import type { Cap8Progress } from "./types"

export function taskStateCap8(progress: Cap8Progress | null | undefined): "done" | "active" {
  return progress && (
    progress.graduated_at != null
    || progress.so_lenh_thoat_dung_ke_hoach >= progress.muc_tieu_thoat_dung_ke_hoach
  )
    ? "done"
    : "active"
}
