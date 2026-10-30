/**
 * Khung làm việc của Flashback: sảnh và phòng chờ dùng hết bề rộng (không có panel phải), chỉ màn
 * chơi mới có panel đặt lệnh. Rail công cụ luôn còn nguyên.
 */
import type { ComponentProps } from "react"

import { WorkspaceFrame } from "@/components/layout/workspace-frame"
import { useFlashback } from "./flashback-context"

export function FlashbackFrame(props: Omit<ComponentProps<typeof WorkspaceFrame>, "panelHidden">) {
  const { showPanel } = useFlashback()
  return <WorkspaceFrame {...props} panelHidden={!showPanel} />
}
