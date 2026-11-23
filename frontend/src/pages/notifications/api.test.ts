import { describe, expect, it } from "vitest"

import { FALLBACK_LINK, OFFICE_NOTIFICATION_TYPES, TYPE_LABEL, type NotificationType } from "./api"

describe("notifications api metadata (Bot v2.0 §8 & Khu Văn phòng §12)", () => {
  it("maps labels and fallback links for existing and all 6 office notification types", () => {
    const expected: Record<NotificationType, { label: string; link: string }> = {
      bulletin: { label: "Bản tin cuối phiên", link: "/thi-truong?bt=ban-tin" },
      bot_trades: { label: "Bot giao dịch", link: "/luyen-tap?tool=bot&bot_tab=lich-su" },
      office_task_assigned: { label: "Giao nhiệm vụ", link: "/van-phong?modal=mine" },
      office_task_approved: { label: "Duyệt nhiệm vụ", link: "/van-phong?modal=mine" },
      office_task_returned: { label: "Cần làm lại", link: "/van-phong?modal=mine" },
      office_proposal_replied: { label: "Trả lời đề xuất", link: "/van-phong?modal=mine" },
      office_task_submitted: { label: "Chờ xác nhận", link: "/van-phong?modal=mgr" },
      office_proposal_sent: { label: "Đề xuất mới", link: "/van-phong?modal=mgr" },
    }

    expect(OFFICE_NOTIFICATION_TYPES).toHaveLength(6)
    for (const [type, spec] of Object.entries(expected) as Array<[NotificationType, { label: string; link: string }]>) {
      expect(TYPE_LABEL[type]).toBe(spec.label)
      expect(FALLBACK_LINK[type]).toBe(spec.link)
    }
  })
})
