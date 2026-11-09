/**
 * Đai của Candle Dojo (spec v1.2 §2): avatar có dải đai, thanh 6 màu đai và hình đai nhỏ cho hàng thi đai.
 * Màu đai là dữ liệu của danh mục (`CD_DOJOS`), không phải màu giao diện.
 */
import { CD_DOJOS } from "@/lib/candle-dojo/lessons"
import { cn } from "@/lib/utils"
import { beltAdjective, beltColor, DOJO_COPY } from "./candle-dojo-model"

const BELT_EDGE = "border-[1.5px] border-black/25"

/** Tên đai để đọc: "Đai trắng" hoặc "Chưa có đai". */
function beltName(belt: number): string {
  return belt >= 0 ? `Đai ${beltAdjective(belt)}` : DOJO_COPY.noBelt
}

/** Avatar tròn với dải đai (nút thắt ở giữa) ở phía dưới; chưa có đai thì không có dải. */
export function BeltAvatar({ belt, size = 54, initial = "B", className }: {
  belt: number
  size?: number
  initial?: string
  className?: string
}) {
  const color = beltColor(belt)
  return (
    <span
      role="img"
      aria-label={beltName(belt)}
      data-belt={belt}
      className={cn("relative inline-block shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <span
        aria-hidden="true"
        className="grid size-full place-items-center rounded-full border border-border bg-secondary font-heading font-extrabold text-foreground"
        style={{ fontSize: size * 0.36 }}
      >
        {initial}
      </span>
      {color && (
        <span
          aria-hidden="true"
          data-testid="belt-strip"
          className={cn("absolute rounded-[4px] shadow-[0_2px_0_rgb(0_0_0/0.15)]", BELT_EDGE)}
          style={{ left: "-6%", right: "-6%", bottom: "-4%", height: "22%", background: color }}
        >
          <span
            className={cn("absolute rounded-[3px]", BELT_EDGE)}
            style={{ left: "50%", top: "-30%", width: "26%", height: "160%", transform: "translateX(-50%)", background: color }}
          />
        </span>
      )}
    </span>
  )
}

/** Thanh 6 màu đai: các đai đã đạt đậm, còn lại mờ. */
export function BeltBar({ belt, className }: { belt: number; className?: string }) {
  return (
    <div role="img" aria-label={`${beltName(belt)}, ${Math.max(0, belt + 1)} trên ${CD_DOJOS.length} đai`} className={cn("flex gap-1", className)}>
      {CD_DOJOS.map((dojo) => (
        <span
          key={dojo.n}
          aria-hidden="true"
          data-on={dojo.n <= belt}
          className={cn("h-[7px] w-6 rounded-full border border-black/15", dojo.n <= belt ? "opacity-100" : "opacity-30")}
          style={{ background: dojo.color }}
        />
      ))}
    </div>
  )
}

/** Hình đai nhỏ ở hàng "Thi đai" (viền tối để đai trắng vẫn nhìn thấy). */
export function BeltGlyph({ color, className }: { color: string; className?: string }) {
  return (
    <svg viewBox="0 0 48 40" className={className} aria-hidden="true">
      <rect x="6" y="16" width="36" height="9" rx="3" fill={color} stroke="rgba(0,0,0,.3)" />
      <rect x="20" y="12" width="8" height="17" rx="2" fill={color} stroke="rgba(0,0,0,.3)" />
    </svg>
  )
}
