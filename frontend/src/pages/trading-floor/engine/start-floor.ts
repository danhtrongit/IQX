/**
 * Starts the 3D Procedural Chibi Trading Floor inside `container`:
 * publishes Chibi portraits into `ui.avatarImages`, starts market polling, chat, leaderboard,
 * socket, waits for "Be Vietnam Pro" font, boots Three.js `ChibiSceneHost` + `FloorController`,
 * and returns a clean teardown function that survives React StrictMode double-mount.
 */
import { buildAllChibiPortraits } from "@/lib/chibi-3d/portrait-renderer.ts"
import {
  createChibiSceneHost,
  type ChibiSceneHost,
} from "@/lib/chibi-3d/scene-host.ts"

import type { RoomDoorHandle } from "@/pages/spaces/door-transition.ts"

import { toast, ui } from "../bridge.ts"
import { startChat } from "../net/chat.ts"
import { startLeaderboard } from "../net/leaderboard.ts"
import { startMarket } from "../net/market.ts"
import { floorSocket } from "../net/socket.ts"
import { FloorController } from "./floor-controller.ts"
import { FLOOR_WORLD_CONFIG } from "./floor-world-3d.ts"

export interface StartFloorOptions {
  onError?: (error: unknown) => void
  onReady?: () => void
  arrivedViaDoor?: boolean
  onDoorHintChange?: (near: boolean) => void
  onDoorRequest?: () => void
  onControllerReady?: (handle: RoomDoorHandle | null) => void
}

function disposeHostSafely(host: ChibiSceneHost): void {
  const renderer = host.renderer
  host.dispose()
  try {
    const gl =
      typeof renderer.getContext === "function" ? renderer.getContext() : null
    if (!gl || !gl.isContextLost?.()) {
      renderer.forceContextLoss()
    }
  } catch {
    // Headless or mocked WebGL contexts may not expose WEBGL_lose_context.
  }
}

/** Canvas2D textures (LED wall, SACO board, signs) wait briefly for Be Vietnam Pro. */
async function fontsReady(): Promise<void> {
  if (
    typeof document === "undefined" ||
    !("fonts" in document) ||
    typeof document.fonts?.load !== "function"
  ) {
    return
  }
  await Promise.race([
    Promise.all(
      ["600 13px", "700 16px", "800 24px"].map((w) =>
        document.fonts.load(`${w} "Be Vietnam Pro"`).catch(() => undefined)
      )
    ),
    new Promise<void>((resolve) => setTimeout(resolve, 2500)),
  ])
}

export function startFloor(
  container: HTMLElement,
  onErrorOrOptions?: ((error: unknown) => void) | StartFloorOptions
): () => void {
  const options: StartFloorOptions =
    typeof onErrorOrOptions === "function"
      ? { onError: onErrorOrOptions }
      : (onErrorOrOptions ?? {})

  let disposed = false
  let host: ChibiSceneHost | null = null
  let controller: FloorController | null = null

  // Ensure crisp Chibi portraits are immediately available for JoinScreen & LeaderboardPanel.
  if (Object.keys(ui.avatarImages.get()).length === 0) {
    ui.avatarImages.set(buildAllChibiPortraits())
  }

  const stopMarket = startMarket()
  const stopChat = startChat()
  const stopLeaderboard = startLeaderboard()
  floorSocket.start()

  void (async () => {
    await fontsReady()
    if (disposed) return

    host = createChibiSceneHost({
      container,
      world: FLOOR_WORLD_CONFIG,
      backgroundHex: 0x0c111b,
      fov: 36,
      pitchDeg: 48,
      baseDistance: 21.6,
      minZoom: 0.72,
      maxZoom: 2.3,
      initialZoom: 0.94,
      cameraLerp: 0.14,
      boundsMargin: 0.6,
      northMargin: 4.7,
      southMargin: 0.9,
      onResize: () => {
        controller?.handleResize()
      },
      onContextLost: () => {
        if (!disposed) {
          toast("Đồ họa 3D tạm gián đoạn, đang khôi phục…", "warn")
        }
      },
      onContextRestored: () => {
        if (!disposed) {
          controller?.handleContextRestored()
          toast("Đã khôi phục đồ họa 3D", "good", 2600)
        }
      },
    })

    if (disposed) {
      disposeHostSafely(host)
      host = null
      return
    }

    controller = new FloorController(host, container, {
      arrivedViaDoor: options.arrivedViaDoor,
      onDoorHintChange: options.onDoorHintChange,
      onDoorRequest: options.onDoorRequest,
    })
    options.onControllerReady?.({
      beginDoorExit: (onFadeStart) => {
        if (controller) {
          controller.beginDoorExit(onFadeStart)
        } else {
          onFadeStart()
        }
      },
    })
    ui.ready.set(true)
    options.onReady?.()

    if (import.meta.env.DEV) {
      Object.assign(window, { __tradingFloor: { host, controller } })
    }
  })().catch((error: unknown) => {
    if (!disposed) options.onError?.(error)
  })

  return () => {
    disposed = true
    options.onControllerReady?.(null)
    controller?.dispose()
    controller = null
    if (host) {
      disposeHostSafely(host)
      host = null
    }
    stopChat()
    stopLeaderboard()
    stopMarket()
    floorSocket.stop()
    if (import.meta.env.DEV) {
      Reflect.deleteProperty(window, "__tradingFloor")
    }
  }
}
