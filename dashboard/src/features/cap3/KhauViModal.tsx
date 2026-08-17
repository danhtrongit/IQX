import { Modal } from "@arco-design/web-react"
import { computeKhauViConsequence } from "./khauViConsequence"
import { useCap3Events } from "./Cap3Context"
import { useCap3Progress, useSetKhauVi } from "./hooks"
import { KHAU_VI_PCT } from "./khoiLuong"
import { cn } from "@/shared/lib/cn"
import type { KhauViLoai } from "./types"

/** ★ FALLBACK cuối cùng, gần như không bao giờ dùng tới: `Cap3Progress.
 * von_ban_dau` là vốn THẬT của tài khoản ảo (server đồng bộ từ
 * `VirtualTradingAccount.initial_cash_vnd` — xem `Cap3Service._sync_von_ban_dau`),
 * và component này đã `return null` khi chưa có progress. Con số 100tr dưới đây
 * chỉ là ví dụ của spec §4/§C12b, KHÔNG phải vốn user thực sự có. */
const VON_BAN_DAU_MAC_DINH = 100_000_000

function fmtVnd(n: number): string {
  return Math.round(n).toLocaleString("en-US")
}

interface MucSpec {
  loai: KhauViLoai
  ten: string
  moTa: string
  macDinh: boolean
}

const MUC_LIST: MucSpec[] = [
  { loai: "than_trong", ten: "Thận trọng", moTa: "Chia mỏng, an toàn", macDinh: false },
  { loai: "can_bang", ten: "Cân bằng", moTa: "Vừa phải", macDinh: true },
  { loai: "tan_cong", ten: "Tấn công", moTa: "Đậm đặc, cược mạnh", macDinh: false },
]

export interface KhauViModalProps {
  /** Vốn dùng để tính hệ quả minh hoạ — mặc định lấy từ
   * `Cap3Progress.von_ban_dau` (vốn THẬT của tài khoản ảo). */
  vonBanDau?: number
  /** Mở lại để ĐỔI khẩu vị sau này (spec §5.2 "không khoá vĩnh viễn") — khi
   * `true`, hiện dù `khau_vi_da_dat` đã true, và có nút đóng/hủy. Khi
   * omitted/false, modal tự quản lý hiển thị: chỉ tự bật LẦN ĐẦU
   * (`khau_vi_da_dat === false`) và KHÔNG có nút đóng (bắt buộc chọn 1). */
  forceOpen?: boolean
  onClose?: () => void
}

/**
 * Màn chọn khẩu vị rủi ro (spec §5.2, 🟢 THÊM MỚI) — bắt buộc chọn 1 trong 3
 * mức lần đầu vào Cấp 3 (`khau_vi_da_dat === false`), sau đó có thể đổi qua
 * `forceOpen` (từ nút "Đổi" trong `QuanLyVonBlock`, không khoá vĩnh viễn).
 *
 * Mỗi mức LUÔN hiện kèm hệ quả cụ thể — §C12c "cho thấy con số đến từ đâu",
 * không chỉ kết luận suông:
 *  - ≈ số mã có thể nắm nếu chia đều vốn theo mức trần này
 *  - Thiệt hại tối đa (VND) nếu 1 mã giảm sàn ~7% khi đã bỏ full mức trần
 * (xem `khauViConsequence.ts` cho phép tính thuần).
 *
 * Self-contained (queries `useCap3Progress`/`useSetKhauVi` itself, same
 * pattern as `cap2/GraduationModalCap2.tsx`) — a consumer (Cấp 3's trading
 * page, FE3) just mounts `<KhauViModal />` unconditionally for the mandatory
 * first pick, and renders a SECOND `<KhauViModal forceOpen onClose={...} />`
 * (or toggles the same instance) for the "Đổi" affordance.
 */
export function KhauViModal({ vonBanDau, forceOpen = false, onClose }: KhauViModalProps) {
  const { data: progress } = useCap3Progress()
  const setKhauVi = useSetKhauVi()
  const cap3Events = useCap3Events()

  if (!progress) return null

  const visible = forceOpen || !progress.khau_vi_da_dat
  const mandatory = !forceOpen
  const effectiveVon = vonBanDau ?? progress.von_ban_dau ?? VON_BAN_DAU_MAC_DINH
  const current = progress.khau_vi ?? null

  const handlePick = (khauVi: KhauViLoai) => {
    setKhauVi.mutate(khauVi, {
      onSuccess: () => {
        cap3Events.onKhauViPicked?.(khauVi)
        onClose?.()
      },
    })
  }

  return (
    <Modal
      visible={visible}
      footer={null}
      title="Chọn khẩu vị rủi ro"
      closable={!mandatory}
      maskClosable={!mandatory}
      escToExit={!mandatory}
      onCancel={mandatory ? undefined : onClose}
      style={{ width: 560, maxWidth: "calc(100vw - 32px)" }}
    >
      <p className="mb-3 text-xs text-[var(--color-text-3)]">
        Khẩu vị rủi ro là mức tiền tối đa bạn bỏ vào 1 mã. Thận trọng (10%) = chia vốn cho ~10 mã,
        an toàn. Tấn công (30%) = dồn vào ~3 mã, ăn đậm nhưng rủi ro cao. Đây là phong cách chung,
        áp cho mọi lệnh.
      </p>

      <div className="space-y-2">
        {MUC_LIST.map((muc) => {
          const khauViPct = KHAU_VI_PCT[muc.loai]
          const heQua = computeKhauViConsequence(muc.loai, effectiveVon)
          const isSelected = current === muc.loai
          return (
            <div
              key={muc.loai}
              data-testid={`khau-vi-pick-${muc.loai}`}
              data-selected={isSelected ? "true" : "false"}
              className={cn(
                "space-y-1 rounded-md border p-3",
                isSelected
                  ? "border-[rgb(var(--primary-6))] bg-[rgb(var(--primary-6))]/10"
                  : "border-[var(--color-border-2)] bg-[var(--color-bg-2)]",
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[var(--color-text-1)]">{muc.ten}</span>
                  <span className="text-xs text-[var(--color-text-3)]">
                    {`(trần ${khauViPct}%)`}
                  </span>
                  {muc.macDinh && (
                    <span className="rounded bg-[rgb(var(--primary-6))]/15 px-1.5 py-0.5 text-[10px] font-medium text-[rgb(var(--primary-6))]">
                      mặc định gợi ý
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  disabled={setKhauVi.isPending}
                  onClick={() => handlePick(muc.loai)}
                  className={cn(
                    "rounded border px-3 py-1 text-xs font-medium transition-colors",
                    isSelected
                      ? "border-[rgb(var(--primary-6))] bg-[rgb(var(--primary-6))] text-white"
                      : "border-[var(--color-border-2)] text-[var(--color-text-1)]",
                  )}
                >
                  {isSelected ? "Đã chọn" : "Chọn"}
                </button>
              </div>
              <p className="text-xs text-[var(--color-text-3)]">{muc.moTa}</p>
              <p className="text-xs text-[var(--color-text-2)]">
                {`Bỏ tối đa ${fmtVnd(heQua.vonMoiLenh)}đ/lệnh → nắm được khoảng ${heQua.soMa} mã cùng lúc.`}
              </p>
              <p className="text-xs text-down">
                {`Thiệt hại tối đa nếu 1 mã giảm sàn (~7%): ${fmtVnd(heQua.thietHaiToiDa)}đ`}
              </p>
            </div>
          )
        })}
      </div>
    </Modal>
  )
}
