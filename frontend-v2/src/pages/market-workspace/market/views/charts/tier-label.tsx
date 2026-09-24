/**
 * Section heading for one chart tier (`Cấu trúc phiên`, `Dòng tiền`,
 * `Sức khỏe thị trường`): accent bar + heading face title.
 */
export function TierLabel({ label }: { label: string }) {
  return (
    <div className="mt-8 mb-4 flex items-center gap-3">
      <span aria-hidden className="h-6 w-1 shrink-0 rounded-sm bg-primary" />
      <span className="font-heading text-lg font-bold tracking-tight text-foreground">{label}</span>
    </div>
  )
}
