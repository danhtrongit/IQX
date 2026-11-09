/**
 * Khung làm việc của Candle Dojo: một màn duy nhất, không có panel phải (cột phải nằm trong chính màn Dojo).
 * Khi đang làm một việc tập trung (nhập môn, bài học, luyện công, thi đai) rail công cụ cũng được ẩn để màn học
 * dùng hết bề rộng; thoát bằng nút ✕ của màn đó (spec §1).
 */
import type { ComponentProps } from "react"

import { WorkspaceFrame } from "@/components/layout/workspace-frame"
import { useCandleDojo } from "./candle-dojo-context"

export function CandleDojoFrame(props: Omit<ComponentProps<typeof WorkspaceFrame>, "panelHidden" | "railHidden">) {
  const { screen } = useCandleDojo()
  return <WorkspaceFrame {...props} panelHidden railHidden={screen.kind !== "home"} />
}
