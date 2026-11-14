/** Nhắn tin với SACO on the client: inbox, open threads, Chat SACO matching, SACO invites. */
import { openPanel, Store, toast, ui } from "../bridge.ts"
import { floorApi } from "./api.ts"
import { floorSocket } from "./socket.ts"
import type {
  ChatMessage,
  ConvDetail,
  Inbox,
  InviteEvent,
  MatchEvent,
} from "./types.ts"

export const CHAT_RULES = {
  /** Time a SACO has to accept an invite from Chat SACO. */
  inviteMs: 5_000,
  maxText: 1_000,
} as const

export type MatchState = MatchEvent | { state: "starting" }

export const chat = {
  inbox: new Store<Inbox | null>(null),
  threads: new Store<Record<string, ConvDetail>>({}),
  /** convId → time the "đang soạn tin" line goes away. */
  typing: new Store<Record<string, number>>({}),
  /** Chat SACO progress for the user; null hides the overlay. */
  match: new Store<MatchState | null>(null),
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

/** Debounced: a burst of socket events costs one request. */
export function refreshInbox(delay = 120): void {
  if (!ui.profile.get()) return
  if (inboxTimer) clearTimeout(inboxTimer)
  inboxTimer = setTimeout(async () => {
    inboxTimer = null
    try {
      chat.inbox.set(await floorApi.inbox())
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

/** Chat SACO button: back to the matched SACO, else the latest chat, else find a SACO. */
export function chatSaco(): void {
  const box = chat.inbox.get()
  if (box?.matchedConvId)
    return openPanel("chat", { side: "user", convId: box.matchedConvId })
  const latest = box?.asUser.find((c) => c.writable) ?? box?.asUser[0]
  if (latest) return openPanel("chat", { side: "user", convId: latest.id })
  void findSaco()
}

export async function findSaco(): Promise<void> {
  if (chat.match.get()) return
  chat.match.set({ state: "starting" })
  try {
    const r = await floorApi.match()
    if ("convId" in r) {
      chat.match.set(null)
      openPanel("chat", { side: "user", convId: r.convId })
    }
  } catch (e) {
    chat.match.set(null)
    toast((e as Error).message, "warn")
  }
}

export async function cancelFind(): Promise<void> {
  // Close at once: if the socket dropped, the "cancelled" event never comes and the overlay would stay.
  chat.match.set(null)
  try {
    await floorApi.cancelMatch()
  } catch {
    // The server run ends on its own after the invite window.
  }
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
  refreshInbox(0)
  const off = [
    floorSocket.on("ready", () => {
      refreshInbox(0)
      // A reconnect (server restart) loses a running match: do not leave the overlay spinning.
      if (chat.match.get()) chat.match.set({ state: "none" })
    }),
    floorSocket.on("chat:inbox", () => {
      refreshInbox()
      const id = chat.viewing.get()
      if (id !== null) void loadThread(id)
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
          `💬 ${peer?.peerName ?? (mine === "saco" ? "Khách" : "SACO")}: ${message.text.slice(0, 80)}`,
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
    floorSocket.on("chat:typing", ({ convId, side }) => {
      if (sideOf(convId) === side) return
      chat.typing.update((t) => ({ ...t, [convId]: Date.now() + 2500 }))
    }),
    floorSocket.on("chat:match", ({ event }) => {
      if (event.state === "matched") {
        chat.match.set(null)
        refreshInbox(0)
        openPanel("chat", { side: "user", convId: event.convId })
      } else if (event.state === "cancelled") {
        chat.match.set(null)
      } else {
        chat.match.set(event)
      }
    }),
    floorSocket.on("chat:invite", ({ invite }) => chat.invite.set(invite)),
    floorSocket.on("chat:invite:end", ({ id }) => {
      if (chat.invite.get()?.id === id) chat.invite.set(null)
    }),
  ]
  return () => {
    for (const fn of off) fn()
    if (inboxTimer) clearTimeout(inboxTimer)
    inboxTimer = null
    acceptedAt = 0
    for (const store of Object.values(chat)) (store as Store<unknown>).reset()
  }
}
