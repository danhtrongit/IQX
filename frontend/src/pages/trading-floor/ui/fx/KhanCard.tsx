import {
  useEffect,
  useId,
  useRef,
  type FormEvent,
  type KeyboardEvent,
} from "react"
import { AlertCircle, Coins, Flame, X } from "lucide-react"

import { formatXu } from "@/pages/demo-trading/shop/shop-model"

import { cx } from "../utils.ts"
import { ChibiIncenseAltarArt, LotusWatermarkSvg } from "./FxArt.tsx"
import {
  scrollFieldIntoView,
  stopFxKeyPropagation,
  useFxKeyboardLift,
} from "./use-fx-keyboard.ts"

export interface KhanCardProps {
  text: string
  onTextChange: (value: string) => void
  onSubmit: () => void
  onClose: (restoreFocus?: boolean) => void
  balance: number | undefined
  cost: number
  maxLength: number
  badWords: boolean
  canAfford: boolean
  cooldownSeconds: number
  playerName: string
}

/** Calm chibi red-lacquer & gold altar prayer card for Khấn Thần Tài. */
export function KhanCard({
  text,
  onTextChange,
  onSubmit,
  onClose,
  balance,
  cost,
  maxLength,
  badWords,
  canAfford,
  cooldownSeconds,
  playerName,
}: KhanCardProps) {
  const formRef = useRef<HTMLFormElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const titleId = useId()
  const inputId = useId()
  const errorId = useId()

  useFxKeyboardLift(formRef)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const trimmed = text.trim()
  const nearLimit = text.length >= maxLength - 10
  const submitDisabled =
    !trimmed || badWords || !canAfford || cooldownSeconds > 0
  const displayName = playerName.trim() || "Bạn"

  const handleFormSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    if (submitDisabled) return
    onSubmit()
  }

  const handleFormKeyDown = (e: KeyboardEvent<HTMLFormElement>): void => {
    stopFxKeyPropagation(e)
    if (e.key === "Escape") {
      e.preventDefault()
      onClose(true)
    }
  }

  const handleTextareaKeyDown = (
    e: KeyboardEvent<HTMLTextAreaElement>
  ): void => {
    stopFxKeyPropagation(e)
    if (e.key === "Escape") {
      e.preventDefault()
      onClose(true)
      return
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (!submitDisabled) onSubmit()
    }
  }

  return (
    <form
      ref={formRef}
      className="fx-card fx-card--khan"
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      onSubmit={handleFormSubmit}
      onKeyDown={handleFormKeyDown}
    >
      <div className="fx-sheet-handle" aria-hidden="true" />

      <div className="fx-card-head">
        <ChibiIncenseAltarArt />
        <div className="fx-card-heading">
          <h3 id={titleId} className="fx-card-title">
            Khấn Thần Tài
          </h3>
          <p className="fx-card-sub">Thắp hương dâng lời cầu lộc</p>
        </div>
        <button
          type="button"
          className="fx-card-close"
          onClick={() => onClose(true)}
          aria-label="Đóng bảng Khấn Thần Tài"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="fx-meta-row">
        <span className="fx-cost-chip fx-cost-chip--khan">
          <Coins size={14} aria-hidden="true" />
          <span>{formatXu(cost)} xu</span>
        </span>
        <span className="fx-balance">
          Số dư{" "}
          <strong>{balance != null ? formatXu(balance) : "…"} xu</strong>
        </span>
      </div>

      <div className="fx-scroll-field">
        <label htmlFor={inputId} className="sr-only">
          Lời khấn Thần Tài
        </label>
        <div className={cx("fx-scroll-box", badWords && "is-invalid")}>
          <LotusWatermarkSvg />
          <textarea
            id={inputId}
            ref={textareaRef}
            className="fx-scroll-textarea"
            rows={2}
            maxLength={maxLength}
            placeholder="Con xin Thần Tài phù hộ..."
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            onKeyDown={handleTextareaKeyDown}
            onFocus={(e) => scrollFieldIntoView(e.currentTarget)}
            aria-invalid={badWords || undefined}
            aria-describedby={badWords ? errorId : undefined}
          />
          <div className="fx-scroll-foot">
            <span className="fx-field-hint">Nhấn Enter để dâng lời</span>
            <span
              className={cx("fx-counter", nearLimit && "fx-counter--warn")}
              aria-live="polite"
            >
              {text.length}/{maxLength}
            </span>
          </div>
        </div>
      </div>

      <div className="fx-preview-wrap">
        <span className="fx-preview-label">Xem trước cuộn khấn</span>
        <div
          className="fx-banner-preview fx-banner-preview--khan"
          aria-hidden="true"
        >
          <span className="fx-banner-preview-head">{displayName} khấn:</span>
          <span
            className={cx(
              "fx-banner-preview-body",
              !trimmed && "is-placeholder"
            )}
          >
            {trimmed || "Con xin Thần Tài phù hộ..."}
          </span>
        </div>
      </div>

      {badWords && (
        <p id={errorId} className="fx-card-error" role="alert">
          <AlertCircle size={15} aria-hidden="true" />
          <span>Câu có từ ngữ không phù hợp</span>
        </p>
      )}
      {!canAfford && (
        <p className="fx-card-error" role="alert">
          <AlertCircle size={15} aria-hidden="true" />
          <span>Không đủ xu</span>
        </p>
      )}

      <button
        type="submit"
        className="fx-submit fx-submit--khan"
        disabled={submitDisabled}
      >
        <Flame size={18} aria-hidden="true" />
        <span>
          {cooldownSeconds > 0 ? `Chờ ${cooldownSeconds}s` : "Thành tâm khấn"}
        </span>
      </button>
    </form>
  )
}
