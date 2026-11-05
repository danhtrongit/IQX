/**
 * Tuỳ chọn của thanh công cụ vẽ nhớ trên máy: công cụ yêu thích (theo tài khoản), công cụ dùng gần nhất của từng nhóm và chế độ nam châm.
 *
 * Mọi đọc ghi đều bọc try/catch: `localStorage` có thể ném lỗi khi truy cập (chế độ riêng tư, chặn dữ liệu trang) hoặc đầy. Khi đó thanh công cụ
 * vẫn chạy bình thường bằng trạng thái trong phiên, chỉ không nhớ sang lần sau.
 *
 * Yêu thích gắn với `scope`: trang truyền chủ sở hữu của layout đang lưu (người dùng hay khách), nên mỗi tài khoản trên một máy có danh sách riêng.
 * Chưa đồng bộ lên máy chủ: endpoint hiện có lưu theo mã cổ phiếu, không có chỗ cho tuỳ chọn chung của tài khoản.
 */
import { isDrawingTool, normalizeMagnet, type MagnetMode } from "../drawings"
import type { DrawingTool } from "../types"

export const MAX_FAVORITES = 8

const FAVORITES_KEY = "iqx.iqline_tool_favorites_v1"
const LAST_TOOLS_KEY = "iqx.iqline_last_tools_v1"
const MAGNET_KEY = "iqx.iqline_magnet_v1"

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage
  } catch {
    return null
  }
}

function readJson(key: string): unknown {
  try {
    const raw = storage()?.getItem(key)
    return raw ? (JSON.parse(raw) as unknown) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    storage()?.setItem(key, JSON.stringify(value))
  } catch {
    // Hết dung lượng hoặc bị chặn: bỏ qua, trạng thái trong phiên vẫn đúng.
  }
}

/** Chỉ giữ tên công cụ có thật, không trùng, tối đa `MAX_FAVORITES`; `allowed` thu hẹp thêm theo chế độ của biểu đồ. */
export function sanitizeFavorites(value: unknown, allowed?: readonly DrawingTool[]): DrawingTool[] {
  if (!Array.isArray(value)) return []
  const out: DrawingTool[] = []
  for (const item of value) {
    if (!isDrawingTool(item) || out.includes(item) || (allowed && !allowed.includes(item))) continue
    out.push(item)
    if (out.length >= MAX_FAVORITES) break
  }
  return out
}

export function readFavorites(scope: string, allowed?: readonly DrawingTool[]): DrawingTool[] {
  return sanitizeFavorites(readJson(`${FAVORITES_KEY}:${scope}`), allowed)
}

export function writeFavorites(scope: string, tools: readonly DrawingTool[]): void {
  writeJson(`${FAVORITES_KEY}:${scope}`, tools)
}

/** Thêm hoặc bỏ một công cụ. Danh sách đầy thì không thêm được nữa (trả về danh sách cũ). */
export function toggleFavorite(favorites: readonly DrawingTool[], tool: DrawingTool): DrawingTool[] {
  if (favorites.includes(tool)) return favorites.filter((item) => item !== tool)
  return favorites.length >= MAX_FAVORITES ? [...favorites] : [...favorites, tool]
}

export function readLastTools(): Record<string, DrawingTool> {
  const raw = readJson(LAST_TOOLS_KEY)
  const out: Record<string, DrawingTool> = {}
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return out
  for (const [group, tool] of Object.entries(raw)) if (isDrawingTool(tool)) out[group] = tool
  return out
}

export function writeLastTools(value: Readonly<Record<string, DrawingTool>>): void {
  writeJson(LAST_TOOLS_KEY, value)
}

/** Đọc chế độ nam châm đã nhớ; layout cũ lưu boolean thì `true` thành yếu, `false` thành tắt. */
export function readMagnet(): MagnetMode {
  return normalizeMagnet(readJson(MAGNET_KEY))
}

export function writeMagnet(mode: MagnetMode): void {
  writeJson(MAGNET_KEY, mode)
}
