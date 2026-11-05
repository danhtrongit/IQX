/**
 * Phím tắt (docs/iqline-design.md §7). Hàm thuần đổi một phím thành hành động; bên dùng chỉ gọi khi biểu đồ có focus và
 * không đang gõ trong ô nhập, và gọi `preventDefault` khi kết quả khác null.
 *
 * + hoặc =: phóng to. - hoặc _: thu nhỏ. Mũi tên trái và phải: kéo 1 nến (Shift: 10 nến); khi không kéo được (static,
 * hoặc Flashback tắt kéo) hoặc giữ Alt thì mũi tên di chuyển crosshair từng nến (§7 "Tiếp cận"). Esc: huỷ vẽ, rồi bỏ chọn, rồi tắt
 * crosshair. Enter: hoàn tất đường gấp khúc đang vẽ. Delete hoặc Backspace: xoá hình đang chọn. Ctrl hoặc Cmd + Z: hoàn tác; thêm Shift hoặc Ctrl + Y: làm lại.
 */
import { isVariableTool } from "../drawings"
import type { InteractionAction, InteractionConfig, InteractionState, KeyInput } from "./types"
import { KEY_PAN_BARS, KEY_PAN_BARS_FAST } from "./gestures"

export function keyToAction(
  key: KeyInput,
  config: Pick<InteractionConfig, "zoom" | "pan" | "history" | "allowedTools">,
  state: Pick<InteractionState, "drawings" | "crosshair">,
): InteractionAction | null {
  const command = Boolean(key.ctrlKey || key.metaKey)
  const name = key.key.length === 1 ? key.key.toLowerCase() : key.key

  if (command) {
    if (!config.history) return null
    if (name === "z") return { type: key.shiftKey ? "redo" : "undo" }
    if (name === "y") return { type: "redo" }
    return null
  }

  switch (name) {
    case "+":
    case "=":
      return config.zoom ? { type: "zoom", direction: "in" } : null
    case "-":
    case "_":
      return config.zoom ? { type: "zoom", direction: "out" } : null
    case "ArrowLeft":
    case "ArrowRight": {
      const sign = name === "ArrowLeft" ? -1 : 1
      const bars = sign * (key.shiftKey ? KEY_PAN_BARS_FAST : KEY_PAN_BARS)
      if (key.altKey || !config.pan) return { type: "move-crosshair", bars }
      return { type: "pan", bars }
    }
    case "Escape": {
      const { drawings } = state
      if (config.allowedTools.length > 0) {
        if (drawings.tool !== null || drawings.pending !== null) return { type: "drawing", action: { type: "cancel" } }
        if (drawings.selectedId !== null) return { type: "drawing", action: { type: "select", id: null } }
      }
      return state.crosshair ? { type: "clear-crosshair" } : null
    }
    case "Enter": {
      // Hoàn tất hình nhiều điểm đang vẽ (đường gấp khúc).
      const { pending } = state.drawings
      if (config.allowedTools.length === 0 || !pending || !isVariableTool(pending.tool)) return null
      return { type: "drawing", action: { type: "finish" } }
    }
    case "Delete":
    case "Backspace":
      if (config.allowedTools.length === 0 || state.drawings.selectedId === null) return null
      return { type: "drawing", action: { type: "remove", id: state.drawings.selectedId } }
    default:
      return null
  }
}
