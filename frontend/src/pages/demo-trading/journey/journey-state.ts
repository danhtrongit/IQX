import { createContext } from "react"
import type { JourneyProgress } from "../types"

export function unwrapJourneyData<T>(payload: unknown): T {
  if (payload && typeof payload === "object" && !Array.isArray(payload) && "data" in payload) {
    return (payload as { data: T }).data
  }
  return payload as T
}

export const LEVELS = [
  { name: "Nhập môn", skill: "Làm quen với một vòng mua, theo dõi và bán cổ phiếu.", tasks: [{ no: 1, label: "Lệnh đầu tiên, nắm giữ và theo dõi", panel: "trading" }, { no: 5, label: "Bán và hoàn thành kết sổ đầu tiên", panel: "portfolio" }] },
  { name: "Học việc", skill: "Mỗi quyết định mua đều bắt đầu từ một kế hoạch.", tasks: [{ no: 1, label: "Lệnh đầu tiên có kế hoạch", panel: "trading" }, { no: 2, label: "Kết sổ đầu tiên", panel: "portfolio" }, { no: 3, label: "Trải nghiệm đủ 5 lý do mua", panel: "trading" }, { no: 4, label: "3 lệnh được AI ủng hộ", panel: "trading" }, { no: 5, label: "10 lệnh thực chiến", panel: "trading" }] },
  { name: "Kỷ luật", skill: "Xác định cắt lỗ và chốt lời trước khi đặt lệnh.", tasks: [{ no: 1, label: "10 lệnh có cắt lỗ và chốt lời", panel: "trading" }] },
  { name: "Bản lĩnh", skill: "Phân bổ vốn theo khẩu vị rủi ro và mức độ tự tin.", tasks: [{ no: 1, label: "Thực hành quản lý vốn qua 10 lệnh", panel: "trading" }, { no: 2, label: "Trải nghiệm đủ 3 mức tự tin", panel: "trading" }] },
  { name: "Thuần thục", skill: "Đọc đủ năm lớp thông tin trước khi quyết định.", tasks: [{ no: 1, label: "10 lệnh đọc đủ 5 lớp", panel: "trading" }] },
  { name: "Lão luyện", skill: "Chủ động tìm cơ hội và theo dõi trước khi mua.", tasks: [{ no: 1, label: "Săn 10 mã vào danh sách theo dõi", panel: "hunt" }, { no: 2, label: "Mua 5 mã từ danh sách đã săn", panel: "trading" }] },
  { name: "Bậc thầy", skill: "Nhận diện mâu thuẫn và hành động nhất quán.", tasks: [{ no: 1, label: "3 lần xử lý mâu thuẫn nhất quán", panel: "trading" }] },
] as const

export type Placement = { placed_level: number; answer: string; da_xem_tour: boolean }
export type JourneySnapshot = { level: number; progress: JourneyProgress | null; placement: Placement | null }
export type JourneyState = JourneySnapshot & {
  levelName: string
  mode: "san_tap" | "thuc_chien"
  isLoading: boolean
  error: Error | null
  needsPlacement: boolean
  refresh: () => Promise<void>
  choosePlacement: (answer: "never" | "unsure" | "regular") => Promise<void>
  completeTask: (task: number, gate?: "star" | "debrief") => Promise<void>
  graduate: () => Promise<void>
}
export const JourneyContext = createContext<JourneyState | null>(null)

export function taskDone(level: number, task: number, progress: JourneyProgress | null) {
  if (level === 0 && task === 1) return !!progress?.task_1_done_at && progress.task1_star_clicked === true
  if (level === 0 && task === 5) return !!progress?.task_5_done_at && progress.task5_debrief_done === true
  if (level === 6) return progress?.dat_nhiem_vu === true
  return !!progress?.[`task_${task}_done_at`]
}

export function canGraduate(level: number, progress: JourneyProgress | null) {
  if (!progress || progress.graduated_at) return false
  const tasksDone = LEVELS[level].tasks.every(task => taskDone(level, task.no, progress))
  return tasksDone && (level !== 0 || (progress.task1_star_clicked === true && progress.task5_debrief_done === true))
}
