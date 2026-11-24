/**
 * Nhắn tin với SACO on the client: inbox, open threads, Chat SACO (message first: the visitor writes at
 * once on a "new conversation" thread and the server hands it to a SACO), SACO invites.
 */
import { openPanel, Store, toast, ui } from "../bridge.ts"
import { floorApi } from "./api.ts"
import { messagePreview } from "./chat-preview.ts"
import { floorSocket } from "./socket.ts"
import type { ChatMessage, ConvDetail, Inbox, InviteEvent } from "./types.ts"

export const CHAT_RULES = {
  /** Time a SACO has to accept an invite from Chat SACO. */
  inviteMs: 5_000,
  maxText: 1_000,
} as const

/** `convId` of the "new conversation" thread in the chat panel (Chat SACO before a SACO has it). */
export const NEW_THREAD = "new"

export const NO_SACO_TEXT = "Hiện chưa có SACO nào, bạn thử lại sau nhé."

/** A message the visitor sent on the new thread while no SACO has the conversation yet. */
export interface FreshMessage {
  key: number
  text: string
  at: number
}

/** The "new conversation" thread of Chat SACO. */
export interface FreshThread {
  /** The conversation the server handed to a SACO; null until then. */
  convId: string | null
  /** Sent while waiting for a SACO, oldest first (the server keeps them and writes them on assignment). */
  sent: FreshMessage[]
  /** `pending`: a SACO is being found. `none`: there is no SACO at all. */
  state: "idle" | "pending" | "none"
  /** Text to put back in the composer after a failed dispatch (taken by the panel). */
  restore: string
}

const FRESH: FreshThread = { convId: null, sent: [], state: "idle", restore: "" }

export const chat = {
  inbox: new Store<Inbox | null>(null),
  threads: new Store<Record<string, ConvDetail>>({}),
  /** convId → time the "đang soạn tin" line goes away. */
  typing: new Store<Record<string, number>>({}),
  /** Chat SACO "new conversation" thread. */
  fresh: new Store<FreshThread>(FRESH),
  /** The invite this SACO must answer within 5 seconds. */
  invite: new Store<InviteEvent | null>(null),
  /** The conversation on screen: it is marked read and raises no toast. */
  viewing: new Store<string | null>(null),
}

export function unreadAsUser(inbox: Inbox | null): number {
  return inbox?.asUser.reduce((n, c) => n + c.unread, 0) ?? 0
}

export function unreadAsSaco(inbox: Inbox | null): number {
  return inbox?.asSaco.reduce((n, c) => n + c.unread, 0) ?? 0
}

let inboxTimer: ReturnType<typeof setTimeout> | null = null
let freshTimer: ReturnType<typeof setTimeout> | null = null
let chatActive = false
let pendingInboxWhileHidden = false
let pendingThreadWhileHidden = false

function isTabHidden(): boolean {
  return typeof document !== "undefined" && document.hidden === true
}

/** Debounced: a burst of socket events costs one request. Deferred while document is hidden. */
export function refreshInbox(delay = 120): void {
  // Guests have an inbox too (the server keys it by their guest token), but only once they have a character.
  if (!ui.profile.get()) return
  if (chatActive && isTabHidden()) {
    if (inboxTimer) {
      clearTimeout(inboxTimer)
      inboxTimer = null
    }
    pendingInboxWhileHidden = true
    return
  }
  pendingInboxWhileHidden = false
  if (inboxTimer) clearTimeout(inboxTimer)
  inboxTimer = setTimeout(async () => {
    inboxTimer = null
    if (chatActive && isTabHidden()) {
      pendingInboxWhileHidden = true
      return
    }
    try {
      const box = await floorApi.inbox()
      chat.inbox.set(box)
      // The match notice can be missed (socket blip): the inbox still names the conversation.
      if (chat.fresh.get().state === "pending" && box.matchedConvId)
        adoptFresh(box.matchedConvId)
    } catch {
      // Keep the last inbox.
    }
  }, delay)
}

function putThread(t: ConvDetail): void {
  chat.threads.update((all) => ({ ...all, [t.id]: t }))
}

export async function loadThread(id: string): Promise<void> {
  try {
    putThread(await floorApi.conversation(id))
    if (chat.viewing.get() === id) await markRead(id)
  } catch (e) {
    toast((e as Error).message, "warn")
  }
}

async function markRead(id: string): Promise<void> {
  try {
    await floorApi.read(id)
  } catch {
    // Read receipts are best effort.
  }
}

export function view(id: string | null): void {
  chat.viewing.set(id)
  if (id !== null) void loadThread(id)
}

/** Images accepted by the server (it re-checks the bytes): JPG, PNG, WebP up to 5 MB. */
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"]
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024

/** Upload progress (0 to 100) of the image being sent, by conversation. */
export const uploads = new Store<Record<string, number>>({})

export async function sendImage(id: string, file: File): Promise<boolean> {
  if (!IMAGE_TYPES.includes(file.type)) {
    toast("Chỉ gửi được ảnh JPG, PNG hoặc WebP.", "warn")
    return false
  }
  if (file.size > IMAGE_MAX_BYTES) {
    toast("Ảnh tối đa 5 MB.", "warn")
    return false
  }
  if (uploads.get()[id] !== undefined) {
    toast("Đang gửi một ảnh, chờ chút nhé.", "warn")
    return false
  }
  const progress = (percent: number) =>
    uploads.update((u) => ({ ...u, [id]: Math.round(percent) }))
  progress(0)
  try {
    const message = await floorApi.sendImage(id, file, progress)
    appendMessage(id, message)
    return true
  } catch (e) {
    toast((e as Error).message, "warn")
    return false
  } finally {
    uploads.update((u) => {
      const next = { ...u }
      delete next[id]
      return next
    })
  }
}

/** Recalls one of the visitor's own messages; the socket tells the other side. */
export async function recallMessage(convId: string, messageId: number): Promise<void> {
  try {
    await floorApi.recall(convId, messageId)
    markRecalled(convId, messageId)
  } catch (e) {
    toast((e as Error).message, "warn")
  }
}

function markRecalled(convId: string, messageId: number): void {
  const t = chat.threads.get()[convId]
  if (!t) return
  const strip = (m: ChatMessage): ChatMessage =>
    m.id === messageId && !m.recalled
      ? { id: m.id, from: m.from, text: "", at: m.at, recalled: true }
      : m
  putThread({
    ...t,
    messages: t.messages.map(strip),
    last: t.last ? strip(t.last) : t.last,
  })
}

export async function sendText(id: string, text: string): Promise<boolean> {
  try {
    const message = await floorApi.send(id, text)
    appendMessage(id, message)
    return true
  } catch (e) {
    toast((e as Error).message, "warn")
    return false
  }
}

function appendMessage(convId: string, message: ChatMessage): void {
  const t = chat.threads.get()[convId]
  if (!t || t.messages.some((m) => m.id === message.id)) return
  putThread({ ...t, messages: [...t.messages, message], last: message })
}

/**
 * Chat SACO button: back to the matched SACO, else the latest conversation that can still be written
 * to, else a new conversation the visitor can type into at once.
 */
export function chatSaco(): void {
  const box = chat.inbox.get()
  if (box?.matchedConvId)
    return openPanel("chat", { side: "user", convId: box.matchedConvId })
  const latest = box?.asUser.find((c) => c.writable)
  if (latest) return openPanel("chat", { side: "user", convId: latest.id })
  openFresh()
}

/** Starts the "new conversation" thread over, unless a SACO is being found for it right now. */
export function resetFresh(): void {
  const current = chat.fresh.get()
  // Text given back after a failed dispatch survives until the composer takes it.
  if (current.state !== "pending")
    chat.fresh.set({ ...FRESH, restore: current.restore })
}

/** Opens the "new conversation" thread; nothing reaches the server until the first message. */
export function openFresh(): void {
  resetFresh()
  openPanel("chat", { side: "user", convId: NEW_THREAD })
}

/** The chat panel shows the new thread right now. */
function freshOnScreen(): boolean {
  const panel = ui.panel.get()
  return panel?.kind === "chat" && panel.data?.convId === NEW_THREAD
}

let freshKey = 0

/**
 * Sends on the new thread: into the conversation once a SACO has it, else through `chat/start`
 * (queued on the server while a SACO is found). The message shows on the thread at once.
 */
export async function sendFresh(text: string): Promise<boolean> {
  const current = chat.fresh.get()
  if (current.convId) return sendText(current.convId, text)
  try {
    const r = await floorApi.start(text)
    if ("convId" in r) {
      adoptFresh(r.convId)
      await loadThread(r.convId)
      appendMessage(r.convId, r.message)
      return true
    }
    chat.fresh.update((f) =>
      f.convId
        ? f
        : {
            ...f,
            state: "pending",
            restore: "",
            sent: [...f.sent, { key: ++freshKey, text, at: Date.now() }],
          }
    )
    return true
  } catch (e) {
    toast((e as Error).message, "warn")
    return false
  }
}

/** A SACO has the new thread's conversation: the panel swaps to it in place. */
function adoptFresh(convId: string): void {
  const before = chat.fresh.get()
  if (before.convId === convId) return
  const wasPending = before.state === "pending"
  chat.fresh.set({ ...before, convId, state: "idle", restore: "" })
  refreshInbox(0)
  void loadThread(convId)
  if (wasPending && !freshOnScreen())
    toast("Đã có SACO nhận tin của bạn. Mở Chat SACO để trò chuyện tiếp.", "good")
}

/** The dispatch ended without a SACO: the visitor's text goes back into the composer. */
function failFresh(state: "none" | "idle", message: string): void {
  const f = chat.fresh.get()
  if (f.state !== "pending") return
  chat.fresh.set({
    convId: null,
    sent: [],
    state,
    restore: f.sent.map((m) => m.text).join(" "),
  })
  if (!freshOnScreen()) toast(message, "warn")
}

/** The panel put the restored text back in the composer. */
export function takeRestore(): string {
  const text = chat.fresh.get().restore
  if (text) chat.fresh.update((f) => ({ ...f, restore: "" }))
  return text
}

/** Opens the conversation with one SACO (creating it on the first message), for "Nhắn SACO" buttons. */
export async function openDirectChat(sacoId: string): Promise<void> {
  try {
    const c = await floorApi.openDirect(sacoId)
    refreshInbox(0)
    openPanel("chat", { side: "user", convId: c.id })
  } catch (e) {
    toast((e as Error).message, "warn")
  }
}

/** Set after this SACO accepts: the match notice that follows opens that conversation. */
let acceptedAt = 0

export async function answerInvite(accept: boolean): Promise<void> {
  const inv = chat.invite.get()
  if (!inv) return
  chat.invite.set(null)
  // The match notice can arrive over the socket before this request returns.
  if (accept) acceptedAt = Date.now()
  try {
    await floorApi.answerInvite(inv.id, accept)
  } catch (e) {
    acceptedAt = 0
    toast((e as Error).message, "warn")
  }
}

export async function setDuty(on: boolean): Promise<void> {
  try {
    const saco = await floorApi.duty(on)
    chat.inbox.update((box) => (box ? { ...box, saco } : box))
  } catch (e) {
    toast((e as Error).message, "warn")
  }
}

function sideOf(convId: string): "user" | "saco" | null {
  const t = chat.threads.get()[convId]
  if (t) return t.side
  const box = chat.inbox.get()
  if (box?.asUser.some((c) => c.id === convId)) return "user"
  if (box?.asSaco.some((c) => c.id === convId)) return "saco"
  return null
}

function panelShows(convId: string): boolean {
  return (
    ui.panel.get()?.kind === "chat" &&
    chat.viewing.get() === convId &&
    document.visibilityState === "visible"
  )
}

/** Loads the inbox and listens to the chat events. Returns the stop function. */
export function startChat(): () => void {
  chatActive = true
  pendingInboxWhileHidden = false
  pendingThreadWhileHidden = false
  refreshInbox(0)

  const onVisibilityChange = (): void => {
    if (!chatActive) return
    if (isTabHidden()) {
      if (inboxTimer) {
        clearTimeout(inboxTimer)
        inboxTimer = null
        pendingInboxWhileHidden = true
      }
      return
    }
    if (pendingInboxWhileHidden) {
      pendingInboxWhileHidden = false
      refreshInbox(0)
    }
    if (pendingThreadWhileHidden) {
      pendingThreadWhileHidden = false
      const id = chat.viewing.get()
      if (id !== null) void loadThread(id)
    }
  }
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibilityChange)
  }

  const off = [
    floorSocket.on("ready", () => {
      refreshInbox(0)
      // A reconnect can lose the match notice (the inbox names the conversation) or the whole dispatch
      // (server restart): give the text back when no conversation shows up.
      if (chat.fresh.get().state !== "pending") return
      if (freshTimer) clearTimeout(freshTimer)
      freshTimer = setTimeout(() => {
        freshTimer = null
        floorApi
          .inbox()
          .then((box) => {
            chat.inbox.set(box)
            if (box.matchedConvId) adoptFresh(box.matchedConvId)
            else
              failFresh(
                "idle",
                "Mất kết nối khi đang tìm SACO, bạn gửi lại tin nhé."
              )
          })
          .catch(() => undefined)
      }, 1500)
    }),
    floorSocket.on("chat:inbox", () => {
      refreshInbox()
      const id = chat.viewing.get()
      if (id !== null) {
        if (isTabHidden()) {
          pendingThreadWhileHidden = true
        } else {
          void loadThread(id)
        }
      }
    }),
    floorSocket.on("chat:msg", ({ convId, message }) => {
      if (message.from === "x" && Date.now() - acceptedAt < 5000) {
        acceptedAt = 0
        refreshInbox(0)
        openPanel("chat", { side: "saco", convId })
        return
      }
      const mine = sideOf(convId)
      appendMessage(convId, message)
      const fromPeer =
        message.from !== "x" &&
        mine !== null &&
        (mine === "user" ? message.from === "s" : message.from === "u")
      if (fromPeer) chat.typing.update((t) => ({ ...t, [convId]: 0 }))
      if (panelShows(convId)) void floorApi.read(convId).catch(() => undefined)
      else if (fromPeer) {
        const box = chat.inbox.get()
        const peer =
          box && [...box.asUser, ...box.asSaco].find((c) => c.id === convId)
        toast(
          `${peer?.peerName ?? (mine === "saco" ? "Khách" : "SACO")}: ${messagePreview(message).slice(0, 80)}`,
          "info"
        )
      }
      refreshInbox()
    }),
    floorSocket.on("chat:read", ({ convId, side, at }) => {
      const t = chat.threads.get()[convId]
      if (t && t.side !== side) putThread({ ...t, peerReadAt: at })
      refreshInbox()
    }),
    floorSocket.on("chat:recall", ({ convId, messageId }) => {
      markRecalled(convId, messageId)
      refreshInbox()
    }),
    floorSocket.on("chat:typing", ({ convId, side }) => {
      if (sideOf(convId) === side) return
      chat.typing.update((t) => ({ ...t, [convId]: Date.now() + 2500 }))
    }),
    floorSocket.on("chat:match", ({ event }) => {
      // "asking" and "cancelled" only matter to the old search overlay of tabs not reloaded yet.
      if (event.state === "matched") adoptFresh(event.convId)
      else if (event.state === "none") failFresh("none", NO_SACO_TEXT)
    }),
    // The countdown runs on this device's clock: a phone a minute off the server would show "0 giây".
    floorSocket.on("chat:invite", ({ invite }) =>
      chat.invite.set({
        ...invite,
        deadline: Date.now() + CHAT_RULES.inviteMs,
      })
    ),
    floorSocket.on("chat:invite:end", ({ id }) => {
      if (chat.invite.get()?.id === id) chat.invite.set(null)
    }),
  ]
  return () => {
    chatActive = false
    pendingInboxWhileHidden = false
    pendingThreadWhileHidden = false
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
    for (const fn of off) fn()
    if (inboxTimer) clearTimeout(inboxTimer)
    inboxTimer = null
    if (freshTimer) clearTimeout(freshTimer)
    freshTimer = null
    acceptedAt = 0
    for (const store of Object.values(chat)) (store as Store<unknown>).reset()
    uploads.reset()
  }
}
