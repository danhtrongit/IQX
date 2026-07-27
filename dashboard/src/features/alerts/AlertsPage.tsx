import { PremiumGate, usePremiumStatus } from "@/features/premium"
import { TourLaunchButton, TourOverlay, useFeatureTour } from "@/features/tour"
import { canhBaoTour } from "@/features/tour/configs/canhBaoTour"
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

export function AlertsInner() {
  // On-demand product tour (T3, docs/superpowers/plans/2026-07-27-feature-tours.md).
  // PREMIUM feature — `/chien-luoc`'s shared `PremiumGate` still renders this
  // component (blurred) for free users, so the launch button gates on its
  // own explicit premium check rather than the ambient gate.
  const { isPremium } = usePremiumStatus()
  const tour = useFeatureTour(canhBaoTour, { storageKey: "iqx_tour_canhbao" })

  return (
    <div className="mx-auto flex max-w-[960px] flex-col gap-7 px-4 py-6">
      <div className="flex items-start justify-between gap-3">
        <div data-tour-id="tour-canhbao-header">
          <h1 className="text-lg font-semibold text-[var(--color-text-1)]">Cảnh báo tín hiệu</h1>
          <p className="text-sm text-[var(--color-text-3)]">
            Theo dõi 10 tín hiệu kỹ thuật trên watchlist của bạn và nhận thông báo qua Telegram trong phiên.
          </p>
        </div>
        {isPremium && <TourLaunchButton onClick={tour.start} />}
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

      <TourOverlay config={canhBaoTour} controller={tour.controller} />
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
