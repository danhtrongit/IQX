export function SessionMeta({ dateLabel }: { dateLabel: string | null }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <span className="rounded bg-[var(--color-primary-light-1)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.5px] text-[rgb(var(--primary-6))]">
        Phân tích thị trường
      </span>
      {dateLabel ? (
        <span className="text-[12px] font-medium uppercase tracking-[0.3px] text-[var(--color-text-2)]">
          {dateLabel}
        </span>
      ) : null}
    </div>
  )
}
