import { Modal } from "@arco-design/web-react"
import { Badge, LEVELS } from "@/features/cap0/Badge"
import { CAP_MAX_ENABLED } from "@/features/cap1/capFlags"
import { useEnterCap8 } from "@/features/cap8/hooks"
import { useGraduateCap7, useCap7Progress } from "./hooks"
import type { Cap7Progress } from "./types"

export function isGraduationReadyCap7(progress: Cap7Progress | null | undefined): boolean {
  return progress?.can_doi_ok === true && progress.graduated_at == null
}

export function GraduationModalCap7() {
  const { data: progress } = useCap7Progress()
  const graduate = useGraduateCap7()
  const enterCap8 = useEnterCap8()
  const ready = isGraduationReadyCap7(progress)
  const graduated = progress?.graduated_at != null

  return (
    <Modal visible={ready || graduated} closable={false} footer={null}>
      <Badge n={LEVELS[7].n} color={LEVELS[7].color} fill={7} size={120} glow />
      <h2>Danh mục của bạn đã cân đối</h2>
      <p>1/1 nhiệm vụ hoàn thành: không mã nào quá 30%, không ngành nào quá 40%, và rổ có đủ mã lẫn ngành.</p>
      {graduated ? (
        CAP_MAX_ENABLED >= 8 ? (
          <button type="button" onClick={() => enterCap8.mutate()}>Vào Cấp 8</button>
        ) : (
          <p>Cấp tiếp theo sẽ mở theo lộ trình.</p>
        )
      ) : (
        <button type="button" onClick={() => graduate.mutate()} disabled={graduate.isPending}>Xác nhận tốt nghiệp</button>
      )}
    </Modal>
  )
}
