/**
 * Short sound effects for the floor actions (`public/sounds/khu-giao-dich/*.mp3`, SPEC v2).
 * Audio elements are created on first use, so opening the floor downloads nothing. Muting is
 * remembered in localStorage `iqx.floor.sound` ("off" = muted).
 */
import { Store } from "../bridge.ts"

export type FxSoundKey =
  "xaxui" | "rooster" | "firework" | "coins" | "coin" | "bell"

const STORAGE_KEY = "iqx.floor.sound"
const BASE_VOLUME = 0.7
const POOL_SIZE = 2

function readSetting(): boolean {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) !== "off"
  } catch {
    return true
  }
}

/** True while sound is on. */
export const fxSoundOn = new Store<boolean>(readSetting())

export function setFxSound(on: boolean): void {
  fxSoundOn.set(on)
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, on ? "on" : "off")
  } catch {
    // Private mode or blocked storage: the choice lasts for this page only.
  }
}

const pools = new Map<FxSoundKey, HTMLAudioElement[]>()

function audioFor(key: FxSoundKey): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null
  let pool = pools.get(key)
  if (!pool) {
    const first = new Audio(`/sounds/khu-giao-dich/${key}.mp3`)
    first.preload = "auto"
    pool = [first]
    pools.set(key, pool)
  }
  const idle = pool.find((a) => a.paused || a.ended)
  if (idle) return idle
  if (pool.length < POOL_SIZE) {
    const extra = pool[0]!.cloneNode() as HTMLAudioElement
    pool.push(extra)
    return extra
  }
  return pool[0]!
}

/** Plays a clip; `volume` 0..1 scales the base volume. Autoplay refusals are ignored. */
export function playFx(key: FxSoundKey, volume = 1): void {
  if (!fxSoundOn.get()) return
  const audio = audioFor(key)
  if (!audio) return
  audio.volume = Math.max(0, Math.min(1, BASE_VOLUME * volume))
  audio.currentTime = 0
  const result = audio.play() as Promise<void> | undefined
  if (result && typeof result.catch === "function") {
    void result.catch(() => undefined)
  }
}

/** Quieter the farther another player stands from ours (never below a quarter). */
export function distanceVolume(dx: number, dy: number): number {
  return Math.min(1, Math.max(0.25, 1 - Math.hypot(dx, dy) / 1400))
}
