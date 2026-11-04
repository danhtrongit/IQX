import { describe, expect, it } from "vitest"

import { ApiError } from "@/lib/api"

import {
  academyConfigErrorMessage,
  chapterCountLabel,
  chapterIdsInCatalogOrder,
  chapterLabel,
  chapterTitleById,
  configDataSummary,
  isStaleAcademyConfigError,
  lessonTotalLabel,
} from "./academy-config-format"
import { ALL_IDS, CATALOG } from "./academy-config-test-support"

describe("academy config error messages", () => {
  it.each([
    [409, "ACADEMY_CONFIG_EXISTS", "Trưởng nhóm này đã có cấu hình riêng. Hãy tải lại danh sách rồi bấm Sửa."],
    [409, "ACADEMY_CONFIG_DEFAULT_PROTECTED", "Không xóa được cấu hình mặc định."],
    [422, "ACADEMY_CONFIG_INVALID", "Danh sách chương không hợp lệ. Hãy chọn ít nhất một chương trong danh mục."],
    [404, "ACADEMY_CONFIG_NOT_FOUND", "Cấu hình này không còn tồn tại. Hãy tải lại danh sách."],
    [404, "ACADEMY_LEADER_NOT_FOUND", "Không tìm thấy trưởng nhóm này. Hãy tải lại danh sách."],
  ])("maps %i %s to a Vietnamese message", (status, code, message) => {
    expect(academyConfigErrorMessage(new ApiError("English text", status, code))).toBe(message)
  })

  it("keeps the server message for an unknown code and a generic one for a non-error", () => {
    expect(academyConfigErrorMessage(new ApiError("Quá nhiều yêu cầu", 429, "RATE_LIMITED"))).toBe("Quá nhiều yêu cầu")
    expect(academyConfigErrorMessage(new ApiError("Không có quyền", 403))).toBe("Không có quyền")
    expect(academyConfigErrorMessage("boom")).toBe("Đã có lỗi xảy ra. Vui lòng thử lại.")
  })

  it("flags only the codes that mean the list is outdated", () => {
    expect(isStaleAcademyConfigError(new ApiError("x", 409, "ACADEMY_CONFIG_EXISTS"))).toBe(true)
    expect(isStaleAcademyConfigError(new ApiError("x", 404, "ACADEMY_CONFIG_NOT_FOUND"))).toBe(true)
    expect(isStaleAcademyConfigError(new ApiError("x", 404, "ACADEMY_LEADER_NOT_FOUND"))).toBe(true)
    expect(isStaleAcademyConfigError(new ApiError("x", 422, "ACADEMY_CONFIG_INVALID"))).toBe(false)
    expect(isStaleAcademyConfigError(new ApiError("x", 409, "ACADEMY_CONFIG_DEFAULT_PROTECTED"))).toBe(false)
    expect(isStaleAcademyConfigError(new Error("x"))).toBe(false)
  })
})

describe("academy config labels", () => {
  it("formats counts and chapter names", () => {
    expect(chapterCountLabel(11, 12)).toBe("11/12 chương")
    expect(lessonTotalLabel(106)).toBe("106 bài học")
    expect(chapterLabel(2, "Thương hiệu cá nhân")).toBe("Chương 2 · Thương hiệu cá nhân")
    expect(configDataSummary({ mode: "free", chapter_ids: ["ch01", "ch02"] })).toBe("Tự do · 2 chương")
    expect(configDataSummary({ mode: "sequential", chapter_ids: ["ch01"] })).toBe("Lần lượt · 1 chương")
  })

  it("resolves chapter titles through the catalog and keeps an unknown id visible", () => {
    expect(chapterTitleById(CATALOG, "ch03")).toBe("Thương hiệu cá nhân")
    expect(chapterTitleById(CATALOG, "ch99")).toBe("ch99")
  })

  it("keeps the selected chapter ids in original catalog order and drops unknown ids", () => {
    expect(chapterIdsInCatalogOrder(CATALOG, new Set(["ch04", "ch01", "ch99"]))).toEqual(["ch01", "ch04"])
    expect(chapterIdsInCatalogOrder(CATALOG, new Set(ALL_IDS))).toEqual(ALL_IDS)
    expect(chapterIdsInCatalogOrder(CATALOG, new Set())).toEqual([])
  })
})
