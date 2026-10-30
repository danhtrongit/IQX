/**
 * Avatar người chơi của Flashback: ảnh đại diện nếu có, không thì chữ cái đầu của tên trên nền
 * nhạt theo từng người (màu biểu đồ, không dùng màu thị trường).
 */
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { avatarTone, initialOf } from "./flashback-model"

export function PlayerAvatar({
  name,
  avatarUrl,
  seed,
  size = "default",
  className,
}: {
  name: string
  avatarUrl: string | null
  /** Khoá ổn định để mỗi người luôn có cùng một màu nền (id người dùng). */
  seed: string
  size?: "default" | "sm" | "lg"
  className?: string
}) {
  return (
    <Avatar size={size} className={className}>
      {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
      <AvatarFallback className={cn(avatarTone(seed), "font-bold text-foreground")}>{initialOf(name)}</AvatarFallback>
    </Avatar>
  )
}
