/** Floor actions over the socket: Xả xui, Gáy, Tán lộc (backend/docs/trading-floor-fx/SPEC.md). */
import { Emitter, toast, ui } from "../bridge.ts"
import { floorSocket } from "./socket.ts"
import type { ClientMessage, Rain } from "./types.ts"

const walletChanged = (): void => ui.walletTick.update((n) => n + 1)

export const floorFx = new Emitter<{
  fx: { id: string; kind: "xaxui" | "gay"; name?: string; text?: string }
  rainStart: Rain
  rainTaken: { rainId: string; coin: number; by: string; name: string }
  rainEnd: { rainId: string }
  rainReset: null
}>()

export function startFx() {
  const unsub: (() => void)[] = []
  unsub.push(
    floorSocket.on("welcome", (m) => {
      // After the presence layer has handled the same welcome (it learns our own peer id there).
      const rains = m.rains ?? []
      queueMicrotask(() => {
        floorFx.emit("rainReset", null)
        for (const rain of rains) floorFx.emit("rainStart", rain)
      })
    })
  )
  unsub.push(
    floorSocket.on("peer:fx", (msg) => {
      floorFx.emit("fx", msg)
    })
  )
  unsub.push(
    floorSocket.on("rain:start", (msg) => {
      floorFx.emit("rainStart", msg.rain)
    })
  )
  unsub.push(
    floorSocket.on("rain:taken", (msg) => {
      floorFx.emit("rainTaken", msg)
    })
  )
  unsub.push(
    floorSocket.on("rain:end", (msg) => {
      floorFx.emit("rainEnd", { rainId: msg.rainId })
    })
  )
  unsub.push(
    floorSocket.on("rain:given", (msg) => {
      toast(`Đã tán lộc ${msg.amount} xu`, "gold")
      walletChanged()
    })
  )
  unsub.push(
    floorSocket.on("rain:caught", (msg) => {
      toast(`Nhặt được ${msg.value} xu`, "gold", 2200)
      walletChanged()
    })
  )
  unsub.push(
    floorSocket.on("rain:refund", (msg) => {
      toast(`Hoàn lại ${msg.amount} xu chưa ai nhặt`, "info")
      walletChanged()
    })
  )
  unsub.push(
    floorSocket.on("error", (msg) => {
      handleError(msg.code)
    })
  )
  return () => {
    for (const u of unsub) u()
  }
}

function handleError(code: string) {
  const codes = [
    "LOGIN_REQUIRED",
    "FX_COOLDOWN",
    "BAD_TEXT",
    "BAD_AMOUNT",
    "XU_INSUFFICIENT",
    "RAIN_BUSY",
    "RAIN_FULL",
    "NOT_ON_FLOOR",
  ]
  if (!codes.includes(code)) return
  const messages: Record<string, string> = {
    LOGIN_REQUIRED: "Đăng nhập để dùng tính năng này",
    FX_COOLDOWN: "Chờ một chút rồi thử lại",
    BAD_TEXT: "Nội dung không hợp lệ",
    BAD_AMOUNT: "Số lượng không hợp lệ",
    XU_INSUFFICIENT: "Không đủ xu",
    RAIN_BUSY: "Bạn đang có một cơn mưa lộc chưa kết thúc",
    RAIN_FULL: "Sàn đang có nhiều mưa lộc, thử lại sau",
    NOT_ON_FLOOR: "Bạn không ở trên sàn",
  }
  toast(messages[code] || "Có lỗi xảy ra", "warn")
}

export function sendFx(kind: "xaxui" | "gay", text?: string) {
  floorSocket.send({ type: "fx", kind, text } as ClientMessage)
}

export function sendRainGive(
  amount: number,
  coins?: { x: number; y: number }[]
) {
  floorSocket.send({ type: "rain:give", amount, coins } as ClientMessage)
}

export function sendRainGrab(rainId: string, coin: number) {
  floorSocket.send({ type: "rain:grab", rainId, coin } as ClientMessage)
}
