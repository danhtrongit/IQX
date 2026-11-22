/**
 * THÔNG BÁO card (spec Bot và Chiến lược v2.0 §8.2): master switch, the two types, `Trên web`
 * (always on) and `Email` (locked with `Chưa có email` without a verified email). Changes apply at
 * once; they are not part of any strategy.
 */
import { forwardRef, useId } from "react"
import { Bell, Check } from "lucide-react"
import { toast } from "sonner"

import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { ApiError } from "@/lib/api"
import { cn } from "@/lib/utils"
import { nextSettings, useNotificationSettings, useSaveNotificationSettings, type NotificationSettings } from "@/pages/notifications/api"

import { messageOf } from "../api"

function Row({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <label htmlFor={id} className="min-w-0 text-xs font-medium">{label}</label>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  )
}

export const NotificationCard = forwardRef<HTMLElement>(function NotificationCard(_props, ref) {
  const settings = useNotificationSettings()
  const save = useSaveNotificationSettings()
  const masterId = useId()

  function change(current: NotificationSettings, patch: Parameters<typeof nextSettings>[1], success?: string) {
    save.mutate(nextSettings(current, patch), {
      onSuccess: () => { if (success) toast.success(success) },
      onError: (error) => {
        toast.error(error instanceof ApiError && error.code === "EMAIL_UNVERIFIED" ? "Tài khoản chưa có email đã xác thực." : messageOf(error))
      },
    })
  }

  return (
    <section ref={ref} id="bot-notification-settings" aria-label="Thông báo" tabIndex={-1} className="scroll-mt-4 rounded-lg border border-border bg-card px-3 py-2.5 outline-none">
      {settings.isPending ? (
        <Skeleton className="h-28 w-full" aria-label="Đang tải cài đặt thông báo" />
      ) : settings.isError ? (
        <p role="alert" className="text-xs text-foreground">Không tải được cài đặt thông báo. {messageOf(settings.error)}</p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 pb-1.5">
            <label htmlFor={masterId} className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide uppercase">
              <Bell aria-hidden="true" className="size-3.5 text-primary" />Thông báo
            </label>
            <Switch
              id={masterId}
              aria-label="Bật thông báo"
              checked={settings.data.enabled}
              onCheckedChange={(value) => change(settings.data, { enabled: value }, value ? "Đã bật thông báo." : "Đã tắt mọi thông báo.")}
            />
          </div>
          <div data-testid="notification-rows" className={cn("border-t border-border pt-1", !settings.data.enabled && "opacity-50")}>
            <Row label="Bản tin cuối phiên" checked={settings.data.types.bulletin} disabled={!settings.data.enabled} onChange={(value) => change(settings.data, { bulletin: value })} />
            <Row label="Bot giao dịch" checked={settings.data.types.bot_trades} disabled={!settings.data.enabled} onChange={(value) => change(settings.data, { bot_trades: value })} />
            <div className="flex flex-wrap items-center justify-between gap-2 py-1.5">
              <span className="text-xs font-medium">Gửi qua</span>
              <span className="flex flex-wrap items-center gap-1.5">
                <button type="button" disabled aria-pressed="true" className="inline-flex items-center gap-1 rounded-sm border border-primary/50 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                  <Check aria-hidden="true" className="size-3" />Trên web
                </button>
                <button
                  type="button"
                  aria-pressed={settings.data.channels.email}
                  disabled={!settings.data.enabled || !settings.data.email_available}
                  onClick={() => change(settings.data, { email: !settings.data.channels.email }, settings.data.channels.email ? "Đã tắt gửi qua email." : "Đã bật gửi qua email.")}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-[11px] font-medium focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed",
                    settings.data.channels.email ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-foreground",
                  )}
                >
                  {settings.data.channels.email && <Check aria-hidden="true" className="size-3" />}Email
                </button>
                {!settings.data.email_available && <span className="text-[11px] text-status-warning">Chưa có email</span>}
              </span>
            </div>
          </div>
        </>
      )}
    </section>
  )
})
