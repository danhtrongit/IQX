import { describe, expect, it } from "vitest"
import { labelForContentType, labelForCourseLevel, labelForGrantType, labelForRole, labelForStatus, labelForVtSide, tagTypeForStatus } from "./labels"

describe("Vietnamese admin labels", () => {
  it("translates common statuses", () => {
    expect(labelForStatus("pending")).toBe("Đang chờ")
    expect(labelForStatus("paid")).toBe("Đã thanh toán")
    expect(labelForStatus("failed")).toBe("Thất bại")
    expect(labelForStatus("refunded")).toBe("Đã hoàn tiền")
    expect(labelForStatus(true)).toBe("Có")
    expect(labelForStatus(false)).toBe("Không")
  })

  it("keeps status tag intent after translation", () => {
    expect(tagTypeForStatus("paid")).toBe("success")
    expect(tagTypeForStatus("pending")).toBe("warning")
    expect(tagTypeForStatus("failed")).toBe("error")
  })

  it("translates admin enum labels", () => {
    expect(labelForRole("admin")).toBe("Quản trị viên")
    expect(labelForGrantType("admin_grant")).toBe("Cấp thủ công")
    expect(labelForCourseLevel("beginner")).toBe("Cơ bản")
    expect(labelForContentType("video")).toBe("Video")
    expect(labelForVtSide("buy")).toBe("Mua")
  })
})
