/**
 * Popover giải thích chỉ báo — port từ
 * `dashboard/src/features/strategy/IndicatorInfoPopover.tsx` sang shadcn.
 *
 * Mở bằng hover (giống Arco `trigger="hover" position="right"`) và bằng focus để
 * bàn phím vẫn dùng được. Chỉ báo không có nội dung giải thích thì popover không
 * tồn tại, biểu tượng vẫn hiển thị bình thường.
 */
import { useState, type ReactNode } from "react"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

import { indicatorInfo } from "./indicator-info"
import { IndicatorChart } from "./indicator-chart"

const LEVEL_HEADINGS = ["Vùng", "Trạng thái", "Hành động"] as const

export function IndicatorInfoPopover({
  indicatorId,
  label,
  children,
}: {
  indicatorId: string
  label: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const info = indicatorInfo(indicatorId)

  if (!info) return <>{children}</>

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        asChild
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {children}
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        className="w-[330px] gap-0 border-border p-3"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="font-heading text-[13px] font-bold text-foreground">{label}</div>
        <p className="mt-0.5 mb-2 text-[11px] leading-4 text-muted-foreground">{info.tagline}</p>

        <div className={info.levels.length > 0 ? "mb-2" : ""}>
          <IndicatorChart indicatorId={indicatorId} archetype={info.archetype} />
        </div>

        {info.levels.length > 0 && (
          <table className="w-full border-collapse text-[10.5px]">
            <thead>
              <tr>
                {LEVEL_HEADINGS.map((heading) => (
                  <th
                    key={heading}
                    className="border-b border-border px-1 py-0.5 text-left font-semibold whitespace-nowrap text-muted-foreground"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {info.levels.map((level) => (
                <tr key={`${level.range}-${level.state}`}>
                  <td className="border-b border-border px-1 py-0.5 font-mono whitespace-nowrap text-muted-foreground">
                    {level.range}
                  </td>
                  <td className="border-b border-border px-1 py-0.5 text-foreground">{level.state}</td>
                  <td className="border-b border-border px-1 py-0.5 text-muted-foreground">
                    {level.action}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </PopoverContent>
    </Popover>
  )
}
