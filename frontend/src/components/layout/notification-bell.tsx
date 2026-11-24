/**
 * Header bell (spec Bot và Chiến lược v2.0 §8.3, Khu Văn phòng §12): unread count (hidden at 0,
 * polled every 60 s), the 50 newest notifications, mark one / all read (stored per account, so
 * every device agrees), a click opens the notification's place and `Cài đặt thông báo` opens the
 * Bot panel on its THÔNG BÁO card.
 */
import { useState } from "react"
import {
  Bell,
  Bot,
  CircleCheck,
  ClipboardCheck,
  ClipboardList,
  MessageSquarePlus,
  MessageSquareReply,
  Newspaper,
  RotateCcw,
  Settings,
  type LucideIcon,
} from "lucide-react"
import { useLocation, useNavigate } from "react-router"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/hooks/use-auth"
import { cn } from "@/lib/utils"
import {
  FALLBACK_LINK,
  NOTIFICATION_SETTINGS_PATH,
  TYPE_LABEL,
  useMarkRead,
  useNotificationList,
  useUnreadCount,
  type NotificationItem,
  type NotificationType,
} from "@/pages/notifications/api"
import { normalizeSpaceLink } from "@/pages/spaces/spaces-url"

type NotificationVisual = {
  icon: LucideIcon
  iconClass: string
  badgeClass: string
}

const NOTIFICATION_VISUAL: Record<NotificationType, NotificationVisual> = {
  bot_trades: {
    icon: Bot,
    iconClass: "text-primary",
    badgeClass: "bg-primary/10 text-primary",
  },
  bulletin: {
    icon: Newspaper,
    iconClass: "text-price-ref",
    badgeClass: "bg-price-ref/15 text-price-ref",
  },
  office_task_assigned: {
    icon: ClipboardList,
    iconClass: "text-primary",
    badgeClass: "bg-primary/10 text-primary",
  },
  office_task_approved: {
    icon: CircleCheck,
    iconClass: "text-price-up",
    badgeClass: "bg-price-up/15 text-price-up",
  },
  office_task_returned: {
    icon: RotateCcw,
    iconClass: "text-destructive",
    badgeClass: "bg-destructive/15 text-destructive",
  },
  office_proposal_replied: {
    icon: MessageSquareReply,
    iconClass: "text-price-floor",
    badgeClass: "bg-price-floor/15 text-price-floor",
  },
  office_task_submitted: {
    icon: ClipboardCheck,
    iconClass: "text-status-warning",
    badgeClass: "bg-status-warning/15 text-status-warning",
  },
  office_proposal_sent: {
    icon: MessageSquarePlus,
    iconClass: "text-accent",
    badgeClass: "bg-accent/15 text-accent",
  },
}

const DEFAULT_VISUAL: NotificationVisual = {
  icon: Bell,
  iconClass: "text-primary",
  badgeClass: "bg-primary/10 text-primary",
}

function badgeText(count: number): string {
  return count > 99 ? "99+" : String(count)
}

function BellMenu() {
  const location = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const unread = useUnreadCount()
  const list = useNotificationList(open)
  const markRead = useMarkRead()
  const count = unread.data?.unread_count ?? list.data?.unread_count ?? 0
  const items = list.data?.items ?? []

  function openItem(item: NotificationItem) {
    if (!item.read_at) markRead.mutate({ id: item.id })
    setOpen(false)
    const rawTarget = item.link.trim() || FALLBACK_LINK[item.type] || "/"
    const target = normalizeSpaceLink(rawTarget) || "/"
    const current = `${location.pathname}${location.search}`
    navigate(target, {
      replace: current === target,
      state: { notificationId: item.id },
    })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={count > 0 ? `Thông báo, ${count} chưa đọc` : "Thông báo"} data-testid="notification-bell" className="relative">
          <Bell aria-hidden="true" />
          {count > 0 && (
            <span
              aria-hidden="true"
              data-testid="notification-badge"
              className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] leading-none font-bold text-white tabular-nums"
            >
              {badgeText(count)}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-[min(22rem,calc(100vw-1rem))] gap-0 p-0" aria-label="Thông báo">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <h2 className="font-heading text-sm font-bold">Thông báo</h2>
          <Button type="button" variant="ghost" size="xs" disabled={count === 0 || markRead.isPending} onClick={() => markRead.mutate({ all: true })}>
            Đánh dấu đã đọc hết
          </Button>
        </div>
        <div className="max-h-[min(24rem,60dvh)] overflow-y-auto">
          {list.isPending ? (
            <div className="space-y-2 p-3" aria-label="Đang tải thông báo"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
          ) : list.isError ? (
            <div className="space-y-2 p-3 text-xs text-foreground">
              <p role="alert">Không tải được thông báo.</p>
              <Button type="button" variant="outline" size="xs" onClick={() => void list.refetch()}>Thử lại</Button>
            </div>
          ) : items.length === 0 ? (
            <p className="p-4 text-center text-xs text-foreground">Chưa có thông báo.</p>
          ) : (
            <ul aria-label="Danh sách thông báo" className="divide-y divide-border">
              {items.map((item) => {
                const visual = NOTIFICATION_VISUAL[item.type] ?? DEFAULT_VISUAL
                const Icon = visual.icon
                const typeLabel = TYPE_LABEL[item.type]
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => openItem(item)}
                      data-unread={item.read_at ? undefined : "true"}
                      data-notification-type={item.type}
                      className={cn(
                        "flex w-full min-w-0 items-start gap-2.5 px-3 py-2.5 text-left transition-colors focus-visible:outline-none",
                        item.read_at
                          ? "hover:bg-muted/50 focus-visible:bg-muted/50"
                          : "bg-primary/10 hover:bg-primary/15 focus-visible:bg-primary/15",
                      )}
                    >
                      <Icon
                        aria-hidden="true"
                        data-testid="notification-icon"
                        data-notification-type={item.type}
                        className={cn("mt-0.5 size-4 shrink-0", visual.iconClass)}
                      />
                      <span className="min-w-0 flex-1">
                        {typeLabel && (
                          <span className="mb-0.5 flex items-center gap-1.5">
                            <span
                              data-testid="notification-type-label"
                              className={cn(
                                "inline-flex max-w-full shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] leading-none font-semibold",
                                visual.badgeClass,
                              )}
                            >
                              {typeLabel}
                            </span>
                          </span>
                        )}
                        <span className={cn("block truncate text-xs text-foreground", item.read_at ? "font-medium" : "font-bold")}>{item.title}</span>
                        <span className="block truncate text-[11px] text-academy-subtle">{item.body}</span>
                      </span>
                      {!item.read_at && <span aria-label="Chưa đọc" className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        <div className="border-t border-border p-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={() => {
              setOpen(false)
              navigate(NOTIFICATION_SETTINGS_PATH, { state: { openPanel: true } })
            }}
          >
            <Settings aria-hidden="true" />
            Cài đặt thông báo
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** Shown to signed-in accounts only. */
export function NotificationBell() {
  const { isAuthenticated } = useAuth()
  return isAuthenticated ? <BellMenu /> : null
}
