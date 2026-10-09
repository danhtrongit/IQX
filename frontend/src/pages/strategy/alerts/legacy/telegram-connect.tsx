import { CheckCircle2, LoaderCircle } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

import { errorMessage } from "../../shared/errors"
import { fmtDateTime } from "../../shared/format"
import { useTelegramLink, useTelegramStatus, useTelegramUnlink } from "./hooks"

/** Telegram link of the legacy alerts. The new alerts never send anything outside the web. */
export function TelegramConnect() {
  const status = useTelegramStatus(true)
  const link = useTelegramLink()
  const unlink = useTelegramUnlink()

  const onConnect = () =>
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

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3">
      <div className="min-w-0">
        <div className="text-sm font-semibold">Kết nối Telegram</div>
        <div className="mt-0.5 text-xs text-muted-foreground">Chỉ dành cho cảnh báo cũ. Cảnh báo mới chỉ ghi lịch sử trên web.</div>
        {status.data?.linked && status.data.linkedAt && (
          <div className="mt-1 text-[11px] text-muted-foreground">
            Đã kết nối lúc {fmtDateTime(status.data.linkedAt)}
            {status.data.botUsername ? ` · @${status.data.botUsername}` : ""}
          </div>
        )}
      </div>
      {status.isPending ? (
        <LoaderCircle aria-label="Đang tải trạng thái Telegram" className="size-4 animate-spin text-muted-foreground" />
      ) : status.data?.linked ? (
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs font-medium text-price-up">
            <CheckCircle2 aria-hidden="true" className="size-3.5" />
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
            Ngắt kết nối
          </Button>
        </div>
      ) : (
        <Button type="button" size="sm" disabled={link.isPending} onClick={onConnect}>
          Kết nối Telegram
        </Button>
      )}
    </div>
  )
}
