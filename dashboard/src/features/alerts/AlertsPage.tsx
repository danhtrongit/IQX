import { PremiumGate } from "@/features/premium"
import { EventsList } from "./components/EventsList"
import { RulesList } from "./components/RulesList"
import { SignalsList } from "./components/SignalsList"
import { TelegramConnect } from "./components/TelegramConnect"

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold text-[var(--color-text-1)]">{title}</h2>
        {hint && <p className="text-xs text-[var(--color-text-3)]">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

function AlertsInner() {
  return (
    <div className="mx-auto flex max-w-[960px] flex-col gap-7 px-4 py-6">
      <div>
        <h1 className="text-lg font-semibold text-[var(--color-text-1)]">Cảnh báo tín hiệu</h1>
        <p className="text-sm text-[var(--color-text-3)]">
          Theo dõi 10 tín hiệu kỹ thuật trên watchlist của bạn và nhận thông báo qua Telegram trong phiên.
        </p>
      </div>

      <TelegramConnect />

      <Section title="Tín hiệu" hint="Bật theo dõi để nhận cảnh báo khi tín hiệu xuất hiện trên mã trong watchlist.">
        <SignalsList />
      </Section>

      <Section title="Cảnh báo của tôi" hint="Bật/tắt hoặc xóa. Tạo cảnh báo tùy chỉnh từ trang Backtest (Lưu thành cảnh báo).">
        <RulesList />
      </Section>

      <Section title="Lịch sử tín hiệu" hint="Các tín hiệu đã bắn gần đây (tối đa 50).">
        <EventsList />
      </Section>
    </div>
  )
}

export function AlertsPage() {
  return (
    <PremiumGate
      featureName="Cảnh báo tín hiệu"
      description="Nhận tín hiệu kỹ thuật theo watchlist qua Telegram, cập nhật trong phiên giao dịch."
    >
      <AlertsInner />
    </PremiumGate>
  )
}

export default AlertsPage
