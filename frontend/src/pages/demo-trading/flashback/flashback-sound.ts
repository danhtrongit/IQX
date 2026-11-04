/**
 * Âm thanh của Flashback: giọng đọc (sinh sẵn bằng VieNeu-TTS v3 Turbo, giọng "Adam bựa", lời kiểu MC có cảm xúc, nhanh 8%, nằm ở
 * `public/sounds/flashback/*.mp3`) và hiệu ứng ngắn tạo bằng Web Audio (tick, mua, bán, chốt lời, cắt
 * lỗ, nhạc chúc mừng) nên không cần thêm tệp.
 *
 * Người chơi tắt/bật tiếng bằng nút loa; lựa chọn nhớ trong trình duyệt. Trình duyệt chỉ cho phát
 * tiếng sau khi người dùng đã bấm vào trang; trước đó mọi lần phát đều lặng lẽ bỏ qua.
 */
import { useSyncExternalStore } from "react"

export type VoiceKey =
  | "left-5m"
  | "left-4m"
  | "left-3m"
  | "left-2m"
  | "left-1m"
  | "left-30s"
  | "count-5"
  | "count-4"
  | "count-3"
  | "count-2"
  | "count-1"
  | "time-up"
  | "start"
  | "win"
  | "finish"
  | "buy"
  | "sell"
  | "take-profit"
  | "cut-loss"

export type EffectKey = "tick" | "buy" | "sell" | "profit" | "loss" | "celebrate"

const STORAGE_KEY = "iqx.flashback.sound"
const VOICE_BASE = "/sounds/flashback/"
const VOICE_VOLUME = 0.9
const EFFECT_VOLUME = 0.22

// ------------------------------------------------------------------ bật / tắt tiếng

const listeners = new Set<() => void>()
let enabledCache: boolean | null = null

function readEnabled(): boolean {
  if (enabledCache !== null) return enabledCache
  try {
    enabledCache = globalThis.localStorage?.getItem(STORAGE_KEY) !== "off"
  } catch {
    enabledCache = true
  }
  return enabledCache
}

export function soundEnabled(): boolean {
  return readEnabled()
}

export function setSoundEnabled(enabled: boolean): void {
  enabledCache = enabled
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, enabled ? "on" : "off")
  } catch {
    // Trình duyệt chặn lưu trữ: vẫn đổi trong phiên này.
  }
  if (!enabled) stopVoice()
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Trạng thái bật tiếng cho giao diện (nút loa). */
export function useSoundEnabled(): [boolean, (enabled: boolean) => void] {
  const enabled = useSyncExternalStore(subscribe, readEnabled, () => true)
  return [enabled, setSoundEnabled]
}

// ------------------------------------------------------------------ giọng đọc

const voices = new Map<VoiceKey, HTMLAudioElement>()
let speaking: HTMLAudioElement | null = null

function voiceElement(key: VoiceKey): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null
  let element = voices.get(key)
  if (!element) {
    element = new Audio(`${VOICE_BASE}${key}.mp3`)
    element.preload = "auto"
    element.volume = VOICE_VOLUME
    voices.set(key, element)
  }
  return element
}

function stopVoice(): void {
  if (!speaking) return
  speaking.pause()
  speaking = null
}

/** Đọc một câu; câu mới cắt câu đang đọc để đếm ngược không bị trễ. */
export function playVoice(key: VoiceKey): void {
  if (!readEnabled()) return
  const element = voiceElement(key)
  if (!element) return
  stopVoice()
  speaking = element
  try {
    element.currentTime = 0
    const played = element.play()
    if (played && typeof played.catch === "function") played.catch(() => undefined)
  } catch {
    // Chưa được phép phát (người dùng chưa bấm vào trang) hoặc môi trường không có âm thanh.
  }
}

/** Tải trước các câu sẽ dùng trong ván để lần đọc đầu không bị trễ. */
export function preloadVoices(keys: readonly VoiceKey[]): void {
  if (!readEnabled()) return
  keys.forEach((key) => voiceElement(key))
}

// ------------------------------------------------------------------ hiệu ứng

let context: AudioContext | null = null

function audioContext(): AudioContext | null {
  if (context) return context
  const Constructor =
    globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Constructor) return null
  try {
    context = new Constructor()
  } catch {
    return null
  }
  return context
}

type Note = { frequency: number; at: number; duration: number; type?: OscillatorType; gain?: number; slideTo?: number }

function playNotes(notes: readonly Note[]): void {
  const ctx = audioContext()
  if (!ctx) return
  if (ctx.state === "suspended") void ctx.resume().catch(() => undefined)
  const start = ctx.currentTime + 0.01
  for (const note of notes) {
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    const t0 = start + note.at
    const t1 = t0 + note.duration
    const peak = EFFECT_VOLUME * (note.gain ?? 1)
    oscillator.type = note.type ?? "sine"
    oscillator.frequency.setValueAtTime(note.frequency, t0)
    if (note.slideTo) oscillator.frequency.exponentialRampToValueAtTime(note.slideTo, t1)
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.012, note.duration / 4))
    gain.gain.exponentialRampToValueAtTime(0.0001, t1)
    oscillator.connect(gain).connect(ctx.destination)
    oscillator.start(t0)
    oscillator.stop(t1 + 0.02)
  }
}

// Nốt: C5 523 · E5 659 · G5 784 · C6 1047 · E6 1319 · G6 1568.
const EFFECTS: Record<EffectKey, readonly Note[]> = {
  tick: [{ frequency: 1500, at: 0, duration: 0.045, type: "square", gain: 0.35 }],
  buy: [
    { frequency: 659, at: 0, duration: 0.09, type: "triangle" },
    { frequency: 988, at: 0.08, duration: 0.14, type: "triangle" },
  ],
  sell: [
    { frequency: 988, at: 0, duration: 0.09, type: "triangle" },
    { frequency: 659, at: 0.08, duration: 0.14, type: "triangle" },
  ],
  profit: [
    { frequency: 1047, at: 0, duration: 0.12 },
    { frequency: 1319, at: 0.07, duration: 0.12 },
    { frequency: 1568, at: 0.14, duration: 0.24 },
    { frequency: 2093, at: 0.14, duration: 0.24, gain: 0.35 },
  ],
  loss: [{ frequency: 330, at: 0, duration: 0.42, type: "sawtooth", gain: 0.45, slideTo: 150 }],
  celebrate: [
    { frequency: 523, at: 0, duration: 0.16, type: "triangle" },
    { frequency: 659, at: 0.13, duration: 0.16, type: "triangle" },
    { frequency: 784, at: 0.26, duration: 0.16, type: "triangle" },
    { frequency: 1047, at: 0.39, duration: 0.5, type: "triangle" },
    { frequency: 1319, at: 0.39, duration: 0.5, gain: 0.5 },
    { frequency: 1568, at: 0.39, duration: 0.5, gain: 0.35 },
  ],
}

export function playEffect(key: EffectKey): void {
  if (!readEnabled()) return
  try {
    playNotes(EFFECTS[key])
  } catch {
    // Không có Web Audio: bỏ qua.
  }
}

// ------------------------------------------------------------------ đồng hồ

const MINUTE_MARKS: readonly [number, VoiceKey][] = [
  [5 * 60, "left-5m"],
  [4 * 60, "left-4m"],
  [3 * 60, "left-3m"],
  [2 * 60, "left-2m"],
  [60, "left-1m"],
  [30, "left-30s"],
]
const COUNTDOWN: Record<number, VoiceKey> = { 5: "count-5", 4: "count-4", 3: "count-3", 2: "count-2", 1: "count-1" }
/** Mười giây cuối kêu tick mỗi giây; năm giây cuối đọc số thay cho tick. */
const TICK_FROM = 10

export type ClockCue = { voice?: VoiceKey; effect?: EffectKey }

/**
 * Âm báo khi đồng hồ đi từ `previousSeconds` xuống `seconds` (số giây còn lại, làm tròn lên như mặt
 * đồng hồ). Chỉ báo khi vừa CHẠM mốc, nên mở lại trang giữa chừng không đọc bù các mốc đã qua; nhảy qua
 * nhiều mốc một lúc (máy ngủ, tab ẩn) thì chỉ báo mốc gần nhất.
 */
export function clockCue(previousSeconds: number | null, seconds: number): ClockCue | null {
  if (previousSeconds === null || seconds >= previousSeconds) return null
  if (seconds <= 0) return previousSeconds <= TICK_FROM + 1 ? { voice: "time-up" } : null
  if (COUNTDOWN[seconds]) return previousSeconds - seconds <= 2 ? { voice: COUNTDOWN[seconds] } : null
  for (const [mark, voice] of MINUTE_MARKS) {
    if (previousSeconds > mark && seconds <= mark && seconds > mark - 3) return { voice }
  }
  if (seconds <= TICK_FROM && previousSeconds - seconds <= 2) return { effect: "tick" }
  return null
}

export function playCue(cue: ClockCue | null): void {
  if (!cue) return
  if (cue.voice) playVoice(cue.voice)
  if (cue.effect) playEffect(cue.effect)
}

export const MATCH_VOICES: readonly VoiceKey[] = [
  "left-5m",
  "left-4m",
  "left-3m",
  "left-2m",
  "left-1m",
  "left-30s",
  "count-5",
  "count-4",
  "count-3",
  "count-2",
  "count-1",
  "time-up",
  "buy",
  "sell",
  "take-profit",
  "cut-loss",
  "win",
  "finish",
]

// ------------------------------------------------------------------ lệnh

/**
 * Một lệnh bán là chốt lời hay cắt lỗ: tiền thu về (sau phí, thuế) so với giá vốn bình quân của số cổ
 * phiếu đang giữ trước lệnh.
 */
export function sellOutcome(
  positionsBefore: readonly { qty: number; price: string | number }[],
  order: { qty: number; amount: string | number; fee: string | number; tax: string | number },
): "profit" | "loss" | "flat" {
  const held = positionsBefore.reduce((sum, position) => sum + position.qty, 0)
  if (held <= 0 || order.qty <= 0) return "flat"
  const cost = positionsBefore.reduce((sum, position) => sum + position.qty * Number(position.price), 0) / held
  const proceeds = Number(order.amount) - Number(order.fee) - Number(order.tax)
  const basis = cost * order.qty
  if (!Number.isFinite(proceeds) || !Number.isFinite(basis)) return "flat"
  if (proceeds > basis) return "profit"
  if (proceeds < basis) return "loss"
  return "flat"
}

export function playOrderSound(side: "buy" | "sell", outcome: "profit" | "loss" | "flat"): void {
  if (side === "buy") {
    playEffect("buy")
    playVoice("buy")
    return
  }
  if (outcome === "profit") {
    playEffect("profit")
    playVoice("take-profit")
  } else if (outcome === "loss") {
    playEffect("loss")
    playVoice("cut-loss")
  } else {
    playEffect("sell")
    playVoice("sell")
  }
}
