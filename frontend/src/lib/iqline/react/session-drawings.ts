/**
 * Hình vẽ theo ván của chế độ `flashback` (docs/iqline-design.md §6, §11, §12): `SessionDrawingController` do trang giữ và
 * đưa vào `<IQLineFlashback drawings={...} />`. Hình chỉ nằm trong bộ nhớ của trình duyệt, không có `store`, không có API:
 * trang tạo một controller cho mỗi ván nên sang ván mới là bắt đầu lại, còn đóng rồi mở lại cửa sổ kết quả thì giữ nguyên.
 *
 * Vì sao có controller riêng: nút công cụ ("Xu hướng", "Fibonacci", "Đường ngang", "Xoá") nằm ở thanh của trang, ngoài biểu đồ,
 * còn hình và công cụ đang bật nằm trong bộ giảm trạng thái của biểu đồ. Controller là cầu nối hai phía và giữ danh sách
 * hình để biểu đồ dựng lại (đổi bố cục, tải chậm) không làm mất hình.
 *
 * - Phía trang: `getSnapshot`/`subscribe` (dùng với `useSyncExternalStore`), `toggleTool`, `cancel`, `removeSelected`, `clear`, và `dispatch`
 *   cho thanh công cụ đầy đủ (`session-toolbar.tsx`: nhóm công cụ, nam châm, danh sách hình, thanh kiểu và thanh Xong, Huỷ).
 * - Phía biểu đồ: `attach` đưa vào một `sink` nhận hành động, `report` báo trạng thái hình mỗi khi đổi.
 *
 * Không chạm DOM và không biết luật game.
 */
import { clearOutcome, type DrawingsState, type MagnetMode, type PendingDrawing } from "../drawings"
import type { InteractionAction } from "../interaction"
import type { Drawing, DrawingTool } from "../types"

export type SessionDrawingsSnapshot = {
  /** Công cụ đang bật (nút sáng); null là chế độ bình thường. */
  tool: DrawingTool | null
  selectedId: string | null
  shapes: readonly Drawing[]
  /** Đã bấm điểm đầu, đang chờ điểm cuối. */
  pending: boolean
  /** Các điểm đã bấm của hình đang vẽ dở (thanh Xong và Huỷ của đường gấp khúc cần số điểm); null khi không vẽ. */
  draft: PendingDrawing | null
  /** Nam châm đang bật: nút nam châm của thanh công cụ hiện đúng mức. */
  magnet: MagnetMode
}

/** Nơi nhận hành động: bộ điều khiển của biểu đồ đang gắn. */
export type DrawingSink = { dispatch(action: InteractionAction): void }

export type SessionDrawingController = {
  getSnapshot(): SessionDrawingsSnapshot
  subscribe(listener: () => void): () => void
  /** Bật công cụ; bấm lại công cụ đang sáng thì huỷ vẽ. Không có biểu đồ gắn thì bỏ qua. */
  toggleTool(tool: DrawingTool): void
  /** Esc: huỷ công cụ và điểm đầu đang chờ. */
  cancel(): void
  /** Delete: xoá hình đang chọn. Trả về true nếu có hình để xoá. */
  removeSelected(): boolean
  /** Nút Xoá (v2.1 §7.4): hình đang chọn, không thì tất cả; trả về câu báo cho người chơi. */
  clear(): { message: string }
  /** Gửi một hành động thẳng vào biểu đồ đang gắn (đổi nam châm, khoá, ẩn, đổi kiểu hình...); bỏ qua nếu chưa có biểu đồ. */
  dispatch(action: InteractionAction): void
  /** Nạp hình có sẵn (hình của biểu đồ cũ chuyển sang); bỏ qua nếu đã có hình. */
  seed(shapes: readonly Drawing[]): void
  /** Phía biểu đồ: gắn hoặc gỡ nơi nhận hành động; gắn lại thì nạp lại hình đã giữ. */
  attach(sink: DrawingSink | null): void
  /** Phía biểu đồ: trạng thái hình mới nhất. */
  report(state: Pick<DrawingsState, "tool" | "selectedId" | "shapes" | "pending"> & { magnet?: MagnetMode }): void
}

const EMPTY: SessionDrawingsSnapshot = { tool: null, selectedId: null, shapes: [], pending: false, draft: null, magnet: "off" }

export function createSessionDrawings(): SessionDrawingController {
  let snapshot = EMPTY
  let sink: DrawingSink | null = null
  const listeners = new Set<() => void>()

  const emit = () => {
    for (const listener of [...listeners]) listener()
  }

  const controller: SessionDrawingController = {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    toggleTool(tool) {
      // Bộ giảm tự đảo khi bấm lại đúng công cụ đang bật, theo trạng thái mới nhất của biểu đồ.
      sink?.dispatch({ type: "tool", tool })
    },
    cancel() {
      if (snapshot.tool === null && !snapshot.pending) return
      sink?.dispatch({ type: "drawing", action: { type: "cancel" } })
    },
    removeSelected() {
      const id = snapshot.selectedId
      if (id === null || !sink) return false
      sink.dispatch({ type: "drawing", action: { type: "remove", id } })
      return true
    },
    clear() {
      const outcome = clearOutcome(snapshot)
      if (outcome.action) sink?.dispatch({ type: "drawing", action: outcome.action })
      return { message: outcome.message }
    },
    dispatch(action) {
      sink?.dispatch(action)
    },
    seed(shapes) {
      if (snapshot.shapes.length > 0 || shapes.length === 0) return
      snapshot = { ...snapshot, shapes }
      sink?.dispatch({ type: "set-drawings", drawings: shapes })
      emit()
    },
    attach(next) {
      sink = next
      // Biểu đồ dựng lại: nạp hình đã giữ (không ghi vào lịch sử, không báo ngược `onDrawingsChange`).
      if (next && snapshot.shapes.length > 0) next.dispatch({ type: "set-drawings", drawings: snapshot.shapes })
      if (next && snapshot.magnet !== "off") next.dispatch({ type: "magnet", on: snapshot.magnet })
    },
    report(state) {
      const next: SessionDrawingsSnapshot = {
        tool: state.tool,
        selectedId: state.selectedId,
        shapes: state.shapes,
        pending: state.pending !== null,
        draft: state.pending,
        magnet: state.magnet ?? snapshot.magnet,
      }
      if (
        next.tool === snapshot.tool &&
        next.selectedId === snapshot.selectedId &&
        next.shapes === snapshot.shapes &&
        next.pending === snapshot.pending &&
        next.draft === snapshot.draft &&
        next.magnet === snapshot.magnet
      ) {
        return
      }
      snapshot = next
      emit()
    },
  }
  return controller
}
