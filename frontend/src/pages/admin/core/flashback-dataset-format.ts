/**
 * Nhãn tiếng Việt và hàm định dạng cho mục "Kho dữ liệu Flashback" (spec v2.2 §6). Giá trị lạ từ
 * máy chủ được hiện nguyên văn thay vì đoán.
 */
import type {
  DatasetPhase,
  DatasetSchedule,
  DatasetTrigger,
  DatasetVersionStatus,
} from "./flashback-dataset-api"
import type { StatusTone } from "./labels"

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** `2012-03-20` thành `20/03/2012`; rỗng thì `—`. */
export function formatDatasetDate(value: string | null | undefined): string {
  if (!value) return "—"
  const match = ISO_DATE.exec(value)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value
}

/** Khoảng thời gian dựng kho: `45 giây`, `1 phút 2 giây`, `2 phút`. */
export function formatDatasetDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return "—"
  if (ms < 1_000) return `${Math.round(ms)} ms`
  const totalSeconds = Math.round(ms / 1_000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes === 0) return `${seconds} giây`
  return seconds === 0 ? `${minutes} phút` : `${minutes} phút ${seconds} giây`
}

export const DATASET_TRIGGER_LABEL: Record<DatasetTrigger, string> = {
  scheduled: "Tự động theo lịch",
  manual: "Quản trị viên bấm Làm mới kho",
  cli: "Dòng lệnh khi triển khai",
}

export const DATASET_VERSION_STATUS: Record<DatasetVersionStatus, { label: string; tone: StatusTone }> = {
  building: { label: "Đang dựng", tone: "info" },
  active: { label: "Đang dùng", tone: "success" },
  retired: { label: "Đã thay thế", tone: "neutral" },
  failed: { label: "Thất bại", tone: "danger" },
}

export const DATASET_PHASE_LABEL: Record<DatasetPhase, string> = {
  basket: "Lấy rổ mã",
  calendar: "Lấy lịch phiên của sàn",
  symbols: "Tải lịch sử giá và tính mảng cộng dồn từng mã",
  finalize: "Kiểm tra ngưỡng và kích hoạt phiên bản",
  done: "Hoàn tất",
}

/** Tiêu đề cảnh báo theo mã do máy chủ gửi. */
export const DATASET_WARNING_TITLE: Record<string, string> = {
  no_active_version: "Chưa có kho dữ liệu đang dùng",
  refresh_failed: "Làm mới kho thất bại",
  too_few_symbols: "Kho có ít mã hơn ngưỡng tối thiểu",
  no_cut: "Có ván không bắt đầu được",
  config_invalid: "Tham số kho không hợp lệ",
}

/** Cơ sở tính giá trị giao dịch của một mã (spec §1.2 `value_raw`). */
export const DATASET_VALUE_BASIS_LABEL: Record<string, string> = {
  matched: "Giá trị khớp thật",
  mixed: "Khớp thật một phần",
  approx: "Ước tính từ giá nhân khối lượng",
}

/** Câu mô tả lịch làm mới tự động: đã tới hạn chưa và vì sao. */
export function describeDatasetSchedule(schedule: DatasetSchedule): string {
  switch (schedule.reason) {
    case "no_active_version":
      return "Tới hạn: chưa có kho đang dùng, tác vụ tự động sẽ tạo kho ở lần chạy kế tiếp."
    case "rebalance_passed":
      return `Tới hạn: kỳ cơ cấu ${formatDatasetDate(schedule.anchor)} đã qua mà kho đang dùng được tạo trước mốc đó.`
    case "up_to_date":
      return schedule.anchor
        ? `Chưa tới hạn: kho được tạo sau kỳ cơ cấu ${formatDatasetDate(schedule.anchor)}.`
        : "Chưa tới hạn: chưa có kỳ cơ cấu nào cần làm mới."
    default:
      return schedule.due ? "Tới hạn làm mới." : "Chưa tới hạn làm mới."
  }
}
