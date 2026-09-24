/**
 * Tab "Cảnh báo" của `/chien-luoc` — port từ
 * `dashboard/src/features/alerts/AlertsPage.tsx` (`AlertsInner`).
 *
 * Bốn khối: kết nối Telegram, tín hiệu dựng sẵn để theo dõi, cảnh báo của tôi và
 * lịch sử tín hiệu đã bắn. Mỗi tab của trang chỉ có MỘT vùng cuộn (ở đây là
 * ScrollArea bao ngoài), không lồng thêm thanh cuộn của shell.
 */
import type { ReactNode } from "react"

import { ScrollArea } from "@/components/ui/scroll-area"

import { EventsList } from "./events-list"
import { RulesList } from "./rules-list"
import { SignalsList } from "./signals-list"
import { TelegramConnect } from "./telegram-connect"

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="font-heading text-sm font-semibold text-foreground">{title}</h2>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

export function AlertsView() {
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="mx-auto flex w-full max-w-[960px] flex-col gap-7 p-4 sm:p-6">
        <div>
          <h2 className="font-heading text-lg font-semibold text-foreground">Cảnh báo tín hiệu</h2>
          <p className="text-sm text-muted-foreground">
            Theo dõi 10 tín hiệu kỹ thuật trên watchlist của bạn và nhận thông báo qua Telegram
            trong phiên.
          </p>
        </div>

        <TelegramConnect />

        <Section
          title="Tín hiệu"
          hint="Bật theo dõi để nhận cảnh báo khi tín hiệu xuất hiện trên mã trong watchlist."
        >
          <SignalsList />
        </Section>

        <Section
          title="Cảnh báo của tôi"
          hint="Bật/tắt hoặc xóa. Tạo cảnh báo tùy chỉnh từ tab Backtest (Tạo cảnh báo)."
        >
          <RulesList />
        </Section>

        <Section title="Lịch sử tín hiệu" hint="Các tín hiệu đã bắn gần đây (tối đa 50).">
          <EventsList />
        </Section>
      </div>
    </ScrollArea>
  )
}
