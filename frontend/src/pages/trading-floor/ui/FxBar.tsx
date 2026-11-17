import { useEffect, useRef, useState, type FormEvent } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Coins, Egg, Megaphone, Flame, Volume2, VolumeX } from "lucide-react"

import { useAuth } from "@/hooks/use-auth"
import { formatXu, shopKeys } from "@/pages/demo-trading/shop/shop-model"
import { useShopState } from "@/pages/demo-trading/shop/use-shop"

import { commands, needLogin, ui } from "../bridge.ts"
import { fxSoundOn, setFxSound } from "../engine/fx-sound.ts"
import { hasBadWords } from "../net/bad-words.ts"
import { floorFx } from "../net/fx.ts"
import {
  FX_COSTS,
  FX_GAY_COOLDOWN_MS,
  FX_GAY_TEXT_MAX,
  FX_KHAN_COOLDOWN_MS,
  FX_XAXUI_COOLDOWN_MS,
  RAIN_COIN_VALUE,
  RAIN_MAX,
  RAIN_MIN,
  type FxKind,
} from "../net/types.ts"
import { useStore } from "../use-store.ts"
import { cx } from "./utils.ts"

const PRESETS = [50, 100, 200, 500, 1000]
const COOLDOWN: Record<FxKind, number> = {
  xaxui: FX_XAXUI_COOLDOWN_MS,
  gay: FX_GAY_COOLDOWN_MS,
  khan: FX_KHAN_COOLDOWN_MS,
}

export function FxBar() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const guest = useStore(ui.guest)
  const shop = useShopState()
  const soundOn = useStore(fxSoundOn)
  const [cooldowns, setCooldowns] = useState({ xaxui: 0, gay: 0, khan: 0 })
  const [now, setNow] = useState(() => Date.now())
  const [open, setOpen] = useState<"gay" | "khan" | "rain" | null>(null)
  const [text, setText] = useState("")
  const [amount, setAmount] = useState(100)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(tick)
  }, [])

  // The cooldown starts once the server has taken the xu (`fx:done`): a refused action can be retried at once.
  useEffect(
    () =>
      floorFx.on("selfFx", ({ kind }) => {
        const t = Date.now()
        setCooldowns((prev) => ({ ...prev, [kind]: t + COOLDOWN[kind] }))
      }),
    []
  )

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

  const balance = shop.data?.wallet.balance
  const badWords = hasBadWords(text)
  const canAfford = (cost: number) => balance != null && balance >= cost

  const xaxui = (): void => {
    if (needLogin("Đăng nhập để xả xui")) return
    commands.emit("fx", { kind: "xaxui" })
  }

  const toggle = (kind: "gay" | "khan" | "rain"): void => {
    if (guest) {
      needLogin(
        kind === "gay"
          ? "Đăng nhập để gáy"
          : kind === "khan"
            ? "Đăng nhập để khấn Thần Tài"
            : "Đăng nhập để tán lộc"
      )
      return
    }
    setOpen((cur) => (cur === kind ? null : kind))
    setText("")
  }

  const submitText = (e: FormEvent): void => {
    e.preventDefault()
    if (
      !open ||
      open === "rain" ||
      !text.trim() ||
      badWords ||
      cooldowns[open] > Date.now()
    )
      return
    commands.emit("fx", { kind: open, text: text.trim() })
    setText("")
    setOpen(null)
  }

  const rainError = !(
    Number.isInteger(amount) &&
    amount >= RAIN_MIN &&
    amount <= RAIN_MAX &&
    amount % RAIN_COIN_VALUE === 0
  )
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

  const left = (until: number): number =>
    Math.ceil(Math.max(0, until - now) / 1000)
  const stop = (e: { stopPropagation: () => void }): void => e.stopPropagation()

  return (
    <div className="fx-bar" role="toolbar" aria-label="Hành động" ref={barRef}>
      <button
        type="button"
        className="fx-btn"
        onClick={xaxui}
        disabled={
          cooldowns.xaxui > now ||
          (!guest && balance != null && balance < FX_COSTS.xaxui)
        }
        title={
          !guest && balance != null && balance < FX_COSTS.xaxui
            ? `Cần ${FX_COSTS.xaxui} xu`
            : `Xả xui · ${FX_COSTS.xaxui} xu`
        }
      >
        <Egg size={20} />
        <small>
          {cooldowns.xaxui > now ? `${left(cooldowns.xaxui)}s` : "Xả xui"}
        </small>
      </button>
      <button
        type="button"
        className={cx("fx-btn", open === "gay" && "on")}
        onClick={() => toggle("gay")}
        disabled={cooldowns.gay > now}
        aria-expanded={open === "gay"}
        title={`Gáy · ${FX_COSTS.gay} xu`}
      >
        <Megaphone size={20} />
        <small>{cooldowns.gay > now ? `${left(cooldowns.gay)}s` : "Gáy"}</small>
      </button>
      <button
        type="button"
        className={cx("fx-btn", open === "khan" && "on")}
        onClick={() => toggle("khan")}
        disabled={cooldowns.khan > now}
        aria-expanded={open === "khan"}
        title={`Khấn Thần Tài · ${FX_COSTS.khan} xu`}
      >
        <Flame size={20} />
        <small>
          {cooldowns.khan > now ? `${left(cooldowns.khan)}s` : "Khấn"}
        </small>
      </button>
      <button
        type="button"
        className={cx("fx-btn", "fx-gold", open === "rain" && "on")}
        onClick={() => toggle("rain")}
        aria-expanded={open === "rain"}
        title="Tán lộc"
      >
        <Coins size={20} />
        <small>Tán lộc</small>
      </button>
      <button
        type="button"
        className="fx-btn fx-sound"
        onClick={() => setFxSound(!soundOn)}
        aria-label={soundOn ? "Tắt tiếng" : "Bật tiếng"}
      >
        {soundOn ? <Volume2 size={20} /> : <VolumeX size={20} />}
      </button>

      {(open === "gay" || open === "khan") && (
        <form className="fx-pop" onSubmit={submitText} onKeyDown={stop}>
          <b>{open === "gay" ? "Gáy" : "Khấn Thần Tài"}</b>
          <p className="fx-muted">
            Mỗi lần {open === "gay" ? FX_COSTS.gay : FX_COSTS.khan} xu · Số dư{" "}
            {balance != null ? formatXu(balance) : "…"} xu
          </p>
          <input
            maxLength={FX_GAY_TEXT_MAX}
            placeholder={
              open === "gay" ? "Gáy một câu..." : "Con xin Thần Tài phù hộ..."
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
          />
          {badWords && <p className="fx-error">Câu có từ ngữ không phù hợp</p>}
          {!canAfford(open === "gay" ? FX_COSTS.gay : FX_COSTS.khan) && (
            <p className="fx-error">Không đủ xu</p>
          )}
          <button
            type="submit"
            className="fx-go"
            disabled={
              !text.trim() ||
              badWords ||
              !canAfford(open === "gay" ? FX_COSTS.gay : FX_COSTS.khan)
            }
          >
            {open === "gay" ? "Gáy" : "Khấn"}
          </button>
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
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
          />
          {rainError && <p className="fx-error">{rainError}</p>}
          <button
            type="submit"
            className="fx-go"
            disabled={!!rainError || balance == null}
          >
            Tán lộc {formatXu(amount)} xu
          </button>
        </form>
      )}
    </div>
  )
}
