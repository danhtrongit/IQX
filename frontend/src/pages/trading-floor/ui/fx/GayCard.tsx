import {
  useEffect,
  useId,
  useRef,
  type FormEvent,
  type KeyboardEvent,
} from "react"
import { AlertCircle, Coins, Megaphone, X } from "lucide-react"

import { formatXu } from "@/pages/demo-trading/shop/shop-model"

import { cx } from "../utils.ts"
import { ChibiRoosterArt } from "./FxArt.tsx"
import {
  scrollFieldIntoView,
  stopFxKeyPropagation,
  useFxKeyboardLift,
} from "./use-fx-keyboard.ts"

export interface GayCardProps {
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

/** Playful chibi "Rooster Crow / Sunrise Megaphone" card for Gáy. */
export function GayCard({
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
}: GayCardProps) {
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
      className="fx-card fx-card--gay"
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      onSubmit={handleFormSubmit}
      onKeyDown={handleFormKeyDown}
    >
      <div className="fx-sheet-handle" aria-hidden="true" />

      <div className="fx-card-head">
        <ChibiRoosterArt cheering={trimmed.length > 0} />
        <div className="fx-card-heading">
          <h3 id={titleId} className="fx-card-title">
            Gáy
          </h3>
          <p className="fx-card-sub">Phát loa bình minh vang khắp sàn</p>
        </div>
        <button
          type="button"
          className="fx-card-close"
          onClick={() => onClose(true)}
          aria-label="Đóng bảng Gáy"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="fx-meta-row">
        <span className="fx-cost-chip fx-cost-chip--gay">
          <Coins size={14} aria-hidden="true" />
          <span>{formatXu(cost)} xu</span>
        </span>
        <span className="fx-balance">
          Số dư{" "}
          <strong>{balance != null ? formatXu(balance) : "…"} xu</strong>
        </span>
      </div>

      <div className="fx-cloud-field">
        <label htmlFor={inputId} className="sr-only">
          Nội dung gáy
        </label>
        <div className={cx("fx-cloud-box", badWords && "is-invalid")}>
          <textarea
            id={inputId}
            ref={textareaRef}
            className="fx-cloud-textarea"
            rows={2}
            maxLength={maxLength}
            placeholder="Gáy một câu..."
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            onKeyDown={handleTextareaKeyDown}
            onFocus={(e) => scrollFieldIntoView(e.currentTarget)}
            aria-invalid={badWords || undefined}
            aria-describedby={badWords ? errorId : undefined}
          />
          <div className="fx-cloud-foot">
            <span className="fx-field-hint">Nhấn Enter để gáy</span>
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
        <span className="fx-preview-label">Xem trước băng rôn</span>
        <div
          className="fx-banner-preview fx-banner-preview--gay"
          aria-hidden="true"
        >
          <span className="fx-banner-preview-head">{displayName} gáy:</span>
          <span
            className={cx(
              "fx-banner-preview-body",
              !trimmed && "is-placeholder"
            )}
          >
            {trimmed || "Gáy một câu..."}
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
        className="fx-submit fx-submit--gay"
        disabled={submitDisabled}
      >
        <Megaphone size={18} aria-hidden="true" />
        <span>{cooldownSeconds > 0 ? `Chờ ${cooldownSeconds}s` : "Gáy"}</span>
      </button>
    </form>
  )
}
