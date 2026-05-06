import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"

// ── Types ──

export interface ChatUser {
  id: string
  email: string
  fullName: string | null
  role: string
}

export interface ChatRoom {
  id: string
  name: string | null
  description: string | null
  type: "DIRECT" | "GROUP" | "PUBLIC"
  avatar: string | null
  createdById: string
  members: { id: string; userId: string; role: string; user: ChatUser }[]
  messages?: ChatMessage[]
  _count: { messages: number; members: number }
  unreadCount?: number
  createdAt: string
  updatedAt: string
}

export interface ChatMessage {
  id: string
  roomId: string
  senderId: string
  content: string | null
  type: "TEXT" | "IMAGE" | "FILE" | "SYSTEM"
  fileUrl: string | null
  fileName: string | null
  fileSize: number | null
  replyToId: string | null
  isEdited: boolean
  isDeleted: boolean
  createdAt: string
  sender: ChatUser
  replyTo?: {
    id: string
    content: string | null
    sender: ChatUser
  } | null
  reactions: {
    id: string
    emoji: string
    userId: string
    user: ChatUser
  }[]
}

interface ChatContextValue {
  // Panel state
  isOpen: boolean
  setIsOpen: (open: boolean) => void

  // Rooms
  rooms: ChatRoom[]
  publicRooms: ChatRoom[]
  currentRoom: ChatRoom | null
  setCurrentRoom: (room: ChatRoom | null) => void
  createRoom: (name: string, type: "GROUP" | "PUBLIC") => Promise<void>
  loadRooms: () => Promise<void>
  loadPublicRooms: () => Promise<void>
  joinRoom: (roomId: string) => Promise<void>

  // Messages
  messages: ChatMessage[]
  sendMessage: (content: string, replyToId?: string) => void
  loadMessages: (roomId: string) => Promise<void>

  // Realtime state
  isConnected: boolean
  onlineUsers: string[]
  typingUsers: Map<string, string>
  sendTyping: (roomId: string) => void
  sendStopTyping: (roomId: string) => void
  markRead: (roomId: string) => void

  // Reactions
  addReaction: (messageId: string, emoji: string) => void
  removeReaction: (messageId: string, emoji: string) => void
}

const ChatContext = createContext<ChatContextValue | null>(null)

export function useChat() {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error("useChat must be used within ChatProvider")
  return ctx
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [rooms, setRooms] = useState<ChatRoom[]>([])
  const [publicRooms, setPublicRooms] = useState<ChatRoom[]>([])
  const [currentRoom, setCurrentRoom] = useState<ChatRoom | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const isConnected = false
  const onlineUsers = useMemo<string[]>(() => [], [])
  const typingUsers = useMemo(() => new Map<string, string>(), [])

  const selectCurrentRoom = useCallback((room: ChatRoom | null) => {
    setCurrentRoom(room)
    setMessages([])
  }, [])

  // ── API calls ──

  const loadRooms = useCallback(async () => {
    // Backend does not expose chat REST endpoints yet.
    setRooms([])
  }, [])

  const loadMessages = useCallback(async (roomId: string) => {
    void roomId
    // Backend does not expose /chat/rooms/{id}/messages yet.
    setMessages([])
  }, [])

  const createRoom = useCallback(async (name: string, type: "GROUP" | "PUBLIC") => {
    void name
    void type
    // Backend does not expose /chat/rooms yet.
  }, [])

  const loadPublicRooms = useCallback(async () => {
    // Backend does not expose /chat/rooms/public yet.
    setPublicRooms([])
  }, [])

  const joinRoom = useCallback(async (roomId: string) => {
    void roomId
    // Backend does not expose /chat/rooms/{id}/join yet.
  }, [])

  // ── Realtime actions disabled until chat REST/polling endpoints exist ──

  const sendMessage = useCallback(
    (content: string, replyToId?: string) => {
      void content
      void replyToId
    },
    [],
  )

  const sendTyping = useCallback((roomId: string) => {
    void roomId
  }, [])

  const sendStopTyping = useCallback((roomId: string) => {
    void roomId
  }, [])

  const markRead = useCallback((roomId: string) => {
    void roomId
  }, [])

  const addReaction = useCallback((messageId: string, emoji: string) => {
    void messageId
    void emoji
  }, [])

  const removeReaction = useCallback((messageId: string, emoji: string) => {
    void messageId
    void emoji
  }, [])

  const value = useMemo<ChatContextValue>(
    () => ({
      isOpen,
      setIsOpen,
      rooms,
      publicRooms,
      currentRoom,
      setCurrentRoom: selectCurrentRoom,
      createRoom,
      loadRooms,
      loadPublicRooms,
      joinRoom,
      messages,
      sendMessage,
      loadMessages,
      isConnected,
      onlineUsers,
      typingUsers,
      sendTyping,
      sendStopTyping,
      markRead,
      addReaction,
      removeReaction,
    }),
    [
      isOpen, rooms, publicRooms, currentRoom, messages, isConnected,
      onlineUsers, typingUsers, selectCurrentRoom, sendMessage, loadRooms,
      loadMessages, createRoom, loadPublicRooms, joinRoom,
      sendTyping, sendStopTyping, markRead, addReaction, removeReaction,
    ],
  )

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}
