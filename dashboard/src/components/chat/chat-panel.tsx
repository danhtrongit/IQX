import { useCallback, useEffect, useRef, useState } from "react"
import {
  ArrowLeft,
  Compass,
  Hash,
  Lock,
  LogIn,
  MessageCircle,
  Plus,
  Search,
  Send,
  Smile,
  Users,
  Wifi,
  WifiOff,
  X,
  Reply,
  CornerDownRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useChat, type ChatMessage, type ChatRoom } from "@/contexts/chat-context"
import { useAuth } from "@/contexts/auth-context"
import { toast } from "sonner"

// ── Quick Emoji Picker ──

const QUICK_EMOJIS = ["👍", "❤️", "😂", "🚀", "💰", "📈", "📉", "🔥", "👀", "✅"]

function EmojiPicker({ onSelect }: { onSelect: (emoji: string) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground">
          <Smile className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-auto p-2">
        <div className="flex gap-1 flex-wrap max-w-[200px]">
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => onSelect(emoji)}
              className="size-8 flex items-center justify-center hover:bg-muted rounded text-base transition-colors"
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ── Room List View ──

function RoomListView({
  onSelectRoom,
  onCreateRoom,
  onDiscover,
}: {
  onSelectRoom: (room: ChatRoom) => void
  onCreateRoom: () => void
  onDiscover: () => void
}) {
  const { rooms, onlineUsers, isConnected } = useChat()
  const { user } = useAuth()
  const [search, setSearch] = useState("")

  const filtered = rooms.filter(
    (r) =>
      !search ||
      r.name?.toLowerCase().includes(search.toLowerCase()) ||
      r.members.some((m) =>
        m.user.fullName?.toLowerCase().includes(search.toLowerCase()),
      ),
  )

  const getRoomDisplayName = (room: ChatRoom) => {
    if (room.name) return room.name
    if (room.type === "DIRECT") {
      const other = room.members.find((m) => m.userId !== user?.id)
      return other?.user.fullName || other?.user.email || "Tin nhắn"
    }
    return "Phòng chat"
  }

  const getRoomInitials = (room: ChatRoom) => {
    const name = getRoomDisplayName(room)
    return name.slice(0, 2).toUpperCase()
  }

  const getLastMessage = (room: ChatRoom) => {
    const msg = room.messages?.[0]
    if (!msg) return "Chưa có tin nhắn"
    if (msg.isDeleted) return "Tin nhắn đã xóa"
    const prefix = msg.sender?.fullName?.split(" ").pop() || "..."
    return `${prefix}: ${msg.content?.slice(0, 40) || "📎 File"}`
  }

  const getTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return "vừa xong"
    if (mins < 60) return `${mins}p`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h`
    return `${Math.floor(hours / 24)}d`
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-foreground">Chat</h2>
          <div className="flex items-center gap-1">
            {isConnected ? (
              <Wifi className="size-3 text-emerald-500" />
            ) : (
              <WifiOff className="size-3 text-destructive" />
            )}
            <span className="text-[10px] text-muted-foreground">
              {onlineUsers.length} online
            </span>
          </div>
        </div>
        <div className="flex gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={onDiscover}
              >
                <Compass className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Khám phá phòng công khai</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-primary"
                onClick={onCreateRoom}
              >
                <Plus className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Tạo phòng mới</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
          <Input
            placeholder="Tìm phòng chat..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 pl-7 text-xs bg-muted/50 border-transparent"
          />
        </div>
      </div>

      {/* Room List */}
      <ScrollArea className="flex-1">
        <div className="px-1.5 pb-2">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <MessageCircle className="size-8 mb-2 opacity-40" />
              <p className="text-xs">Chưa có phòng chat nào</p>
              <div className="flex gap-2 mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-7 gap-1"
                  onClick={onDiscover}
                >
                  <Compass className="size-3" />
                  Khám phá
                </Button>
                <Button
                  size="sm"
                  className="text-xs h-7 gap-1"
                  onClick={onCreateRoom}
                >
                  <Plus className="size-3" />
                  Tạo mới
                </Button>
              </div>
            </div>
          ) : (
            filtered.map((room) => {
              const isOnline =
                room.type === "DIRECT" &&
                room.members.some(
                  (m) => m.userId !== user?.id && onlineUsers.includes(m.userId),
                )

              return (
                <button
                  key={room.id}
                  onClick={() => onSelectRoom(room)}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-muted/60 transition-colors text-left group"
                >
                  {/* Avatar */}
                  <div className="relative shrink-0">
                    <Avatar className="size-8">
                      <AvatarFallback className="text-[10px] font-bold bg-primary/10 text-primary">
                        {getRoomInitials(room)}
                      </AvatarFallback>
                    </Avatar>
                    {isOnline && (
                      <span className="absolute -bottom-0.5 -right-0.5 size-2.5 bg-emerald-500 rounded-full border-2 border-card" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        {room.type === "PUBLIC" && <Hash className="size-2.5 text-muted-foreground shrink-0" />}
                        {room.type === "GROUP" && <Lock className="size-2.5 text-muted-foreground shrink-0" />}
                        <span className="text-xs font-semibold text-foreground truncate max-w-[130px]">
                          {getRoomDisplayName(room)}
                        </span>
                      </div>
                      {room.messages?.[0] && (
                        <span className="text-[9px] text-muted-foreground shrink-0">
                          {getTimeAgo(room.messages[0].createdAt)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-[10px] text-muted-foreground truncate max-w-[160px]">
                        {getLastMessage(room)}
                      </p>
                      {(room.unreadCount || 0) > 0 && (
                        <Badge className="h-4 min-w-4 px-1 text-[9px] font-bold bg-primary text-primary-foreground">
                          {room.unreadCount}
                        </Badge>
                      )}
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

// ── Discover Public Rooms View ──

function DiscoverRoomsView({
  onBack,
  onSelectRoom,
}: {
  onBack: () => void
  onSelectRoom: (room: ChatRoom) => void
}) {
  const { publicRooms, loadPublicRooms, joinRoom, rooms } = useChat()
  const [search, setSearch] = useState("")
  const [joiningId, setJoiningId] = useState<string | null>(null)

  // Load public rooms on mount
  useEffect(() => {
    loadPublicRooms()
  }, [loadPublicRooms])

  // Filter out rooms user already joined
  const myRoomIds = new Set(rooms.map((r) => r.id))
  const discoverable = publicRooms.filter(
    (r) =>
      !myRoomIds.has(r.id) &&
      (!search || r.name?.toLowerCase().includes(search.toLowerCase())),
  )

  const handleJoin = async (roomId: string) => {
    setJoiningId(roomId)
    try {
      await joinRoom(roomId)
      // Find the room and navigate into it
      const room = publicRooms.find((r) => r.id === roomId)
      if (room) onSelectRoom(room)
    } catch {
      // handle error silently
    } finally {
      setJoiningId(null)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 p-3 border-b border-border">
        <Button variant="ghost" size="icon" className="size-7" onClick={onBack}>
          <ArrowLeft className="size-3.5" />
        </Button>
        <div className="flex-1">
          <h2 className="text-sm font-bold text-foreground">Khám phá</h2>
          <p className="text-[10px] text-muted-foreground">Phòng chat công khai</p>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
          <Input
            placeholder="Tìm phòng công khai..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 pl-7 text-xs bg-muted/50 border-transparent"
          />
        </div>
      </div>

      {/* Public Room List */}
      <ScrollArea className="flex-1">
        <div className="px-1.5 pb-2">
          {discoverable.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Compass className="size-8 mb-2 opacity-40" />
              <p className="text-xs">Không có phòng công khai nào</p>
              <p className="text-[10px] mt-1 text-center px-4">
                Bạn có thể tạo phòng công khai để mọi người cùng tham gia
              </p>
            </div>
          ) : (
            discoverable.map((room) => (
              <div
                key={room.id}
                className="flex items-center gap-2.5 px-2 py-2.5 rounded-md hover:bg-muted/60 transition-colors"
              >
                {/* Avatar */}
                <Avatar className="size-9 shrink-0">
                  <AvatarFallback className="text-[10px] font-bold bg-emerald-500/10 text-emerald-600">
                    <Hash className="size-4" />
                  </AvatarFallback>
                </Avatar>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-semibold text-foreground truncate">
                      {room.name || "Phòng chat"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-muted-foreground">
                      <Users className="size-2.5 inline mr-0.5" />
                      {room._count.members} thành viên
                    </span>
                    {room.description && (
                      <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                        {room.description}
                      </span>
                    )}
                  </div>
                </div>

                {/* Join button */}
                <Button
                  size="sm"
                  className="h-7 text-[10px] font-semibold gap-1 shrink-0"
                  disabled={joiningId === room.id}
                  onClick={() => handleJoin(room.id)}
                >
                  <LogIn className="size-3" />
                  {joiningId === room.id ? "..." : "Tham gia"}
                </Button>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

// ── Create Room View ──

function CreateRoomView({ onBack }: { onBack: () => void }) {
  const { createRoom } = useChat()
  const [name, setName] = useState("")
  const [type, setType] = useState<"GROUP" | "PUBLIC">("GROUP")
  const [loading, setLoading] = useState(false)

  const handleCreate = async () => {
    if (!name.trim()) return
    setLoading(true)
    try {
      await createRoom(name.trim(), type)
      onBack()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-3 border-b border-border">
        <Button variant="ghost" size="icon" className="size-7" onClick={onBack}>
          <ArrowLeft className="size-3.5" />
        </Button>
        <h2 className="text-sm font-bold text-foreground">Tạo phòng chat</h2>
      </div>

      <div className="p-4 space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Tên phòng</label>
          <Input
            placeholder="VD: Nhóm VN30, Thảo luận HPG..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-8 text-xs"
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Loại phòng</label>
          <div className="flex gap-2">
            <button
              onClick={() => setType("GROUP")}
              className={`flex-1 flex items-center gap-2 p-2.5 rounded-lg border text-xs transition-colors ${
                type === "GROUP"
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              <Lock className="size-3.5" />
              <div className="text-left">
                <div className="font-semibold">Nhóm riêng</div>
                <div className="text-[10px] opacity-70">Mời thành viên</div>
              </div>
            </button>
            <button
              onClick={() => setType("PUBLIC")}
              className={`flex-1 flex items-center gap-2 p-2.5 rounded-lg border text-xs transition-colors ${
                type === "PUBLIC"
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              <Hash className="size-3.5" />
              <div className="text-left">
                <div className="font-semibold">Công khai</div>
                <div className="text-[10px] opacity-70">Ai cũng tham gia</div>
              </div>
            </button>
          </div>
        </div>

        <Button
          onClick={handleCreate}
          disabled={!name.trim() || loading}
          className="w-full h-8 text-xs font-semibold"
        >
          {loading ? "Đang tạo..." : "Tạo phòng chat"}
        </Button>
      </div>
    </div>
  )
}

// ── Chat Room View ──

function ChatRoomView({
  room,
  onBack,
}: {
  room: ChatRoom
  onBack: () => void
}) {
  const { user } = useAuth()
  const {
    messages,
    sendMessage,
    typingUsers,
    sendTyping,
    sendStopTyping,
    addReaction,
    onlineUsers,
  } = useChat()

  const [input, setInput] = useState("")
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current
      el.scrollTop = el.scrollHeight
    }
  }, [messages])

  const handleSend = () => {
    const trimmed = input.trim()
    if (!trimmed) return
    sendMessage(trimmed, replyTo?.id)
    setInput("")
    setReplyTo(null)
  }

  const handleInputChange = (value: string) => {
    setInput(value)
    sendTyping(room.id)
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => sendStopTyping(room.id), 2000)
  }

  const getRoomDisplayName = () => {
    if (room.name) return room.name
    if (room.type === "DIRECT") {
      const other = room.members.find((m) => m.userId !== user?.id)
      return other?.user.fullName || other?.user.email || "Tin nhắn"
    }
    return "Chat"
  }

  const typingInRoom = Array.from(typingUsers.entries())
    .filter(([uid, rid]) => rid === room.id && uid !== user?.id)
    .map(([uid]) => {
      const member = room.members.find((m) => m.userId === uid)
      return member?.user?.fullName?.split(" ").pop() || "..."
    })

  const onlineMemberCount = room.members.filter((m) =>
    onlineUsers.includes(m.userId),
  ).length

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
  }

  const getInitials = (name: string | null, email: string) => {
    if (name) {
      const parts = name.split(" ")
      return parts.length > 1
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : name.slice(0, 2).toUpperCase()
    }
    return email.slice(0, 2).toUpperCase()
  }

  // Group messages by date
  const groupedMessages = messages.reduce<{ date: string; msgs: ChatMessage[] }[]>(
    (acc, msg) => {
      const dateStr = new Date(msg.createdAt).toLocaleDateString("vi-VN")
      const last = acc[acc.length - 1]
      if (last?.date === dateStr) {
        last.msgs.push(msg)
      } else {
        acc.push({ date: dateStr, msgs: [msg] })
      }
      return acc
    },
    [],
  )

  return (
    <div className="flex flex-col h-full">
      {/* Room Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card">
        <Button variant="ghost" size="icon" className="size-7" onClick={onBack}>
          <ArrowLeft className="size-3.5" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {room.type === "PUBLIC" && <Hash className="size-3 text-muted-foreground" />}
            {room.type === "GROUP" && <Lock className="size-3 text-muted-foreground" />}
            <span className="text-xs font-bold text-foreground truncate">
              {getRoomDisplayName()}
            </span>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Users className="size-2.5" />
            <span>{room._count.members} thành viên</span>
            <span>·</span>
            <span className="text-emerald-500">{onlineMemberCount} online</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
        {groupedMessages.map((group) => (
          <div key={group.date}>
            {/* Date separator */}
            <div className="flex items-center gap-2 my-3">
              <Separator className="flex-1" />
              <span className="text-[9px] text-muted-foreground shrink-0">
                {group.date}
              </span>
              <Separator className="flex-1" />
            </div>

            {group.msgs.map((msg, idx) => {
              const isMe = msg.senderId === user?.id
              const prevMsg = idx > 0 ? group.msgs[idx - 1] : null
              const isSameSender = prevMsg?.senderId === msg.senderId
              const showAvatar = !isSameSender

              if (msg.isDeleted) {
                return (
                  <div key={msg.id} className="flex items-center gap-2 py-1 pl-9">
                    <span className="text-[10px] text-muted-foreground italic">
                      Tin nhắn đã bị xóa
                    </span>
                  </div>
                )
              }

              return (
                <div
                  key={msg.id}
                  className={`group flex gap-2 py-0.5 ${showAvatar ? "mt-2" : ""} hover:bg-muted/30 rounded px-1 -mx-1 transition-colors`}
                >
                  {/* Avatar */}
                  <div className="w-7 shrink-0 pt-0.5">
                    {showAvatar && (
                      <Avatar className="size-6">
                        <AvatarFallback
                          className={`text-[8px] font-bold ${
                            isMe
                              ? "bg-primary/15 text-primary"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {getInitials(msg.sender.fullName, msg.sender.email)}
                        </AvatarFallback>
                      </Avatar>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {showAvatar && (
                      <div className="flex items-baseline gap-1.5 mb-0.5">
                        <span
                          className={`text-[11px] font-semibold ${
                            isMe ? "text-primary" : "text-foreground"
                          }`}
                        >
                          {msg.sender.fullName || msg.sender.email}
                        </span>
                        <span className="text-[9px] text-muted-foreground">
                          {formatTime(msg.createdAt)}
                        </span>
                        {msg.isEdited && (
                          <span className="text-[8px] text-muted-foreground italic">
                            (đã sửa)
                          </span>
                        )}
                      </div>
                    )}

                    {/* Reply reference */}
                    {msg.replyTo && (
                      <div className="flex items-center gap-1 mb-0.5 text-[10px] text-muted-foreground bg-muted/50 rounded px-2 py-0.5 border-l-2 border-primary/30">
                        <CornerDownRight className="size-2.5 shrink-0" />
                        <span className="font-medium">
                          {msg.replyTo.sender?.fullName?.split(" ").pop()}:
                        </span>
                        <span className="truncate">
                          {msg.replyTo.content?.slice(0, 50)}
                        </span>
                      </div>
                    )}

                    {/* Message text */}
                    <p className="text-xs text-foreground break-words leading-relaxed">
                      {msg.content}
                    </p>

                    {/* File */}
                    {msg.fileUrl && (
                      <a
                        href={msg.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 mt-1 text-[10px] text-primary hover:underline"
                      >
                        📎 {msg.fileName || "File đính kèm"}
                      </a>
                    )}

                    {/* Reactions */}
                    {msg.reactions.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {Object.entries(
                          msg.reactions.reduce<Record<string, { count: number; users: string[]; hasMe: boolean }>>(
                            (acc, r) => {
                              if (!acc[r.emoji]) acc[r.emoji] = { count: 0, users: [], hasMe: false }
                              acc[r.emoji].count++
                              acc[r.emoji].users.push(r.user.fullName || r.user.email)
                              if (r.userId === user?.id) acc[r.emoji].hasMe = true
                              return acc
                            },
                            {},
                          ),
                        ).map(([emoji, data]) => (
                          <button
                            key={emoji}
                            onClick={() => addReaction(msg.id, emoji)}
                            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] transition-colors ${
                              data.hasMe
                                ? "bg-primary/15 border border-primary/30"
                                : "bg-muted hover:bg-muted/80 border border-transparent"
                            }`}
                          >
                            <span>{emoji}</span>
                            <span className="tabular-nums">{data.count}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Hover actions */}
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-start gap-0.5 shrink-0 pt-0.5">
                    <EmojiPicker onSelect={(emoji) => addReaction(msg.id, emoji)} />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 text-muted-foreground hover:text-foreground"
                      onClick={() => setReplyTo(msg)}
                    >
                      <Reply className="size-3" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        ))}

        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <MessageCircle className="size-10 mb-2 opacity-30" />
            <p className="text-xs">Bắt đầu cuộc trò chuyện!</p>
          </div>
        )}
      </div>

      {/* Typing indicator */}
      {typingInRoom.length > 0 && (
        <div className="px-3 py-1 text-[10px] text-muted-foreground animate-pulse">
          {typingInRoom.join(", ")} đang nhập...
        </div>
      )}

      {/* Reply preview */}
      {replyTo && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 border-t border-border">
          <CornerDownRight className="size-3 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-medium text-primary">
              Trả lời {replyTo.sender.fullName || replyTo.sender.email}
            </span>
            <p className="text-[10px] text-muted-foreground truncate">
              {replyTo.content?.slice(0, 60)}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-5"
            onClick={() => setReplyTo(null)}
          >
            <X className="size-3" />
          </Button>
        </div>
      )}

      {/* Input */}
      <div className="p-2 border-t border-border bg-card">
        <div className="flex items-center gap-1">
          <Input
            placeholder="Nhập tin nhắn..."
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            className="h-8 text-xs flex-1 bg-muted/50 border-transparent"
          />
          <EmojiPicker
            onSelect={(emoji) => setInput((prev) => prev + emoji)}
          />
          <Button
            size="icon"
            className="size-8 shrink-0"
            onClick={handleSend}
            disabled={!input.trim()}
          >
            <Send className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Main ChatPanel Component ──

export function ChatPanel() {
  const { isOpen, setIsOpen, currentRoom, setCurrentRoom } = useChat()
  const [view, setView] = useState<"rooms" | "create" | "discover">("rooms")

  // Listen for chat notification events and show toast
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        senderName: string
        content: string
        roomId: string
      }
      toast(`💬 ${detail.senderName}`, {
        description: detail.content,
        action: {
          label: "Xem",
          onClick: () => setIsOpen(true),
        },
      })
    }
    window.addEventListener("chat:notification", handler)
    return () => window.removeEventListener("chat:notification", handler)
  }, [setIsOpen])

  const handleSelectRoom = useCallback(
    (room: ChatRoom) => {
      setCurrentRoom(room)
    },
    [setCurrentRoom],
  )

  const handleBack = useCallback(() => {
    setCurrentRoom(null)
    setView("rooms")
  }, [setCurrentRoom])

  // Reset view when closed
  useEffect(() => {
    if (!isOpen) {
      setView("rooms")
      setCurrentRoom(null)
    }
  }, [isOpen, setCurrentRoom])

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent
        side="right"
        className="w-[340px] sm:w-[380px] p-0 flex flex-col [&>button]:hidden"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Chat</SheetTitle>
        </SheetHeader>

        {currentRoom ? (
          <ChatRoomView room={currentRoom} onBack={handleBack} />
        ) : view === "create" ? (
          <CreateRoomView onBack={() => setView("rooms")} />
        ) : view === "discover" ? (
          <DiscoverRoomsView
            onBack={() => setView("rooms")}
            onSelectRoom={handleSelectRoom}
          />
        ) : (
          <RoomListView
            onSelectRoom={handleSelectRoom}
            onCreateRoom={() => setView("create")}
            onDiscover={() => setView("discover")}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}
