import type { Lop } from "@/features/cap4/types"
import type { MascotId, MascotState } from "../types"

export const MASCOT_ASSET_VERSION = "2.0.1"
export const MASCOT_SLUG_BY_ID = {
  bach_ho: "bach-ho", thanh_long: "thanh-long", loc_huou: "loc-huou",
  phung_hoang: "phung-hoang", kim_quy: "kim-quy",
} as const
export const MASCOT_STATES: readonly MascotState[] = ["idle", "greet", "analyzing", "updated", "tap_reaction"]
const LAYER_BY_ID: Record<MascotId, Lop> = {
  bach_ho: "ky_thuat", thanh_long: "dong_tien", loc_huou: "noi_bo", phung_hoang: "tin_tuc", kim_quy: "dinh_gia",
}
export const MASCOT_PLACEHOLDER = "/assets/mascots-2d/v2/shared/fallback-placeholder.webp"
export interface MascotStateManifest {
  file: string
  frameCount: number
  columns: number
  rows: number
  durationsMs: number[]
  loop: boolean
  loopDelayMs?: number
  holdLastFrameMs?: number
  reducedMotionFrame?: number
  prefetchPriority: "critical" | "high" | "normal"
}
export interface Mascot2DManifest {
  schemaVersion: 2
  assetVersion: string
  mascotId: MascotId
  slug: string
  displayName: string
  dominantLayer: Lop
  canvas: { frameWidth: number; frameHeight: number; anchorX: number; anchorY: number; safePaddingPct: number }
  assets: { poster: string; revealSilhouette: string; avatarHead: string; avatarBody: string }
  states: Record<MascotState, MascotStateManifest>
  presentation: { preferredScaleDesktop: number; preferredScaleMobile: number; accentToken: string; stageEffectPreset: string }
}
export function mascotAssetRoot(id: MascotId) { return `/assets/mascots-2d/v2/${MASCOT_SLUG_BY_ID[id]}` }
export function mascotAssetUrl(id: MascotId, file: string, version = MASCOT_ASSET_VERSION) {
  if (!validAssetPath(file, id)) throw new Error("Invalid mascot asset path")
  return `${file.startsWith("/") ? file : `${mascotAssetRoot(id)}/${file}`}?v=${encodeURIComponent(version)}`
}
function validAssetPath(value: unknown, id: MascotId): value is string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_./-]+\.webp$/.test(value)) return false
  if (value.includes("..") || value.includes("//") || value.includes("\\")) return false
  return !value.startsWith("/") || value.startsWith(`${mascotAssetRoot(id)}/`)
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}
function number(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max
}
export function validateMascotManifest(value: unknown, id: MascotId): Mascot2DManifest {
  if (!object(value) || value.schemaVersion !== 2 || value.mascotId !== id || value.slug !== MASCOT_SLUG_BY_ID[id] ||
    value.dominantLayer !== LAYER_BY_ID[id] || typeof value.assetVersion !== "string" || !/^\d+\.\d+\.\d+$/.test(value.assetVersion) ||
    typeof value.displayName !== "string" || !value.displayName.trim()) throw new Error("Invalid mascot identity/version")
  const canvas = value.canvas
  if (!object(canvas) || canvas.frameWidth !== 640 || canvas.frameHeight !== 640 ||
    !number(canvas.anchorX, 0, 1) || !number(canvas.anchorY, 0, 1) || !number(canvas.safePaddingPct, 0, 25)) throw new Error("Invalid mascot canvas")
  const assets = value.assets
  if (!object(assets) || !["poster", "revealSilhouette", "avatarHead", "avatarBody"].every(key => validAssetPath(assets[key], id))) throw new Error("Invalid static assets")
  const states = value.states
  if (!object(states) || Object.keys(states).length !== 5 || !MASCOT_STATES.every(key => Object.hasOwn(states, key))) throw new Error("Invalid animation states")
  for (const key of MASCOT_STATES) {
    const state = states[key]
    if (!object(state) || !validAssetPath(state.file, id) || !Number.isInteger(state.frameCount) || !number(state.frameCount, 1, 60) ||
      !Number.isInteger(state.columns) || !number(state.columns, 1, 60) || !Number.isInteger(state.rows) || !number(state.rows, 1, 60) ||
      state.columns * state.rows < state.frameCount || !Array.isArray(state.durationsMs) || state.durationsMs.length !== state.frameCount ||
      !state.durationsMs.every(n => number(n, 1, 60_000)) || typeof state.loop !== "boolean" ||
      !["critical", "high", "normal"].includes(String(state.prefetchPriority)) ||
      (state.loopDelayMs !== undefined && !number(state.loopDelayMs, 0, 60_000)) ||
      (state.holdLastFrameMs !== undefined && !number(state.holdLastFrameMs, 0, 60_000)) ||
      (state.reducedMotionFrame !== undefined && (!Number.isInteger(state.reducedMotionFrame) || !number(state.reducedMotionFrame, 0, state.frameCount - 1)))) throw new Error(`Invalid animation: ${key}`)
    if (state.loop !== (key === "idle" || key === "analyzing")) throw new Error(`Invalid loop contract: ${key}`)
  }
  const presentation = value.presentation
  if (!object(presentation) || !number(presentation.preferredScaleDesktop, .5, 1.5) || !number(presentation.preferredScaleMobile, .5, 1.5) ||
    typeof presentation.accentToken !== "string" || typeof presentation.stageEffectPreset !== "string") throw new Error("Invalid presentation")
  return value as unknown as Mascot2DManifest
}
