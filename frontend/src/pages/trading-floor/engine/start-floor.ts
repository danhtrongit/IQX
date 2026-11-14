/**
 * Starts the whole floor inside `container`: market polling, ritual data, chat, the socket and the Phaser
 * game. Returns the function that tears all of it down (destroys the game, closes the socket, stops
 * every timer), so leaving the page and coming back, or React StrictMode's double mount, starts clean.
 *
 * `onError` is called once if the art or the game cannot start. This module is the only one that imports Phaser; the page loads it with a dynamic `import()` so the
 * game stays out of the main bundle.
 */
import * as Phaser from "phaser"

import { floorSocket } from "../net/socket.ts"
import { startChat } from "../net/chat.ts"
import { startData } from "../net/data.ts"
import { startMarket } from "../net/market.ts"
import { loadAvatarArt } from "./assets.ts"
import { OfficeScene } from "./OfficeScene.ts"

/** Phaser draws text once, so the web font must be ready first or labels stay in the fallback font. */
async function fontsReady(): Promise<void> {
  await Promise.race([
    Promise.all(
      ["600 13px", "700 16px", "800 24px"].map((w) =>
        document.fonts.load(`${w} "Be Vietnam Pro"`)
      )
    ),
    new Promise((resolve) => setTimeout(resolve, 2500)),
  ])
}

export function startFloor(
  container: HTMLElement,
  onError?: (error: unknown) => void
): () => void {
  let disposed = false
  let game: Phaser.Game | null = null
  let scene: OfficeScene | null = null
  let observer: ResizeObserver | null = null
  let onWindowResize: (() => void) | null = null

  const stopMarket = startMarket()
  const stopData = startData()
  const stopChat = startChat()
  floorSocket.start()

  const pixels = (css: number): number =>
    Math.round(css * window.devicePixelRatio)

  void (async () => {
    await fontsReady()
    const manifest = await loadAvatarArt()
    if (disposed) return
    const bounds = container.getBoundingClientRect()
    scene = new OfficeScene(manifest)
    game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: container,
      width: pixels(Math.max(1, bounds.width)),
      height: pixels(Math.max(1, bounds.height)),
      backgroundColor: "#0c111b",
      antialias: true,
      banner: false,
      // The floor has no sound, and Phaser must not grab focus from the HTML fields around it.
      audio: { noAudio: true },
      autoFocus: false,
      // Smoothing averages frame time, which makes walking speed depend on frame rate.
      fps: { smoothStep: false },
      // One canvas pixel per device pixel; the camera zoom carries the device pixel ratio.
      scale: { mode: Phaser.Scale.NONE, zoom: 1 / window.devicePixelRatio },
      scene: [scene],
    })
    // The canvas follows its container (the area under the IQX header), not the window.
    const resize = (): void => {
      if (!game) return
      const rect = container.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) return
      game.scale.resize(pixels(rect.width), pixels(rect.height))
      game.scale.setZoom(1 / window.devicePixelRatio)
    }
    observer = new ResizeObserver(resize)
    observer.observe(container)
    // Moving the window to a screen with another pixel ratio changes the zoom without resizing the container.
    onWindowResize = resize
    window.addEventListener("resize", resize)
    if (import.meta.env.DEV) Object.assign(window, { __tradingFloor: game })
  })().catch((error: unknown) => {
    // Art or WebGL failed to load: the page shows a retry card instead of an endless loading screen.
    if (!disposed) onError?.(error)
  })

  return () => {
    disposed = true
    observer?.disconnect()
    if (onWindowResize) window.removeEventListener("resize", onWindowResize)
    scene?.dispose()
    stopChat()
    stopData()
    stopMarket()
    floorSocket.stop()
    game?.destroy(true)
    game = null
    scene = null
    if (import.meta.env.DEV) Reflect.deleteProperty(window, "__tradingFloor")
  }
}
