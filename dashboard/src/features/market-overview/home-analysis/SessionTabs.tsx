import { cn } from "@/shared/lib/cn"
import type { SessionPeriod } from "./getDefaultActivePeriod"

const TABS: { id: SessionPeriod; icon: string; label: string; time: string }[] = [
  { id: "premarket", icon: "☀️", label: "Trước phiên", time: "· 07:15" },
  { id: "midday", icon: "☕", label: "Giữa phiên", time: "· 11:30" },
  { id: "eod", icon: "🌙", label: "Cuối phiên", time: "· 16:30" },
]

export function SessionTabs({
  active,
  onSelect,
  newPeriod,
}: {
  active: SessionPeriod
  onSelect: (p: SessionPeriod) => void
  newPeriod: SessionPeriod | null
}) {
  return (
    <div role="tablist" aria-label="Phiên nhận định" className="mb-6 flex gap-1 border-b border-[var(--color-border-2)]">
      {TABS.map((t) => {
        const isActive = active === t.id
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(t.id)}
            className={cn(
              "-mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-[13px] font-medium transition-colors",
              isActive
                ? "border-[rgb(var(--primary-6))] text-[var(--color-text-1)]"
                : "border-transparent text-[var(--color-text-3)] hover:text-[var(--color-text-1)]",
            )}
          >
            <span aria-hidden>{t.icon}</span>
            {t.label}
            <span className="font-mono text-[11px] text-[var(--color-text-3)]">{t.time}</span>
            {newPeriod === t.id ? (
              <span className="rounded bg-[rgba(251,191,36,0.15)] px-1.5 py-px text-[10px] font-semibold text-[#fbbf24]">
                MỚI
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
