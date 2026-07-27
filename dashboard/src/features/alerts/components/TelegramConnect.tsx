import { Button, Message, Spin, Tag } from "@arco-design/web-react"
import { IconCheckCircle } from "@arco-design/web-react/icon"
import { useTelegramLink, useTelegramStatus, useTelegramUnlink } from "../hooks"

export function TelegramConnect() {
  const { data: status, isLoading, refetch } = useTelegramStatus()
  const link = useTelegramLink()
  const unlink = useTelegramUnlink()

  const onConnect = () => {
    link.mutate(undefined, {
      onSuccess: (res) => {
        if (res.deep_link) {
          window.open(res.deep_link, "_blank", "noopener")
          Message.info("Mở Telegram và bấm Start để kết nối, sau đó quay lại trang này.")
          setTimeout(() => refetch(), 4000)
        } else {
          Message.error("Telegram chưa được cấu hình trên hệ thống.")
        }
      },
      onError: () => Message.error("Không tạo được liên kết Telegram."),
    })
  }

  return (
    <div
      className="rounded-lg border border-[var(--color-border-2)] bg-[var(--color-bg-2)] p-5"
      data-tour-id="tour-canhbao-telegram"
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-[var(--color-text-1)]">Kết nối Telegram</div>
          <div className="mt-1 text-xs text-[var(--color-text-3)]">
            Nhận tín hiệu qua Telegram cho các mã trong watchlist của bạn.
          </div>
        </div>
        {isLoading ? (
          <Spin />
        ) : status?.linked ? (
          <div className="flex items-center gap-3">
            <Tag color="green" icon={<IconCheckCircle />}>
              Đã kết nối
            </Tag>
            <Button
              size="small"
              status="danger"
              loading={unlink.isPending}
              onClick={() =>
                unlink.mutate(undefined, { onSuccess: () => Message.success("Đã ngắt kết nối Telegram") })
              }
            >
              Ngắt kết nối
            </Button>
          </div>
        ) : (
          <Button type="primary" loading={link.isPending} onClick={onConnect}>
            Kết nối Telegram
          </Button>
        )}
      </div>
    </div>
  )
}
