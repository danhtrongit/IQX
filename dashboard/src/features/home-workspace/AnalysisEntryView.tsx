import { useState, type ReactNode } from "react"

export interface AnalysisEntryProps {
  icon: ReactNode
  title: string
  subtitle: string
  placeholder: string
  emptyIcon: ReactNode
  emptyTitle: string
  emptyDesc: string
  onSubmit: (symbol: string) => void
}

export function AnalysisEntryView({
  icon, title, subtitle, placeholder, emptyIcon, emptyTitle, emptyDesc, onSubmit,
}: AnalysisEntryProps) {
  const [value, setValue] = useState("")

  const submit = () => {
    const sym = value.trim().toUpperCase()
    if (sym) onSubmit(sym)
  }

  return (
    <div className="mx-auto w-full max-w-[980px] px-4 py-6 pb-20 lg:px-8">
      {/* View header */}
      <div className="mb-6 flex items-center gap-3.5 border-b border-[var(--color-border-2)] pb-5">
        <div className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-[var(--color-primary-light-1)] text-[22px] text-[rgb(var(--primary-6))]">
          {icon}
        </div>
        <div>
          <div className="text-[22px] font-bold text-[var(--color-text-1)]">{title}</div>
          <div className="text-[12px] text-[var(--color-text-2)]">{subtitle}</div>
        </div>
      </div>

      {/* Search block */}
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-[var(--color-border-2)] bg-[var(--color-bg-2)] px-5 py-4">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit() }}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-[10px] border border-[var(--color-border-2)] bg-[var(--color-bg-1)] px-4 py-3 text-[15px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-1)] outline-none placeholder:font-normal placeholder:normal-case placeholder:tracking-normal placeholder:text-[var(--color-text-3)] focus:border-[rgb(var(--primary-6))]"
        />
        <button
          type="button"
          onClick={submit}
          className="shrink-0 rounded-[10px] bg-[rgb(var(--primary-6))] px-6 py-3 text-[14px] font-semibold text-white hover:opacity-90"
        >
          Phân tích
        </button>
      </div>

      {/* Empty state */}
      <div className="mx-auto max-w-[480px] px-6 pb-20 pt-[100px] text-center">
        <div className="mb-5 text-[56px] opacity-30">{emptyIcon}</div>
        <div className="mb-3 text-[20px] font-bold text-[var(--color-text-1)]">{emptyTitle}</div>
        <div className="text-[14px] leading-[1.65] text-[var(--color-text-2)]">{emptyDesc}</div>
      </div>
    </div>
  )
}
