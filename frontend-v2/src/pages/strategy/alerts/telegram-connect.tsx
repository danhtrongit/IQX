/**
 * Kết nối Telegram — port từ
 * `dashboard/src/features/alerts/components/TelegramConnect.tsx`.
 *
 * Nút "Kết nối" tạo deep link thật (`POST /alerts/telegram/link`) và mở tab mới;
 * trạng thái được hỏi lại sau 4 giây để bắt lần bấm Start bên Telegram. Server
 * chưa cấu hình bot thì trả 503 và UI hiển thị đúng thông điệp đó.
 */
import { CheckCircle2, LoaderCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { errorMessage } from "@/lib/api"
import { toast } from "sonner"

import { fmtDateTimeVN } from "../format"
import { useTelegramLink, useTelegramStatus, useTelegramUnlink } from "../hooks"

export function TelegramConnect() {
  const status = useTelegramStatus()
  const link = useTelegramLink()
  const unlink = useTelegramUnlink()

  const onConnect = () => {
    link.mutate(undefined, {
      onSuccess: (result) => {
        if (!result.deepLink) {
          toast.error("Telegram chưa được cấu hình trên hệ thống.")
          return
        }
        window.open(result.deepLink, "_blank", "noopener")
        toast.info("Mở Telegram và bấm Start để kết nối, sau đó quay lại trang này.")
        window.setTimeout(() => void status.refetch(), 4000)
      },
      onError: (error) => toast.error(errorMessage(error)),
    })
  }

  return (
    <div className="rounded-lg bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground">Kết nối Telegram</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Nhận tín hiệu qua Telegram cho các mã trong watchlist của bạn.
          </div>
          {status.data?.linked && status.data.linkedAt && (
            <div className="mt-1 text-[11px] text-muted-foreground">
              Đã kết nối lúc {fmtDateTimeVN(status.data.linkedAt)}
              {status.data.botUsername ? ` · @${status.data.botUsername}` : ""}
            </div>
          )}
        </div>

        {status.isLoading ? (
          <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
        ) : status.data?.linked ? (
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-xs font-medium text-price-up">
              <CheckCircle2 className="size-3.5" />
              Đã kết nối
            </span>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={unlink.isPending}
              onClick={() =>
                unlink.mutate(undefined, {
                  onSuccess: () => toast.success("Đã ngắt kết nối Telegram"),
                  onError: (error) => toast.error(errorMessage(error)),
                })
              }
            >
              {unlink.isPending && <LoaderCircle className="size-3.5 animate-spin" />}
              Ngắt kết nối
            </Button>
          </div>
        ) : (
          <Button type="button" size="sm" disabled={link.isPending} onClick={onConnect}>
            {link.isPending && <LoaderCircle className="size-3.5 animate-spin" />}
            Kết nối Telegram
          </Button>
        )}
      </div>
    </div>
  )
}
