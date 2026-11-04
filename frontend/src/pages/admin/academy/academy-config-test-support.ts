/**
 * Dữ liệu giả cho test màn cấu hình Học viện: đúng cấu trúc trên dây (snake_case) mà
 * `/api/v2/admin/academy-configs*` trả về, cùng một máy chủ giả theo đường dẫn `api()`.
 *
 * `previewFor` chỉ là bản giả của máy chủ trong test (đánh số lại từ 1, cộng số bài, cảnh báo
 * chương chỉ tiêu Dashboard); giao diện thật không bao giờ tự tính các số này.
 */
import type {
  AcademyCatalogChapter,
  AcademyConfigDraft,
  AcademyConfigItem,
  AcademyConfigListResponse,
  AcademyConfigLog,
  AcademyConfigLogsResponse,
  AcademyConfigPreview,
} from "./academy-config-api"

const DASHBOARD_WARNING = "Nút Học ở Dashboard của các chỉ tiêu thuộc chương này sẽ không có bài."

function chapter(
  no: number,
  title: string,
  lesson_count: number,
  flags: Partial<Pick<AcademyCatalogChapter, "has_practice" | "has_dashboard_metrics">> = {},
): AcademyCatalogChapter {
  return {
    chapter_id: `ch${String(no).padStart(2, "0")}`,
    no,
    title,
    lesson_count,
    has_practice: flags.has_practice ?? false,
    has_dashboard_metrics: flags.has_dashboard_metrics ?? false,
  }
}

/** 12 chương của danh mục gốc, tổng 116 bài bắt buộc. */
export const CATALOG: AcademyCatalogChapter[] = [
  chapter(1, "Nền tảng", 12),
  chapter(2, "Kỹ năng Sale SACO", 10),
  chapter(3, "Thương hiệu cá nhân", 10, { has_practice: true }),
  chapter(4, "Phương pháp kỹ thuật", 18),
  chapter(5, "Chỉ báo xu hướng", 8),
  chapter(6, "Chỉ báo động lượng", 8),
  chapter(7, "Chỉ báo khối lượng", 6),
  chapter(8, "Phân tích cơ bản chung", 12, { has_dashboard_metrics: true }),
  chapter(9, "Phân tích doanh nghiệp sản xuất", 10, { has_dashboard_metrics: true }),
  chapter(10, "Phân tích ngân hàng", 8, { has_dashboard_metrics: true }),
  chapter(11, "Phân tích công ty chứng khoán", 7),
  chapter(12, "Phân tích công ty bảo hiểm", 7),
]

export const ALL_IDS = CATALOG.map((entry) => entry.chapter_id)
export const IDS_WITHOUT_CH02 = ALL_IDS.filter((id) => id !== "ch02")

const ADMIN = { id: "admin-1", username: "admin", full_name: "Quản Trị Viên" }

function lessonsOf(ids: readonly string[]): number {
  return CATALOG.filter((entry) => ids.includes(entry.chapter_id)).reduce((sum, entry) => sum + entry.lesson_count, 0)
}

/** Cấu hình mặc định: học tự do, đủ 12 chương, 12 người dùng đang áp dụng. */
export function defaultItem(overrides: Partial<AcademyConfigItem> = {}): AcademyConfigItem {
  return {
    id: "cfg-default",
    owner_type: "default",
    leader: null,
    name: "Mặc định",
    inherits_default: false,
    mode: "free",
    chapter_ids: ALL_IDS,
    chapter_count: 12,
    chapter_total: 12,
    required_total: 116,
    user_count: 12,
    updated_at: "2026-11-01T03:00:00Z",
    updated_by: ADMIN,
    ...overrides,
  }
}

/** Trưởng nhóm có cấu hình riêng: học lần lượt, bỏ chương 2 (11/12 chương, 106 bài). */
export function leaderOwnItem(overrides: Partial<AcademyConfigItem> = {}): AcademyConfigItem {
  return {
    id: "cfg-lan",
    owner_type: "leader",
    leader: { user_id: "lead-lan", username: "lan.nguyen", full_name: "Nguyễn Lan", status: "active" },
    name: "Nguyễn Lan",
    inherits_default: false,
    mode: "sequential",
    chapter_ids: IDS_WITHOUT_CH02,
    chapter_count: 11,
    chapter_total: 12,
    required_total: 106,
    user_count: 5,
    updated_at: "2026-11-02T04:30:00Z",
    updated_by: ADMIN,
    ...overrides,
  }
}

/** Trưởng nhóm chưa có cấu hình riêng: dòng mang cách học và chương của cấu hình mặc định. */
export function leaderInheritingItem(overrides: Partial<AcademyConfigItem> = {}): AcademyConfigItem {
  return {
    id: null,
    owner_type: "leader",
    leader: { user_id: "lead-bao", username: "bao.pham", full_name: "Phạm Bảo", status: "active" },
    name: "Phạm Bảo",
    inherits_default: true,
    mode: "free",
    chapter_ids: ALL_IDS,
    chapter_count: 12,
    chapter_total: 12,
    required_total: 116,
    user_count: 3,
    updated_at: null,
    updated_by: null,
    ...overrides,
  }
}

/** Trưởng nhóm đã thôi bổ nhiệm vẫn giữ cấu hình riêng. */
export function leaderRevokedItem(overrides: Partial<AcademyConfigItem> = {}): AcademyConfigItem {
  return leaderOwnItem({
    id: "cfg-hung",
    leader: { user_id: "lead-hung", username: "hung.le", full_name: "Lê Hùng", status: "revoked" },
    name: "Lê Hùng",
    mode: "free",
    chapter_ids: ALL_IDS.slice(0, 4),
    chapter_count: 4,
    required_total: 50,
    user_count: 0,
    ...overrides,
  })
}

export function listResponse(items: AcademyConfigItem[] = [defaultItem(), leaderOwnItem(), leaderInheritingItem(), leaderRevokedItem()]): AcademyConfigListResponse {
  return { catalog_version: "v4", catalog_chapters: CATALOG, items }
}

/** Bản giả của máy chủ: đánh số lại từ 1 theo thứ tự danh mục, cộng số bài, cảnh báo chương chỉ tiêu. */
export function previewFor(draft: AcademyConfigDraft): AcademyConfigPreview {
  const kept = CATALOG.filter((entry) => draft.chapter_ids.includes(entry.chapter_id))
  return {
    mode: draft.mode,
    chapter_count: kept.length,
    chapter_total: CATALOG.length,
    required_total: lessonsOf(draft.chapter_ids),
    chapters: kept.map((entry, index) => ({
      chapter_id: entry.chapter_id,
      display_no: index + 1,
      title: entry.title,
      lesson_count: entry.lesson_count,
      has_practice: entry.has_practice,
    })),
    warnings: CATALOG.filter((entry) => entry.has_dashboard_metrics && !draft.chapter_ids.includes(entry.chapter_id)).map(
      (entry) => ({
        code: "DASHBOARD_METRIC_CHAPTER_REMOVED" as const,
        chapter_id: entry.chapter_id,
        title: entry.title,
        message: DASHBOARD_WARNING,
      }),
    ),
  }
}

export { DASHBOARD_WARNING }

export function logEntry(overrides: Partial<AcademyConfigLog> = {}): AcademyConfigLog {
  return {
    id: "log-1",
    action: "update",
    changed_at: "2026-11-02T04:30:00Z",
    changed_by: ADMIN,
    before: { mode: "free", chapter_ids: ALL_IDS },
    after: { mode: "sequential", chapter_ids: IDS_WITHOUT_CH02 },
    ...overrides,
  }
}

export function logsResponse(items: AcademyConfigLog[] = [logEntry()]): AcademyConfigLogsResponse {
  return { items }
}

/** Trạng thái và lỗi của máy chủ giả; test đổi các trường này giữa các lần gọi. */
export type AcademyServer = {
  list: AcademyConfigListResponse
  logs: AcademyConfigLogsResponse
  listError: Error | null
  previewError: Error | null
  logsError: Error | null
  writeError: Error | null
  /** Thân của mọi lần gọi xem trước, theo thứ tự. */
  previewBodies: AcademyConfigDraft[]
}

export function createAcademyServer(): AcademyServer {
  return {
    list: listResponse(),
    logs: logsResponse(),
    listError: null,
    previewError: null,
    logsError: null,
    writeError: null,
    previewBodies: [],
  }
}

/** Hàm thay cho `api()`: trả lời đúng các đường dẫn `requestOperation` gửi tới. */
export function academyApiHandler(server: AcademyServer) {
  return async (path: string, init?: RequestInit): Promise<unknown> => {
    const method = init?.method ?? "GET"
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined
    if (method === "GET" && path === "/admin/academy-configs") {
      if (server.listError) throw server.listError
      return server.list
    }
    if (method === "POST" && path === "/admin/academy-configs/preview") {
      if (server.previewError) throw server.previewError
      const draft = body as AcademyConfigDraft
      server.previewBodies.push(draft)
      return previewFor(draft)
    }
    if (method === "GET" && /^\/admin\/academy-configs\/[^/]+\/logs/.test(path)) {
      if (server.logsError) throw server.logsError
      return server.logs
    }
    if (method === "POST" && path === "/admin/academy-configs") {
      if (server.writeError) throw server.writeError
      const draft = body as AcademyConfigDraft
      return leaderOwnItem({ id: "cfg-new", name: "Phạm Bảo", mode: draft.mode, chapter_ids: draft.chapter_ids })
    }
    if (method === "PUT" && /^\/admin\/academy-configs\/[^/]+$/.test(path)) {
      if (server.writeError) throw server.writeError
      const draft = body as AcademyConfigDraft
      const saved = { mode: draft.mode, chapter_ids: draft.chapter_ids }
      return path.endsWith("/cfg-default") ? defaultItem(saved) : leaderOwnItem(saved)
    }
    if (method === "DELETE" && /^\/admin\/academy-configs\/[^/]+$/.test(path)) {
      if (server.writeError) throw server.writeError
      return leaderInheritingItem()
    }
    throw new Error(`Không có route giả lập: ${method} ${path}`)
  }
}
