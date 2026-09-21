import { useEffect, useRef, useState } from "react"
import { Modal } from "@arco-design/web-react"
import { Badge, LEVELS } from "@/features/cap0/Badge"
import { trackJourneyEvent } from "@/shared/analytics/journey"
import "@/features/cap0/cap0.css"
import "./cap6-graduation.css"
import { useCap6Progress, useGraduateCap6 } from "./hooks"
import { datCongCap6 } from "./nhanDinhCap6"
import type { Cap6Progress } from "./types"

/**
 * Điều kiện mở màn tốt nghiệp Cấp 6 (spec §2/§3): **1/1 nhiệm vụ thuần hành vi**
 * — đủ ba lần xử lý mâu thuẫn nhất quán. Một chiều: không mở lại khi
 * `graduated_at` đã có (mirrors `cap5/GraduationModalCap5.tsx#isGraduationReadyCap5`).
 *
 * ★★ **KHÔNG đo lãi.** Spec §2 dành nguyên một đoạn giải thích vì sao lãi bị bỏ
 * hoàn toàn khỏi cổng ("cổng đo lãi vẫn kéo user về phía mua để đạt %"), và §11
 * ghi `tong_lai_lenh_cap6_pct` "CHỈ để hiển thị ở Kết sổ/Phân tích".
 */
export function isGraduationReadyCap6(progress: Cap6Progress | null | undefined): boolean {
  if (!progress || progress.graduated_at) return false
  return datCongCap6(progress)
}

const VI_ONE_DECIMAL = new Intl.NumberFormat("vi-VN", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

/** Record graduation through the existing API; “Hoàn tất” only dismisses. */
export function GraduationModalCap6() {
  const { data: progress } = useCap6Progress()
  const { mutate, isError, isPending } = useGraduateCap6()
  const attempted = useRef<string | null>(null)
  const [openedFor, setOpenedFor] = useState<string | null>(null)
  const [savedFor, setSavedFor] = useState<string | null>(null)
  const [dismissedFor, setDismissedFor] = useState<string | null>(null)
  const level = LEVELS[6]
  const ready = isGraduationReadyCap6(progress)
  const progressId = progress?.id
  const consistentCount = progress?.so_lan_xu_ly_nhat_quan ?? 0

  useEffect(() => {
    if (!ready || !progressId || attempted.current === progressId) return
    attempted.current = progressId
    setOpenedFor(progressId)
    trackJourneyEvent("cap6_graduation_view", {
      consistent_count: consistentCount,
    })
    mutate(undefined, {
      // `POST /cap6/graduate` returns the durable Cap6Progress row. Keep that
      // success locally so the CTA does not depend on a later query refetch.
      onSuccess: (saved) => setSavedFor(saved.id ?? progressId),
    })
  }, [ready, progressId, consistentCount, mutate])

  // Keep this graduation screen open after the server saves graduated_at.
  // Returning graduates do not see it again; no new completion flag is stored.
  const visible = !!progressId && dismissedFor !== progressId &&
    (ready || openedFor === progressId)

  // Header giữ nguyên theo spec §3 + override §4.2. `null` là chưa có lệnh mâu
  // thuẫn đã đóng, không được dựng thành 0,0%.
  const pnl = progress?.tong_lai_lenh_cap6_pct
  const sub =
    pnl == null
      ? "lãi từ lệnh mâu thuẫn: chưa có lệnh đã đóng"
      : `lãi từ lệnh mâu thuẫn ${pnl >= 0 ? "+" : ""}${VI_ONE_DECIMAL.format(pnl)}%`

  return (
    <Modal
      visible={visible}
      footer={null}
      title={null}
      closable={false}
      maskClosable={false}
      escToExit={false}
      autoFocus={false}
      className="cap0"
      style={{
        width: 480,
        maxWidth: "calc(100vw - 32px)",
        maxHeight: "calc(100dvh - 32px)",
        overflowY: "auto",
        background: "var(--bg2)",
        border: "1px solid var(--bd)",
        borderRadius: 16,
      }}
    >
      <div className="cap0-grad-header">
        <div className="cap0-grad-tag">HOÀN THÀNH</div>
        <h2 className="cap0-display cap0-grad-title">CẤP 6 · BẬC THẦY</h2>
        <div className="cap0-grad-sub" data-testid="cap6-grad-sub">
          {sub}
        </div>
        <div className="cap0-grad-badge-wrap">
          <Badge n={level.n} color={level.color} fill={6} size={120} glow />
        </div>
      </div>

      {isError && (
        <div role="alert" className="cap6-grad-provenance">
          Chưa lưu được kết quả tốt nghiệp. Bạn có thể thử lại.
          <button
            type="button"
            onClick={() =>
              mutate(undefined, {
                onSuccess: (saved) => setSavedFor(saved.id ?? progressId ?? null),
              })
            }
            disabled={isPending}
          >
            Thử lại
          </button>
        </div>
      )}
      <button
        type="button"
        className="cap0-grad-cta cap6-grad-cta--complete"
        data-testid="cap6-grad-cta"
        onClick={() => setDismissedFor(progressId ?? null)}
        disabled={!progressId || savedFor !== progressId || isPending}
      >
        {savedFor === progressId ? "Hoàn tất" : "Đang ghi nhận…"}
      </button>
    </Modal>
  )
}
