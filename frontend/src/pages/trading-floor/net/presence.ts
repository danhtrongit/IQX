/** Real-time presence: who is in the office, where they walk and emotes. */
import { Emitter, Store, toast, ui } from "../bridge.ts"
import { floorSocket, type FloorSocketStatus } from "./socket.ts"
import type { Peer, PeerState } from "./types.ts"

export const presence = new Emitter<{
  welcome: { self: Peer; peers: Peer[] }
  join: Peer
  /** A peer (or this account on another tab) changed name, avatar or outfit. */
  update: Peer
  state: { id: string } & PeerState
  leave: { id: string }
  emote: { id: string; text: string }
  /** Fires on every (re)connect once the server has said `ready`. */
  online: null
}>()

/** The server drops a second emote within 1.5 s; the page spaces them out instead of losing them. */
const EMOTE_GAP_MS = 1600
const EMOTE_QUEUE_MAX = 5

let selfId: string | null = null
const peers = new Set<string>()

export function isSelf(id: string): boolean {
  return id === selfId
}

/** A SACO standing on the floor. */
export interface FloorSaco {
  sacoId: string
  name: string
}

/** SACOs on the floor right now, one entry per SACO in arrival order, never this account's own. */
export const floorSacos = new Store<FloorSaco[]>([])
/** Connection id → the SACO behind that figure. */
const sacoPeers = new Map<string, FloorSaco>()
let selfSacoId: string | null = null

/** This account holds that SACO right: nobody opens a chat with themself. */
export function isOwnSaco(sacoId: string): boolean {
  return sacoId === selfSacoId
}

function syncSacos(): void {
  const seen = new Set<string>()
  const list: FloorSaco[] = []
  for (const s of sacoPeers.values()) {
    if (s.sacoId === selfSacoId || seen.has(s.sacoId)) continue
    seen.add(s.sacoId)
    list.push(s)
  }
  const prev = floorSacos.get()
  const same =
    prev.length === list.length &&
    prev.every((p, i) => p.sacoId === list[i].sacoId && p.name === list[i].name)
  if (!same) floorSacos.set(list)
}

function trackSaco(p: Peer): void {
  if (p.id === selfId) selfSacoId = p.sacoId ?? null
  else if (p.sacoId) sacoPeers.set(p.id, { sacoId: p.sacoId, name: p.name })
  else sacoPeers.delete(p.id)
  syncSacos()
}

function forgetSacos(): void {
  sacoPeers.clear()
  selfSacoId = null
  syncSacos()
}

export let sendState: (state: PeerState) => void = () => undefined
export let sendEmote: (text: string) => void = () => undefined
export let sendTyping: (convId: string) => void = () => undefined

/**
 * Wires the socket to the presence events and the HUD stores. `start` is where the player stands
 * when the floor opens; after every reconnect `hello` carries the last reported state.
 * Returns the function that undoes everything.
 */
export function startPresence(start: PeerState): () => void {
  let last = start
  const off: (() => void)[] = []
  peers.clear()
  selfId = null
  forgetSacos()

  const countOnline = (): void => ui.online.set(peers.size + (selfId ? 1 : 0))
  const forgetPeers = (): void => {
    // Remote avatars vanish while offline; the server sends everyone again on reconnect.
    for (const id of peers) presence.emit("leave", { id })
    peers.clear()
    selfId = null
    forgetSacos()
    countOnline()
  }

  let wasOnline = false
  const onStatus = (status: FloorSocketStatus): void => {
    ui.connection.set(
      status === "online"
        ? "online"
        : status === "reconnecting" || status === "closed"
          ? "offline"
          : "connecting"
    )
    if (status === "online") wasOnline = true
    else if (status === "reconnecting" && wasOnline) {
      wasOnline = false
      toast("Mất kết nối máy chủ, đang thử lại…", "warn")
    }
    if (status !== "online" && status !== "authenticating") {
      forgetPeers()
      ui.queue.set(null)
    }
  }
  onStatus(floorSocket.status.get())

  off.push(
    floorSocket.status.subscribe(onStatus),
    floorSocket.on("ready", () => {
      floorSocket.send({ type: "hello", ...last })
    }),
    floorSocket.on("queue", (m) =>
      ui.queue.set({ position: m.position, capacity: m.capacity })
    ),
    floorSocket.on("welcome", (m) => {
      const queued = ui.queue.get() !== null
      ui.queue.set(null)
      // Walked about while waiting in line: the hall sees where we stand now.
      if (queued) floorSocket.send({ type: "state", ...last })
      selfId = m.self.id
      peers.clear()
      for (const p of m.peers) if (p.id !== selfId) peers.add(p.id)
      sacoPeers.clear()
      trackSaco(m.self)
      for (const p of m.peers) if (p.id !== selfId) trackSaco(p)
      presence.emit("welcome", {
        self: m.self,
        peers: m.peers.filter((p) => p.id !== selfId),
      })
      presence.emit("online", null)
      countOnline()
    }),
    floorSocket.on("peer:join", (m) => {
      if (m.peer.id === selfId) return
      peers.add(m.peer.id)
      trackSaco(m.peer)
      presence.emit("join", m.peer)
      countOnline()
    }),
    floorSocket.on("peer:update", (m) => {
      trackSaco(m.peer)
      presence.emit("update", m.peer)
    }),
    floorSocket.on("peer:state", (m) =>
      presence.emit("state", {
        id: m.id,
        x: m.x,
        y: m.y,
        facing: m.facing,
        moving: m.moving,
      })
    ),
    floorSocket.on("peer:leave", (m) => {
      peers.delete(m.id)
      if (sacoPeers.delete(m.id)) syncSacos()
      presence.emit("leave", { id: m.id })
      countOnline()
    }),
    floorSocket.on("peer:emote", (m) =>
      presence.emit("emote", { id: m.id, text: m.text })
    ),
    floorSocket.on("error", (m) => {
      // The account has no profile (never joined, or it was removed): back to the join card.
      if (m.code === "NO_PROFILE") ui.profile.set(null)
    })
  )

  sendState = (state) => {
    last = state
    // Nothing is queued while offline: `hello` repeats the last state after the reconnect.
    floorSocket.send({ type: "state", ...state })
  }
  const emoteQueue: string[] = []
  let emoteTimer: ReturnType<typeof setTimeout> | null = null
  let lastEmoteAt = 0
  const pumpEmotes = (): void => {
    if (emoteTimer || !emoteQueue.length) return
    const wait = lastEmoteAt + EMOTE_GAP_MS - Date.now()
    if (wait > 0) {
      emoteTimer = setTimeout(() => {
        emoteTimer = null
        pumpEmotes()
      }, wait)
      return
    }
    lastEmoteAt = Date.now()
    floorSocket.send({ type: "emote", text: emoteQueue.shift()! })
    pumpEmotes()
  }
  sendEmote = (text) => {
    emoteQueue.push(text)
    if (emoteQueue.length > EMOTE_QUEUE_MAX) emoteQueue.shift()
    pumpEmotes()
  }
  off.push(() => {
    if (emoteTimer) clearTimeout(emoteTimer)
    emoteQueue.length = 0
  })
  sendTyping = (convId) => {
    floorSocket.send({ type: "chat:typing", convId })
  }

  return () => {
    for (const fn of off) fn()
    sendState = () => undefined
    sendEmote = () => undefined
    sendTyping = () => undefined
    peers.clear()
    selfId = null
    forgetSacos()
    ui.queue.set(null)
  }
}
