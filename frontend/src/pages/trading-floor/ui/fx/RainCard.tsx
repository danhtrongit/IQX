import { useId, useRef, type FormEvent, type KeyboardEvent } from "react"
import { AlertCircle, Coins, X } from "lucide-react"

import { formatXu } from "@/pages/demo-trading/shop/shop-model"

import { RAIN_COIN_VALUE, RAIN_MAX, RAIN_MIN } from "../../net/types.ts"
import { cx } from "../utils.ts"
import { ChibiCoinPouchArt } from "./FxArt.tsx"
import {
  scrollFieldIntoView,
  stopFxKeyPropagation,
  useFxKeyboardLift,
} from "./use-fx-keyboard.ts"

const PRESETS = [50, 100, 200, 500, 1000]

export interface RainCardProps {
  amount: number
  onAmountChange: (value: number) => void
  onSubmit: (e: FormEvent) => void
  onClose: (restoreFocus?: boolean) => void
  balance: number | undefined
  rainError: string | null
}

/** Lightly aligned chibi gold-coin card for Tán lộc, preserving all existing rules. */
export function RainCard({
  amount,
  onAmountChange,
  onSubmit,
  onClose,
  balance,
  rainError,
}: RainCardProps) {
  const formRef = useRef<HTMLFormElement>(null)
  const titleId = useId()
  const inputId = useId()

  useFxKeyboardLift(formRef)

  const handleKeyDown = (e: KeyboardEvent<HTMLElement>): void => {
    stopFxKeyPropagation(e)
    if (e.key === "Escape") {
      e.preventDefault()
      onClose(true)
    }
  }

  return (
    <form
      ref={formRef}
      className="fx-card fx-card--rain"
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      onSubmit={onSubmit}
      onKeyDown={handleKeyDown}
    >
      <div className="fx-sheet-handle" aria-hidden="true" />

      <div className="fx-card-head">
        <ChibiCoinPouchArt />
        <div className="fx-card-heading">
          <h3 id={titleId} className="fx-card-title">
            Tán lộc
          </h3>
          <p className="fx-card-sub">
            Số dư:{" "}
            <strong>{balance != null ? formatXu(balance) : "…"} xu</strong>
          </p>
        </div>
        <button
          type="button"
          className="fx-card-close"
          onClick={() => onClose(true)}
          aria-label="Đóng bảng Tán lộc"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="fx-rain-presets" role="group" aria-label="Mức xu tán lộc">
        {PRESETS.map((v) => (
          <button
            key={v}
            type="button"
            className={cx("fx-rain-chip", amount === v && "on")}
            aria-pressed={amount === v}
            onClick={() => onAmountChange(v)}
          >
            {formatXu(v)}
          </button>
        ))}
      </div>

      <div className="fx-rain-input-wrap">
        <label htmlFor={inputId} className="sr-only">
          Số xu tán lộc
        </label>
        <input
          id={inputId}
          className="fx-rain-input"
          type="number"
          inputMode="numeric"
          min={RAIN_MIN}
          max={RAIN_MAX}
          step={RAIN_COIN_VALUE}
          value={amount}
          onChange={(e) => onAmountChange(Number(e.target.value))}
          onKeyDown={handleKeyDown}
          onFocus={(e) => scrollFieldIntoView(e.currentTarget)}
        />
        <span className="fx-rain-unit" aria-hidden="true">
          xu
        </span>
      </div>

      {rainError && (
        <p className="fx-card-error" role="alert">
          <AlertCircle size={15} aria-hidden="true" />
          <span>{rainError}</span>
        </p>
      )}

      <button
        type="submit"
        className="fx-submit fx-submit--rain"
        disabled={!!rainError || balance == null}
      >
        <Coins size={18} aria-hidden="true" />
        <span>Tán lộc {formatXu(amount)} xu</span>
      </button>
    </form>
  )
}
