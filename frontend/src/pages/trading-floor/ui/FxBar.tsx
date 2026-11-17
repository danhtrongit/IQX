/**
 * Floor actions everyone sees (backend/docs/trading-floor-fx/SPEC.md): Xả xui (stomp an egg),
 * Gáy (fireworks + a sentence) and Tán lộc (a rain of 10-xu coins paid from the wallet).
 */
import { useEffect, useRef, useState, type FormEvent } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Coins, Egg, Megaphone } from "lucide-react"

import { useAuth } from "@/hooks/use-auth"
import { formatXu, shopKeys } from "@/pages/demo-trading/shop/shop-model"
import { useShopState } from "@/pages/demo-trading/shop/use-shop"

import { commands, needLogin, ui } from "../bridge.ts"
import {
  FX_GAY_COOLDOWN_MS,
  FX_GAY_TEXT_MAX,
  FX_XAXUI_COOLDOWN_MS,
  RAIN_COIN_VALUE,
  RAIN_MAX,
  RAIN_MIN,
} from "../net/types.ts"
import { useStore } from "../use-store.ts"
import { cx } from "./utils.ts"

const PRESETS = [50, 100, 200, 500, 1000]

export function FxBar() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const guest = useStore(ui.guest)
  const shop = useShopState()
  const [xaxuiUntil, setXaxuiUntil] = useState(0)
  const [gayUntil, setGayUntil] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [open, setOpen] = useState<"gay" | "rain" | null>(null)
  const [gayText, setGayText] = useState("")
  const [amount, setAmount] = useState(100)
  const barRef = useRef<HTMLDivElement>(null)

  const cooling = xaxuiUntil > now || gayUntil > now
  useEffect(() => {
    if (!cooling) return
    const tick = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(tick)
  }, [cooling])

  useEffect(() => {
    if (!user) return
    return ui.walletTick.subscribe(() => {
      void queryClient.invalidateQueries({ queryKey: shopKeys.state(user.id) })
    })
  }, [queryClient, user])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(null)
    }
    const onDown = (e: PointerEvent): void => {
      if (!barRef.current?.contains(e.target as Node)) setOpen(null)
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener("pointerdown", onDown)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("pointerdown", onDown)
    }
  }, [open])

  const xaxui = (): void => {
    const t = Date.now()
    if (xaxuiUntil > t) return
    commands.emit("fx", { kind: "xaxui" })
    setXaxuiUntil(t + FX_XAXUI_COOLDOWN_MS)
    setNow(t)
  }

  const toggle = (kind: "gay" | "rain"): void => {
    if (guest) {
      needLogin(kind === "gay" ? "Đăng nhập để gáy" : "Đăng nhập để tán lộc")
      return
    }
    setOpen((cur) => (cur === kind ? null : kind))
  }

  const submitGay = (e: FormEvent): void => {
    e.preventDefault()
    const text = gayText.trim()
    if (!text || gayUntil > Date.now()) return
    commands.emit("fx", { kind: "gay", text })
    const t = Date.now()
    setGayUntil(t + FX_GAY_COOLDOWN_MS)
    setNow(t)
    setGayText("")
    setOpen(null)
  }

  const balance = shop.data?.wallet.balance
  const validAmount =
    Number.isInteger(amount) &&
    amount >= RAIN_MIN &&
    amount <= RAIN_MAX &&
    amount % RAIN_COIN_VALUE === 0
  const rainError = !validAmount
    ? `Chọn từ ${RAIN_MIN} đến ${formatXu(RAIN_MAX)} xu, chẵn chục`
    : balance != null && amount > balance
      ? "Không đủ xu"
      : null

  const submitRain = (e: FormEvent): void => {
    e.preventDefault()
    if (rainError || balance == null) return
    commands.emit("rainGive", amount)
    setOpen(null)
  }

  const left = (until: number): number => Math.ceil((until - now) / 1000)
  const stop = (e: { stopPropagation: () => void }): void => e.stopPropagation()

  return (
    <div className="fx-bar" role="toolbar" aria-label="Hành động" ref={barRef}>
      <button
        type="button"
        className="fx-btn"
        onClick={xaxui}
        disabled={xaxuiUntil > now}
        title="Xả xui: đạp vỡ quả trứng xui"
      >
        <Egg size={20} aria-hidden="true" />
        <small>{xaxuiUntil > now ? `${left(xaxuiUntil)}s` : "Xả xui"}</small>
      </button>
      <button
        type="button"
        className={cx("fx-btn", open === "gay" && "on")}
        onClick={() => toggle("gay")}
        disabled={gayUntil > now}
        aria-expanded={open === "gay"}
        title="Gáy: bắn pháo bông kèm một câu"
      >
        <Megaphone size={20} aria-hidden="true" />
        <small>{gayUntil > now ? `${left(gayUntil)}s` : "Gáy"}</small>
      </button>
      <button
        type="button"
        className={cx("fx-btn", "fx-gold", open === "rain" && "on")}
        onClick={() => toggle("rain")}
        aria-expanded={open === "rain"}
        title="Tán lộc: rải mưa xu cho cả sàn nhặt"
      >
        <Coins size={20} aria-hidden="true" />
        <small>Tán lộc</small>
      </button>

      {open === "gay" && (
        <form className="fx-pop" onSubmit={submitGay} onKeyDown={stop}>
          <b>Gáy cho cả sàn nghe</b>
          <input
            maxLength={FX_GAY_TEXT_MAX}
            placeholder="Gáy một câu cho cả sàn nghe"
            value={gayText}
            onChange={(e) => setGayText(e.target.value)}
            autoFocus
          />
          <div className="fx-row">
            <small>
              {gayText.length}/{FX_GAY_TEXT_MAX}
            </small>
            <button type="submit" className="fx-go" disabled={!gayText.trim()}>
              Gáy
            </button>
          </div>
        </form>
      )}

      {open === "rain" && (
        <form className="fx-pop" onSubmit={submitRain} onKeyDown={stop}>
          <b>Tán lộc</b>
          <p className="fx-muted">
            Số dư: {balance != null ? formatXu(balance) : "…"} xu
          </p>
          <div className="fx-presets">
            {PRESETS.map((v) => (
              <button
                key={v}
                type="button"
                className={cx("fx-chip", amount === v && "on")}
                onClick={() => setAmount(v)}
              >
                {formatXu(v)}
              </button>
            ))}
          </div>
          <input
            type="number"
            inputMode="numeric"
            min={RAIN_MIN}
            max={RAIN_MAX}
            step={RAIN_COIN_VALUE}
            value={Number.isFinite(amount) ? amount : ""}
            onChange={(e) => setAmount(Number(e.target.value))}
            aria-label="Số xu tán lộc"
          />
          <p className="fx-muted">
            {validAmount
              ? `= ${amount / RAIN_COIN_VALUE} đồng xu, mỗi đồng ${RAIN_COIN_VALUE} xu. Xu không ai nhặt sau 45 giây được hoàn lại.`
              : " "}
          </p>
          {rainError && <p className="fx-error">{rainError}</p>}
          <button
            type="submit"
            className="fx-go"
            disabled={!!rainError || balance == null}
          >
            Tán lộc {validAmount ? `${formatXu(amount)} xu` : ""}
          </button>
        </form>
      )}
    </div>
  )
}
