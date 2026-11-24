/**
 * Starts the 3D Procedural Chibi Trading Floor inside `container`:
 * publishes Chibi portraits into `ui.avatarImages`, starts market polling, chat, leaderboard,
 * socket, waits for "Be Vietnam Pro" font, boots Three.js `ChibiSceneHost` + `FloorController`,
 * and returns a clean teardown function that survives React StrictMode double-mount.
 *
 * Boot runs behind the loading screen without long main-thread stalls: the scene is built in ~10 ms
 * slices, every shader program is compiled in parallel and textures are uploaded before the visible
 * render loop starts (`host.prepare()`), and `onReady` fires only after the first real frame.
 * `onProgress(progress, stage)` reports 0..1 with Vietnamese stage labels for the loading screen.
 */
import { yieldToMain } from "@/lib/chibi-3d/chunked-build.ts"
import { buildAllChibiPortraits } from "@/lib/chibi-3d/portrait-renderer.ts"
import {
  createChibiSceneHost,
  type ChibiSceneHost,
} from "@/lib/chibi-3d/scene-host.ts"

import type { RoomDoorHandle } from "@/pages/spaces/door-transition.ts"
import {
  BOOT_RANGES,
  BOOT_STAGES,
  createBootReporter,
  phaseProgress,
  type BootProgressFn,
} from "@/pages/spaces/loading/boot-progress.ts"

import { toast, ui } from "../bridge.ts"
import { startChat } from "../net/chat.ts"
import { startLeaderboard } from "../net/leaderboard.ts"
import { startMarket } from "../net/market.ts"
import { floorSocket } from "../net/socket.ts"
import { FloorController } from "./floor-controller.ts"
import { FLOOR_WORLD_CONFIG, FloorWorld3D } from "./floor-world-3d.ts"
import { OverlayLayer } from "./overlay-layer.ts"

export interface StartFloorOptions {
  onError?: (error: unknown) => void
  /** Fires once the scene is built, warmed up and its first visible frame has rendered. */
  onReady?: () => void
  /** Boot progress 0..1 with a Vietnamese stage label (for the loading screen). */
  onProgress?: BootProgressFn
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
  // Built before the controller exists; owned by the controller once it is constructed.
  let pendingOverlay: OverlayLayer | null = null
  let pendingWorld: FloorWorld3D | null = null
  const progress = createBootReporter(options.onProgress)
  const isDisposed = (): boolean => disposed

  // Ensure crisp Chibi portraits are immediately available for JoinScreen & LeaderboardPanel.
  if (Object.keys(ui.avatarImages.get()).length === 0) {
    ui.avatarImages.set(buildAllChibiPortraits())
  }

  const stopMarket = startMarket()
  const stopChat = startChat()
  const stopLeaderboard = startLeaderboard()
  floorSocket.start()

  void (async () => {
    progress.report(BOOT_RANGES.fonts[0], BOOT_STAGES.fonts)
    await fontsReady()
    if (disposed) return

    progress.report(BOOT_RANGES.gpu[0], BOOT_STAGES.gpu)
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
      holdUntilPrepared: true,
      // One shadow frustum over the whole hall: following the camera re-baked it every frame.
      shadowFrustum: "room",
      shadowCasterHeight: 5.5,
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

    // Time-sliced scene build (architecture, furniture, shrine, statues) behind the loading screen.
    progress.report(BOOT_RANGES.build[0], BOOT_STAGES.floorBuild)
    pendingOverlay = new OverlayLayer(container)
    pendingWorld = new FloorWorld3D(host.scene, pendingOverlay, {
      lite: host.lite,
      deferBuild: true,
    })
    const built = await pendingWorld.buildAsync({
      onProgress: (f) =>
        progress.report(phaseProgress(BOOT_RANGES.build, f), BOOT_STAGES.floorBuild),
      isCancelled: isDisposed,
    })
    if (disposed || !built) return

    progress.report(BOOT_RANGES.actors[0], BOOT_STAGES.floorActors)
    await yieldToMain()
    if (disposed) return

    controller = new FloorController(host, container, {
      arrivedViaDoor: options.arrivedViaDoor,
      onDoorHintChange: options.onDoorHintChange,
      onDoorRequest: options.onDoorRequest,
      prebuilt: { overlay: pendingOverlay, world3d: pendingWorld },
    })
    pendingOverlay = null
    pendingWorld = null
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

    if (import.meta.env.DEV) {
      Object.assign(window, { __tradingFloor: { host, controller } })
    }

    // Parallel shader compile + texture upload + hidden shadow frame, then the visible loop starts.
    progress.report(BOOT_RANGES.lights[0], BOOT_STAGES.lights)
    await host.prepare({
      onProgress: progress.reportPrepare,
      isCancelled: isDisposed,
    })
    if (disposed) return
    await host.waitForFirstFrame()
    if (disposed) return
    progress.report(BOOT_RANGES.images[1], BOOT_STAGES.images)
    options.onReady?.()
  })().catch((error: unknown) => {
    if (!disposed) options.onError?.(error)
  })

  return () => {
    disposed = true
    options.onControllerReady?.(null)
    controller?.dispose()
    controller = null
    pendingWorld?.dispose()
    pendingWorld = null
    pendingOverlay?.dispose()
    pendingOverlay = null
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
