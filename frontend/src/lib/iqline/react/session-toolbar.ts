/**
 * Nối thanh công cụ đầy đủ (`drawing-toolbar.tsx`) với hình vẽ của một ván Flashback (docs/iqline-design.md §10, §12).
 *
 * Thanh công cụ của ván nằm ngoài biểu đồ nên không có `IQLineChart` để đọc. Hook này dựng cùng hình dạng (`ToolbarChart`) từ
 * `SessionDrawingController`: trạng thái hình lấy từ snapshot, hành động đi qua `drawings.dispatch` vào biểu đồ đang gắn. Công cụ được
 * phép là `FLASHBACK_TOOLS`, đúng danh sách mà `flashbackConfig` đưa cho bộ giảm trạng thái (bộ giảm vẫn là bên chặn cuối cùng).
 */
import { useMemo, useSyncExternalStore } from "react"

import { FLASHBACK_TOOLS } from "../drawings"
import type { ToolbarChart } from "./drawing-toolbar"
import type { SessionDrawingController } from "./session-drawings"

export function useSessionToolbarChart(drawings: SessionDrawingController): ToolbarChart {
  const snapshot = useSyncExternalStore(drawings.subscribe, drawings.getSnapshot, drawings.getSnapshot)
  return useMemo(
    () => ({
      state: {
        drawings: { tool: snapshot.tool, selectedId: snapshot.selectedId, shapes: snapshot.shapes, pending: snapshot.draft },
        magnet: snapshot.magnet,
      },
      config: { allowedTools: FLASHBACK_TOOLS },
      controller: { dispatch: drawings.dispatch },
    }),
    [snapshot, drawings],
  )
}
