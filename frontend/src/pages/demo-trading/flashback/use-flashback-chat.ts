/**
 * Chat phòng của Flashback (spec v2.4 §3): một luồng cho mỗi phòng, dùng chung cho phòng chờ, trong
 * ván và cửa sổ kết quả, nên hook nằm ở bộ điều khiển chung thay vì ở từng màn.
 *
 * Danh sách tin luôn do server tính theo phiên của mình (§3.4). Trình duyệt chỉ hiện đúng những gì
 * server trả, và hỏi lại ngay khi mình sang phiên mới hoặc ván kết thúc để tin vừa tới lượt hiện ra.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { useWorkspaceFrame } from "@/components/layout/workspace-frame-context"
import { ApiError } from "@/lib/api"
import {
  fetchChat,
  muteChatUser,
  reportChatMessage,
  sendChatMessage,
  type FlashbackChat,
  type FlashbackChatMessage,
} from "./flashback-api"
import type { ChatApi, FlashbackPhase } from "./flashback-context"
import { CHAT_COOLDOWN_MS, CHAT_TOO_FAST } from "./flashback-model"
import { useChatImages } from "./use-chat-images"
import { flashbackKeys } from "./use-flashback"

const NO_MESSAGES: FlashbackChatMessage[] = []
const NO_MUTED: FlashbackChat["muted"] = []

export function useFlashbackChat({
  userId,
  roomCode,
  phase,
  roomChatEnabled,
  step,
  ended,
}: {
  userId: string
  roomCode: string | null
  phase: FlashbackPhase
  /** `chat_enabled` của phòng nếu đã biết; chỉ dùng tới khi lần đọc chat đầu tiên về. */
  roomChatEnabled: boolean | undefined
  /** Phiên của mình trong ván đang mở. */
  step: number | null
  ended: boolean
}): ChatApi {
  const queryClient = useQueryClient()
  const key = flashbackKeys.chat(userId, roomCode ?? "")
  const chatQuery = useQuery({
    queryKey: key,
    enabled: !!userId && roomCode !== null && roomChatEnabled !== false,
    staleTime: 0,
    retry: false,
    queryFn: ({ signal }) => fetchChat(roomCode ?? "", signal),
    refetchInterval: (query) => (query.state.data?.enabled === false ? false : 2_000),
  })
  const data = chatQuery.data
  const messages = data?.messages ?? NO_MESSAGES
  const enabled = data?.enabled ?? roomChatEnabled ?? false

  // Sang phiên mới hoặc ván vừa kết thúc: lấy ngay các tin vừa tới lượt, không chờ lần polling kế.
  const position = `${step ?? ""}:${ended}`
  const lastPosition = useRef(position)
  useEffect(() => {
    if (lastPosition.current === position) return
    lastPosition.current = position
    void queryClient.invalidateQueries({ queryKey: flashbackKeys.chat(userId, roomCode ?? "") })
  }, [position, queryClient, roomCode, userId])

  const [open, setOpen] = useState(false)
  const [readIds, setReadIds] = useState<ReadonlySet<string> | null>(null)
  const [trackedRoom, setTrackedRoom] = useState(roomCode)
  if (trackedRoom !== roomCode) {
    setTrackedRoom(roomCode)
    setReadIds(null)
    setOpen(false)
  }
  // Phòng chờ luôn hiện sẵn khung chat nên không có khung nào để mở.
  if (phase === "room" && open) setOpen(false)

  // Tin có sẵn lúc mới vào coi như đã đọc; từ đó, khung đang hiện thì mọi tin đều đã đọc.
  const watching = open || phase === "room"
  if (data && (readIds === null || (watching && messages.some((message) => !readIds.has(message.id))))) {
    setReadIds(new Set(messages.map((message) => message.id)))
  }
  const unread =
    watching || readIds === null ? 0 : messages.filter((message) => !message.is_me && !readIds.has(message.id)).length

  // Ảnh qua WebSocket của phòng: cùng quy tắc phiên, tắt tiếng và bật/tắt chat như tin chữ (do server áp).
  const mutedIds = useMemo(() => new Set((data?.muted ?? NO_MUTED).map((user) => user.user_id)), [data?.muted])
  const imagesApi = useChatImages({ roomCode, enabled: enabled && roomCode !== null, userId, mutedIds, watching })

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: flashbackKeys.chat(userId, roomCode ?? "") })
  }, [queryClient, roomCode, userId])

  const lastSentAt = useRef(0)
  const sendMutation = useMutation({
    mutationFn: (text: string) => sendChatMessage(roomCode ?? "", text),
  })
  const sendAsync = sendMutation.mutateAsync
  const send = useCallback(
    async (raw: string): Promise<boolean> => {
      const text = raw.trim()
      if (!text || !roomCode) return false
      if (Date.now() - lastSentAt.current < CHAT_COOLDOWN_MS) {
        toast.info(CHAT_TOO_FAST)
        return false
      }
      lastSentAt.current = Date.now()
      try {
        const sent = await sendAsync(text)
        queryClient.setQueryData<FlashbackChat>(flashbackKeys.chat(userId, roomCode), (current) =>
          current && !current.messages.some((message) => message.id === sent.id)
            ? { ...current, messages: [...current.messages, sent] }
            : current,
        )
        refresh()
        return true
      } catch (error) {
        const message = error instanceof ApiError && error.message ? error.message : "Chưa gửi được tin. Thử lại."
        if (error instanceof ApiError && error.code === "CHAT_TOO_FAST") toast.info(message)
        else toast.error(message)
        return false
      }
    },
    [queryClient, refresh, roomCode, sendAsync, userId],
  )

  const muteMutation = useMutation({
    mutationFn: (input: { userId: string; name: string; muted: boolean }) =>
      muteChatUser(roomCode ?? "", input.userId, input.muted),
    onSuccess: (_result, input) => {
      toast.success(
        input.muted ? `Đã tắt tiếng ${input.name}. Chỉ bạn không thấy tin của họ.` : `Đã bỏ tắt tiếng ${input.name}.`,
      )
      refresh()
    },
    onError: () => toast.error("Chưa đổi được tắt tiếng. Thử lại."),
  })
  const muteUser = muteMutation.mutate
  const setMuted = useCallback(
    (targetId: string, name: string, muted: boolean) => muteUser({ userId: targetId, name, muted }),
    [muteUser],
  )

  const reportMutation = useMutation({
    mutationFn: (messageId: string) => reportChatMessage(roomCode ?? "", messageId),
    onSuccess: () => toast.success("Đã gửi báo cáo cho quản trị."),
    onError: () => toast.error("Chưa gửi được báo cáo. Thử lại."),
  })

  return {
    enabled,
    messages,
    muted: data?.muted ?? NO_MUTED,
    unread: unread + imagesApi.imageUnread,
    images: imagesApi.images,
    imagesReady: imagesApi.imagesReady,
    imageBusy: imagesApi.imageBusy,
    sendImage: imagesApi.sendImage,
    dismissImage: imagesApi.dismissImage,
    open: open && enabled,
    setOpen,
    send,
    sendBusy: sendMutation.isPending,
    setMuted,
    report: reportMutation.mutate,
  }
}

/** Mở hoặc đóng khung chat trong ván; trên máy tính bung lại cột phải nếu đang thu gọn. */
export function useChatOpener(chat: ChatApi) {
  const frame = useWorkspaceFrame()
  return (open: boolean) => {
    chat.setOpen(open)
    if (open && frame && !frame.overlay) frame.revealPanel()
  }
}
