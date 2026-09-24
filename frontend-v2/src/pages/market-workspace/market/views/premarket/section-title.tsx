// ─── Section title ────────────────────────────────────────────────────────────
// The legacy `.pm-section-title`: a 3px accent bar, the label, and a hairline
// rule underneath. The pre-market brief owns the primary (blue) accent.

export function SectionTitle({ label }: { label: string }) {
  return (
    <h2 className="flex items-center gap-2.5 border-b border-border pb-2 text-sm font-bold tracking-[-0.01em]">
      <span aria-hidden className="h-4 w-[3px] shrink-0 rounded-sm bg-primary" />
      {label}
    </h2>
  )
}
