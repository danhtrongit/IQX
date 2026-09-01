import { Modal } from "@arco-design/web-react"
import { Badge, LEVELS } from "@/features/cap0/Badge"
import { useCap8Progress, useGraduateCap8 } from "./hooks"
import type { Cap8Progress } from "./types"

export function isGraduationReadyCap8(progress: Cap8Progress | null | undefined): boolean {
  return progress != null
    && progress.graduated_at == null
    && progress.so_lenh_thoat_dung_ke_hoach >= progress.muc_tieu_thoat_dung_ke_hoach
}

export function GraduationModalCap8() {
  const { data: progress } = useCap8Progress()
  const graduate = useGraduateCap8()
  const ready = isGraduationReadyCap8(progress)
  return (
    <Modal visible={ready} closable={false} footer={null}>
      <Badge n={LEVELS[8].n} color={LEVELS[8].color} fill={8} size={120} glow />
      <h2>Hoàn thành chương trình Học tập</h2>
      <p>Bạn đã hoàn thành 5/5 lần thoát lệnh theo kế hoạch với bằng chứng do hệ thống đối chiếu.</p>
      <p>Đây là cột mốc cuối của lộ trình Cấp 0–8.</p>
      <button type="button" onClick={() => graduate.mutate()} disabled={graduate.isPending}>
        {graduate.isPending ? "Đang xác nhận…" : "Xác nhận hoàn thành"}
      </button>
    </Modal>
  )
}
