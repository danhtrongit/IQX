/**
 * Cụm thao tác quản trị trên một tài khoản giao dịch ảo.
 *
 * Ba nhóm quyền ghi của backend, tất cả đều yêu cầu quyền admin và đều được ghi
 * audit phía server:
 * - `freeze` (lý do bắt buộc, chuyển trạng thái sang `suspended`) / `unfreeze`
 *   (lý do tuỳ chọn, đưa về `active`);
 * - `cash-adjust` (số tiền khác 0, lý do bắt buộc, backend từ chối nếu số dư âm
 *   và luôn ghi một dòng sổ cái `admin_adjust`);
 * - `reset` theo người dùng (xoá lệnh/giao dịch/vị thế/T+N/sổ cái, đưa tiền mặt
 *   về vốn ban đầu). Đây là thao tác phá huỷ nên hộp thoại bắt gõ lại định danh
 *   tài khoản trước khi mở nút xác nhận.
 *
 * Lỗi từ server (ví dụ "Số dư không đủ để trừ …", "Tài khoản đã bị tạm khóa")
 * được hiện nguyên văn trong hộp thoại, không nuốt lỗi và không tự thử lại.
 */
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { errorMessage } from "@/lib/api"
import { formatMoney } from "@/lib/format"
import type { VtAccount } from "../api"
import { formatVndSigned } from "../format"
import { useAdjustVtCash, useFreezeVtAccount, useResetVtAccount, useUnfreezeVtAccount } from "../hooks"
import { isResetConfirmation } from "./reset-confirmation"
import { ActionDialog, FormField, HintLine } from "./ui"

type CashDirection = "add" | "subtract"

/** Cụm từ bắt buộc gõ lại trước khi đặt lại (thao tác xoá dữ liệu không thể hoàn tác). */
const RESET_PHRASE = "ĐẶT LẠI"

export function AccountActions({ account }: { account: VtAccount }) {
  const [freezeOpen, setFreezeOpen] = useState(false)
  const [freezeReason, setFreezeReason] = useState("")
  const [unfreezeOpen, setUnfreezeOpen] = useState(false)
  const [unfreezeReason, setUnfreezeReason] = useState("")
  const [cashOpen, setCashOpen] = useState(false)
  const [direction, setDirection] = useState<CashDirection>("add")
  const [amountText, setAmountText] = useState("")
  const [cashReason, setCashReason] = useState("")
  const [resetOpen, setResetOpen] = useState(false)
  const [resetConfirm, setResetConfirm] = useState("")

  const freeze = useFreezeVtAccount(account.id)
  const unfreeze = useUnfreezeVtAccount(account.id)
  const adjust = useAdjustVtCash(account.id)
  const reset = useResetVtAccount()

  const isFrozen = account.frozenAt !== null
  /** Payload 360 chỉ có `user_id` (không có email/tên), nên định danh hiển thị là mã người dùng. */
  const accountRef = account.userId

  const digits = amountText.replace(/[^\d]/g, "")
  const amount = digits.length === 0 ? 0 : Number(digits)
  const signedAmount = direction === "add" ? amount : -amount
  const projectedCash = account.cashAvailableVnd + signedAmount
  const amountError =
    amount === 0
      ? "Số tiền phải khác 0."
      : !Number.isSafeInteger(amount)
        ? "Số tiền quá lớn."
        : projectedCash < 0
          ? `Số dư không đủ: khả dụng ${formatMoney(account.cashAvailableVnd)}.`
          : null
  const reasonError = cashReason.trim().length === 0 ? "Lý do bắt buộc." : null

  const openCash = () => {
    adjust.reset()
    setDirection("add")
    setAmountText("")
    setCashReason("")
    setCashOpen(true)
  }

  const confirmFreeze = () => {
    freeze.mutate(freezeReason.trim(), {
      onSuccess: () => {
        toast.success("Đã tạm khóa tài khoản")
        setFreezeOpen(false)
        setFreezeReason("")
      },
    })
  }

  const confirmUnfreeze = () => {
    unfreeze.mutate(unfreezeReason.trim() || undefined, {
      onSuccess: () => {
        toast.success("Đã mở khóa tài khoản")
        setUnfreezeOpen(false)
        setUnfreezeReason("")
      },
    })
  }

  const confirmAdjust = () => {
    adjust.mutate(
      { amountVnd: signedAmount, reason: cashReason.trim() },
      {
        onSuccess: (result) => {
          toast.success(`Đã điều chỉnh ${formatVndSigned(signedAmount)}`, {
            description: `Số dư khả dụng mới: ${formatMoney(result.newCashAvailableVnd)} · đã ghi sổ cái.`,
          })
          setCashOpen(false)
        },
      },
    )
  }

  const confirmReset = () => {
    reset.mutate(account.userId, {
      onSuccess: (result) => {
        toast.success(result.message, {
          description: "Đã xoá lệnh, giao dịch, vị thế, T+N và sổ cái của tài khoản này.",
        })
        setResetOpen(false)
        setResetConfirm("")
      },
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          if (isFrozen) {
            unfreeze.reset()
            setUnfreezeReason("")
            setUnfreezeOpen(true)
          } else {
            freeze.reset()
            setFreezeReason("")
            setFreezeOpen(true)
          }
        }}
      >
        {isFrozen ? "Mở khoá tài khoản" : "Tạm khoá tài khoản"}
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={openCash}>
        Điều chỉnh tiền
      </Button>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        onClick={() => {
          reset.reset()
          setResetConfirm("")
          setResetOpen(true)
        }}
      >
        Đặt lại tài khoản
      </Button>

      <ActionDialog
        open={freezeOpen}
        onOpenChange={setFreezeOpen}
        title="Tạm khoá tài khoản giao dịch ảo?"
        description={
          <>
            Tài khoản của <span className="font-medium">{accountRef}</span> sẽ chuyển sang trạng thái{" "}
            <span className="font-medium">Tạm khóa</span>; người dùng không đặt được lệnh cho tới khi mở khoá. Lý do
            được lưu vào audit cùng thời điểm khoá.
          </>
        }
        confirmLabel="Tạm khoá"
        confirmVariant="destructive"
        pending={freeze.isPending}
        confirmDisabled={freezeReason.trim().length === 0 || freezeReason.length > 1000}
        error={freeze.isError ? errorMessage(freeze.error) : null}
        onConfirm={confirmFreeze}
      >
        <FormField
          label="Lý do khoá"
          hint={`${freezeReason.length}/1000 ký tự · bắt buộc`}
          error={freezeReason.trim().length === 0 ? "Nhập lý do để backend ghi audit." : null}
        >
          <Textarea
            value={freezeReason}
            onChange={(event) => setFreezeReason(event.target.value.slice(0, 1000))}
            rows={3}
            placeholder="Ví dụ: phát hiện can thiệp giá trong phiên"
          />
        </FormField>
      </ActionDialog>

      <ActionDialog
        open={unfreezeOpen}
        onOpenChange={setUnfreezeOpen}
        title="Mở khoá tài khoản giao dịch ảo?"
        description={
          <>
            Tài khoản của <span className="font-medium">{accountRef}</span> trở lại trạng thái{" "}
            <span className="font-medium">Đang hoạt động</span> và có thể đặt lệnh ngay. Lý do mở khoá là tuỳ chọn.
          </>
        }
        confirmLabel="Mở khoá"
        pending={unfreeze.isPending}
        confirmDisabled={unfreezeReason.length > 1000}
        error={unfreeze.isError ? errorMessage(unfreeze.error) : null}
        onConfirm={confirmUnfreeze}
      >
        <FormField label="Lý do mở khoá (tuỳ chọn)" hint={`${unfreezeReason.length}/1000 ký tự`}>
          <Textarea
            value={unfreezeReason}
            onChange={(event) => setUnfreezeReason(event.target.value.slice(0, 1000))}
            rows={3}
            placeholder="Ví dụ: đã xác minh với người dùng"
          />
        </FormField>
      </ActionDialog>

      <ActionDialog
        open={cashOpen}
        onOpenChange={setCashOpen}
        title="Điều chỉnh tiền mặt khả dụng"
        description={
          <>
            Cộng hoặc trừ trực tiếp vào <span className="font-medium">tiền khả dụng</span> của tài khoản. Backend từ
            chối nếu kết quả âm và luôn ghi một dòng sổ cái loại “Quản trị điều chỉnh tiền” kèm lý do.
          </>
        }
        confirmLabel="Lưu điều chỉnh"
        pending={adjust.isPending}
        confirmDisabled={amountError !== null || reasonError !== null}
        error={adjust.isError ? errorMessage(adjust.error) : null}
        onConfirm={confirmAdjust}
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Chiều điều chỉnh">
              <Select value={direction} onValueChange={(value) => setDirection(value as CashDirection)}>
                <SelectTrigger size="default" className="w-full text-sm" aria-label="Chiều điều chỉnh tiền">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="add">Cộng tiền</SelectItem>
                  <SelectItem value="subtract">Trừ tiền</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField
              label="Số tiền (VND)"
              hint={amount > 0 ? `= ${formatMoney(amount)}` : "Chỉ nhập chữ số, đơn vị đồng."}
              error={amount === 0 ? null : amountError}
            >
              <Input
                value={amountText}
                onChange={(event) => setAmountText(event.target.value.replace(/[^\d]/g, "").slice(0, 15))}
                inputMode="numeric"
                placeholder="5000000"
                autoComplete="off"
              />
            </FormField>
          </div>
          <div className="rounded-md border border-border bg-muted/40 p-3 text-xs">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Khả dụng hiện tại</span>
              <span className="tabular-nums">{formatMoney(account.cashAvailableVnd)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Điều chỉnh</span>
              <span className="tabular-nums">{formatVndSigned(signedAmount)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-3 border-t border-border pt-1">
              <span className="font-medium">Sau điều chỉnh</span>
              <span className={projectedCash < 0 ? "font-medium tabular-nums text-destructive" : "font-medium tabular-nums"}>
                {formatMoney(projectedCash)}
              </span>
            </div>
          </div>
          <FormField
            label="Lý do"
            hint={`${cashReason.length}/1000 ký tự · bắt buộc, lưu vào sổ cái và audit`}
            error={reasonError}
          >
            <Textarea
              value={cashReason}
              onChange={(event) => setCashReason(event.target.value.slice(0, 1000))}
              rows={3}
              placeholder="Ví dụ: bù tiền do lỗi giá tham chiếu ngày 20/09"
            />
          </FormField>
          <HintLine>
            Điều chỉnh tiền không tạo lệnh hay giao dịch; vị thế, lệnh cũ và số dư giữ/chờ giữ nguyên.
          </HintLine>
        </div>
      </ActionDialog>

      <ActionDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Đặt lại tài khoản giao dịch ảo?"
        description={
          <>
            Backend sẽ xoá <span className="font-medium">toàn bộ lệnh, giao dịch, vị thế, thanh toán T+N và sổ cái</span>{" "}
            của tài khoản thuộc người dùng <span className="font-mono text-xs">{accountRef}</span>, rồi đưa vốn ban đầu
            và tiền khả dụng về mức trong cấu hình hiện hành. Không thể hoàn tác.
          </>
        }
        confirmLabel="Đặt lại tài khoản"
        confirmVariant="destructive"
        pending={reset.isPending}
        confirmDisabled={!isResetConfirmation(resetConfirm)}
        error={reset.isError ? errorMessage(reset.error) : null}
        onConfirm={confirmReset}
      >
        <div className="space-y-3">
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            Tiền mặt hiện tại {formatMoney(account.cashAvailableVnd)} sẽ bị thay bằng vốn ban đầu trong cấu hình; mọi
            vị thế và lịch sử giao dịch bị xoá vĩnh viễn.
          </div>
          <FormField label={`Gõ “${RESET_PHRASE}” để bật nút xác nhận`}>
            <Input
              value={resetConfirm}
              onChange={(event) => setResetConfirm(event.target.value)}
              placeholder={RESET_PHRASE}
              autoComplete="off"
            />
          </FormField>
        </div>
      </ActionDialog>
    </div>
  )
}
