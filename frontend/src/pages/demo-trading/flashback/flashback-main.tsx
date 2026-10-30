/**
 * Vùng chính của Flashback v2 "Phòng chơi": một trong bốn màn theo trạng thái người chơi. Lúc mới
 * vào, hỏi server xem mình có đang ở phòng nào không (chơi tiếp phòng đó); sau đó là Sảnh, Phòng
 * chờ hoặc Màn chơi. Khách chưa đăng nhập được mời đăng nhập.
 */
import { PanelState } from "@/components/layout/panel-state"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/hooks/use-auth"
import { useFlashback } from "./flashback-context"
import { FlashbackLobby } from "./flashback-lobby"
import { FlashbackMatchScreen } from "./flashback-match"
import { FlashbackRoomScreen } from "./flashback-room"

export function FlashbackMain() {
  const { isAuthenticated, openAuth } = useAuth()
  const { phase, bootFailed, retryBoot } = useFlashback()

  if (!isAuthenticated) {
    return (
      <PanelState
        title="Đăng nhập để chơi Flashback"
        description="Phòng chơi gắn với tài khoản của bạn."
        descriptionClassName="text-foreground"
        action={{ label: "Đăng nhập", onClick: () => openAuth("login") }}
      />
    )
  }

  if (phase === "boot") {
    if (bootFailed) {
      return (
        <PanelState
          title="Chưa tải được Flashback"
          description="Kiểm tra kết nối rồi thử lại."
          descriptionClassName="text-foreground"
          action={{ label: "Thử lại", onClick: retryBoot }}
        />
      )
    }
    return (
      <div className="mx-auto w-full max-w-[1080px] space-y-3" role="status" aria-label="Đang tải Flashback">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (phase === "room") return <FlashbackRoomScreen />
  if (phase === "match") return <FlashbackMatchScreen />
  return <FlashbackLobby />
}
