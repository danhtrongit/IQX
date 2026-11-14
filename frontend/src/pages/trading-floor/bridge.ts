/**
 * The only link between the Phaser world and the HTML screens.
 * The game writes what the player is near and asks for panels; the UI writes profile, market
 * and ritual data and sends commands back. Neither side imports the other.
 *
 * Every store here is a module singleton: `resetBridge()` returns them to their initial value
 * when the floor unmounts, so navigating away and back starts clean.
 */
import type { IndexQuote, Quote } from "./net/market/types.ts"
import {
  normalizeAvatarId,
  type LeaderRow,
  type PostCard,
  type Profile,
  type RitualStats,
} from "./net/types.ts"

export class Store<T> {
  private value: T
  private readonly initial: T
  private readonly listeners = new Set<(value: T) => void>()

  constructor(value: T) {
    this.value = value
    this.initial = value
  }

  readonly get = (): T => this.value

  set(value: T): void {
    if (Object.is(value, this.value)) return
    this.value = value
    for (const fn of [...this.listeners]) fn(value)
  }

  update(fn: (value: T) => T): void {
    this.set(fn(this.value))
  }

  readonly subscribe = (fn: (value: T) => void): (() => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  reset(): void {
    this.set(this.initial)
  }
}

type Handler<A> = (arg: A) => void
export class Emitter<Events extends Record<string, unknown>> {
  private readonly handlers = new Map<keyof Events, Set<Handler<never>>>()

  on<K extends keyof Events>(type: K, fn: Handler<Events[K]>): () => void {
    let set = this.handlers.get(type)
    if (!set) this.handlers.set(type, (set = new Set()))
    set.add(fn as Handler<never>)
    return () => {
      set.delete(fn as Handler<never>)
    }
  }

  emit<K extends keyof Events>(type: K, arg: Events[K]): void {
    for (const fn of [...(this.handlers.get(type) ?? [])])
      (fn as Handler<Events[K]>)(arg)
  }
}

/** Screens that open as a sheet. */
export type PanelKind =
  "thantai" | "leaderboard" | "market" | "reception" | "chat"
/** Everything the player can walk up to: a sheet, or the SACO nhận định slide-over. */
export type InteractKind = PanelKind | "posts"

export interface Panel {
  kind: PanelKind
  /** Extra data, such as the conversation a chat sheet opens on. */
  data?: Record<string, unknown>
}

export interface Hint {
  kind: InteractKind
  label: string
  data?: Record<string, unknown>
}

export interface Toast {
  id: number
  text: string
  tone: "info" | "good" | "warn" | "gold"
}

/** One line of the floor chat history (kept in memory only; gone when the floor is left). */
export interface ChatLine {
  id: number
  name: string
  text: string
  self: boolean
  /** Epoch ms. */
  at: number
}

/** Lines kept in the floor chat history. */
export const CHAT_HISTORY_MAX = 100

export interface PostsState {
  open: boolean
  postId: string | null
}

export const ui = {
  profile: new Store<Profile | null>(null),
  panel: new Store<Panel | null>(null),
  /** The SACO nhận định slide-over (rendered by the posts layer). */
  posts: new Store<PostsState>({ open: false, postId: null }),
  /** The interactable the player stands next to. */
  hint: new Store<Hint | null>(null),
  online: new Store<number>(0),
  connection: new Store<"connecting" | "online" | "offline">("connecting"),
  toasts: new Store<Toast[]>([]),
  /** The game finished loading its art. */
  ready: new Store<boolean>(false),
  /** Front-view picture of each character that has its own art, for the HTML screens. */
  avatarImages: new Store<Record<string, string>>({}),
  /** Cloth mask + median luminance per character, for the join screen's live recoloring. */
  avatarMasks: new Store<Record<string, { mask: string; luma: number }>>({}),
  /** What was said on the floor since it was opened, oldest first (not stored anywhere). */
  chatLog: new Store<ChatLine[]>([]),
  /** Place in line while the hall is full (1 = next), null when on the floor. */
  queue: new Store<{ position: number; capacity: number } | null>(null),
}

let chatLineId = 0
/** Appends a line to the floor chat history, keeping the last CHAT_HISTORY_MAX. */
export function logChat(name: string, text: string, self: boolean): void {
  chatLineId += 1
  const line: ChatLine = { id: chatLineId, name, text, self, at: Date.now() }
  ui.chatLog.update((lines) => [...lines, line].slice(-CHAT_HISTORY_MAX))
}

/** A text field has the keyboard (the chat composer, the join card, the auth dialog...). */
export function typing(): boolean {
  const el = document.activeElement as HTMLElement | null
  return (
    !!el &&
    (el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      el.tagName === "SELECT" ||
      el.isContentEditable)
  )
}

const APP_DIALOG =
  '[role="dialog"]:not(.tf-root [role="dialog"]), [role="alertdialog"]:not(.tf-root [role="alertdialog"]), [data-slot="dialog-content"]'
let dialogCheckedAt = -Infinity
let dialogOpen = false

/** A dialog of the IQX app (sign-in, confirmations) is open over the floor: it owns the keyboard. Checked at most every 150 ms. */
export function appDialogOpen(): boolean {
  const now = performance.now()
  if (now - dialogCheckedAt > 150) {
    dialogCheckedAt = now
    dialogOpen = document.querySelector(APP_DIALOG) !== null
  }
  return dialogOpen
}

/** Picture for any avatar id: art without its own picture shows the first character, as the office does. */
export function avatarImage(
  images: Record<string, string>,
  id: string
): string | undefined {
  const norm = normalizeAvatarId(id) ?? id
  return images[norm] ?? images[id] ?? Object.values(images)[0]
}

/** Data shown inside the world (LED wall, statues, shrine counter, wall board). */
export const world = {
  indices: new Store<IndexQuote[] | null>(null),
  /** VN30 quotes in basket order, for the LED heatmap and the market panel. */
  vn30: new Store<Quote[] | null>(null),
  leaders: new Store<LeaderRow[]>([]),
  ritual: new Store<RitualStats | null>(null),
  /** Today's SACO nhận định, newest first. Written by the posts layer, read by the wall board. */
  posts: new Store<PostCard[]>([]),
}

export const commands = new Emitter<{
  /** UI → game: show a speech bubble over the player and send it to everyone. */
  emote: string
  /** UI → game: the shrine celebrates a finished ritual. `luck` 1–5. */
  celebrate: { luck: number; name: string; self: boolean }
  /** UI → game: the player walks to an interactable and opens it. */
  goTo: InteractKind
}>()

const toastTimers = new Set<ReturnType<typeof setTimeout>>()
let toastId = 0
export function toast(
  text: string,
  tone: Toast["tone"] = "info",
  ms = 4200
): void {
  const id = ++toastId
  ui.toasts.update((list) => [...list.slice(-3), { id, text, tone }])
  const timer = setTimeout(() => {
    toastTimers.delete(timer)
    ui.toasts.update((list) => list.filter((t) => t.id !== id))
  }, ms)
  toastTimers.add(timer)
}

export function openPanel(
  kind: PanelKind,
  data?: Record<string, unknown>
): void {
  ui.panel.set({ kind, data })
}

export function openPosts(postId?: string): void {
  ui.posts.set({ open: true, postId: postId ?? null })
}

export function closePosts(): void {
  ui.posts.set({ open: false, postId: null })
}

/** Opens what the player is standing at: a sheet, or the posts slide-over. */
export function openInteract(
  kind: InteractKind,
  data?: Record<string, unknown>
): void {
  if (kind === "posts") openPosts()
  else openPanel(kind, data)
}

/** Back to the state before the floor mounted. */
export function resetBridge(): void {
  for (const timer of toastTimers) clearTimeout(timer)
  toastTimers.clear()
  for (const store of Object.values(ui)) (store as Store<unknown>).reset()
  for (const store of Object.values(world)) (store as Store<unknown>).reset()
}
