import { Construction } from "lucide-react"

interface UnderConstructionProps {
  title?: string
  description?: string
}

export function UnderConstruction({
  title = "Trang chưa triển khai",
  description = "Tính năng này sẽ được triển khai trong các phiên bản tới.",
}: UnderConstructionProps) {
  return (
    <div className="flex h-full min-h-[400px] flex-col items-center justify-center gap-4 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-muted">
        <Construction className="size-8 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}
