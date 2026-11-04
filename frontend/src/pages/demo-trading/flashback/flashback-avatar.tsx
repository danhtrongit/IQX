/**
 * Avatar người chơi của Flashback: ảnh đại diện nếu có, không thì chữ cái đầu của tên trên nền
 * nhạt theo từng người (màu biểu đồ, không dùng màu thị trường).
 *
 * Ở mọi chỗ có avatar (danh sách phòng, phòng chờ, thanh người chơi, kết quả, bảng xếp hạng, lịch
 * sử đấu) có thêm ô cấp nhỏ ở góc dưới bên trái (v2.1 §3.3) và vương miện vàng, bạc, đồng trên đầu
 * người đang hạng 1, 2, 3 toàn hệ thống (v2.1 §4.3).
 */
import { Crown } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import type { FlashbackCrown } from "./flashback-api"
import { avatarTone, initialOf } from "./flashback-model"

export type PlayerAvatarSize = "sm" | "default" | "lg" | "xl"

/** Cỡ vương miện và ô cấp theo cỡ avatar. */
const DECOR: Record<PlayerAvatarSize, { crown: string; badge: string }> = {
  sm: { crown: "-top-2 h-3 w-4", badge: "-bottom-1 -left-1 h-3.5 min-w-3.5 text-[9px] leading-[11px]" },
  default: { crown: "-top-2.5 h-3.5 w-5", badge: "-bottom-1 -left-1 h-4 min-w-4 text-[10px] leading-[13px]" },
  lg: { crown: "-top-3.5 h-[18px] w-7", badge: "-bottom-1 -left-1.5 h-[18px] min-w-[18px] text-[11px] leading-[15px]" },
  xl: {
    crown: "-top-5 h-6 w-9 sm:-top-6 sm:h-7 sm:w-11",
    badge: "-bottom-0.5 -left-1 h-5 min-w-5 text-xs leading-[17px] sm:h-[22px] sm:min-w-[22px] sm:text-[13px] sm:leading-[19px]",
  },
}

const CROWN_TONE: Record<1 | 2 | 3, string> = {
  1: "text-crown-gold",
  2: "text-crown-silver",
  3: "text-crown-bronze",
}

/** Avatar cỡ bục xếp hạng: 50px trên điện thoại, 64px từ màn hình vừa trở lên. */
const XL_CLASS = "size-[50px] sm:size-16"

export function PlayerAvatar({
  name,
  avatarUrl,
  seed,
  size = "default",
  className,
  wrapperClassName,
  level,
  crown,
}: {
  name: string
  avatarUrl: string | null
  /** Khoá ổn định để mỗi người luôn có cùng một màu nền (id người dùng). */
  seed: string
  size?: PlayerAvatarSize
  className?: string
  wrapperClassName?: string
  /** Cấp của người chơi; không truyền thì không có ô cấp. */
  level?: number | null
  /** Hạng 1, 2, 3 toàn hệ thống thì đội vương miện. */
  crown?: FlashbackCrown
}) {
  const decor = DECOR[size]
  return (
    <span className={cn("relative inline-flex shrink-0", wrapperClassName)}>
      {crown ? (
        <span
          role="img"
          aria-label={`Top ${crown}`}
          data-testid="flashback-crown"
          data-crown={crown}
          className={cn(
            // Bóng tối mỏng quanh vương miện giữ hình dáng rõ trên thẻ sáng (bạc và vàng nhạt trên nền trắng).
            "pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 -rotate-[8deg] drop-shadow-[0_1px_1px_var(--level-badge)]",
            CROWN_TONE[crown],
            decor.crown,
          )}
        >
          <Crown className="size-full" fill="currentColor" strokeWidth={1.5} aria-hidden="true" />
        </span>
      ) : null}
      <Avatar size={size === "xl" ? "default" : size} className={cn(size === "xl" && XL_CLASS, className)}>
        {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
        <AvatarFallback
          className={cn(avatarTone(seed), "font-bold text-foreground", size === "xl" && "text-xl sm:text-2xl")}
        >
          {initialOf(name)}
        </AvatarFallback>
      </Avatar>
      {level ? (
        <span
          role="img"
          aria-label={`Cấp ${level}`}
          data-testid="flashback-level"
          className={cn(
            "pointer-events-none absolute z-10 grid place-items-center rounded-[5px] border-[1.5px] border-crown-gold bg-level-badge px-0.5 text-center font-black text-crown-gold tabular-nums",
            decor.badge,
          )}
        >
          {level}
        </span>
      ) : null}
    </span>
  )
}
