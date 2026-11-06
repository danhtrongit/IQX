/** Khung chat trên điện thoại (phòng chờ và trong ván): kéo từ dưới lên, cao 72% màn hình (spec v2.4 §3.2). */
import { useWorkspaceFrame } from "@/components/layout/workspace-frame-context"
import { FlashbackChatBox } from "./flashback-chat"
import type { ChatApi } from "./flashback-context"

export function FlashbackChatSheet({ chat, inMatch = true }: { chat: ChatApi; inMatch?: boolean }) {
  const frame = useWorkspaceFrame()
  if (!chat.open || (frame && !frame.overlay)) return null
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 h-[72dvh] animate-in duration-200 slide-in-from-bottom motion-reduce:animate-none">
      <FlashbackChatBox
        chat={chat}
        inMatch={inMatch}
        onClose={() => chat.setOpen(false)}
        className="h-full rounded-b-none rounded-t-2xl shadow-2xl"
      />
    </div>
  )
}
