import { X } from "lucide-react"
/** The lacquered ritual window: 4 diamond step seals over the current step. the X button, Esc and the backdrop close it. */
import { useCallback, useEffect, useRef, useState } from "react"

import { floorApi } from "../../net/api.ts"
import type { ThanTaiToday } from "../../net/types.ts"
import { STEP_LABELS, describeFailure, isAlreadyDone } from "../../than-tai.ts"
import { cx } from "../utils.ts"
import { StepCau } from "./StepCau.tsx"
import { StepDraw } from "./StepDraw.tsx"
import { StepPredict } from "./StepPredict.tsx"
import { StepResults } from "./StepResults.tsx"
import type { Act, Step } from "./types.ts"

interface Props {
  /** Today with the status already corrected for the server clock. */
  today: ThanTaiToday
  initialStep: Step
  reduced: boolean
  /** A fresh answer of the server and when it arrived (browser clock). */
  onToday: (today: ThanTaiToday, receivedAt: number) => void
  /** The server said HET_GIO: toast, close, reload. */
  onExpired: () => void
  /** A card was drawn in this window. */
  onDrawn: (today: ThanTaiToday) => void
  /** Step 3 offered or skipped. */
  onFinished: () => void
  onClose: () => void
}

export function RitualDialog({
  today,
  initialStep,
  reduced,
  onToday,
  onExpired,
  onDrawn,
  onFinished,
  onClose,
}: Props) {
  const [step, setStep] = useState<Step>(initialStep)
  const [justDrawn, setJustDrawn] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  // Escape closes this window only: caught before the sheet underneath sees it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Escape" || e.defaultPrevented) return
      e.preventDefault()
      onClose()
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [onClose])

  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  useEffect(() => {
    if (overlayRef.current) overlayRef.current.scrollTop = 0
  }, [step])

  const act: Act = useCallback(
    async (call) => {
      try {
        const next = await call()
        onToday(next, Date.now())
        return { ok: next }
      } catch (error) {
        const fail = describeFailure(error)
        if (fail.kind === "het_gio") {
          onExpired()
        } else if (isAlreadyDone(fail.code)) {
          // Done on another tab or device: catch up with the server and move on.
          try {
            const fresh = await floorApi.thanTai.today()
            onToday(fresh, Date.now())
            setStep(fresh.step)
          } catch {
            // Keep the message; the next try reloads.
          }
        }
        return { fail }
      }
    },
    [onExpired, onToday]
  )

  const done = today.status === "da_xong"
  return (
    <div
      ref={overlayRef}
      className="tt-ov"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panelRef}
        className="tt-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Khấn Thần Tài"
        tabIndex={-1}
      >
        <button
          type="button"
          className="tt-x"
          onClick={onClose}
          aria-label="Đóng"
        >
          <X size={16} aria-hidden="true" />
        </button>
        <div className="tt-ptitle">KHẤN THẦN TÀI</div>
        <ol className="tt-seals">
          {STEP_LABELS.map((label, i) => {
            const n = (i + 1) as Step
            const on = n === step
            const sealDone = !on && (done || n < today.step)
            return (
              <li
                key={label}
                className={cx(
                  "tt-seal",
                  on && "tt-seal-on",
                  sealDone && "tt-seal-done"
                )}
                aria-current={on ? "step" : undefined}
              >
                <span>
                  <b>{n}</b>
                </span>
                {label}
              </li>
            )
          })}
        </ol>
        <div className="tt-body">
          {step === 1 && (
            <StepDraw
              today={today}
              reduced={reduced}
              act={act}
              justDrawn={justDrawn}
              onDrawn={(t) => {
                setJustDrawn(true)
                onDrawn(t)
              }}
              onGo={setStep}
            />
          )}
          {step === 2 && (
            <StepPredict today={today} act={act} onDone={() => setStep(3)} />
          )}
          {step === 3 && (
            <StepCau
              act={act}
              onDone={() => {
                setStep(4)
                onFinished()
              }}
            />
          )}
          {step === 4 && (
            <StepResults
              today={today}
              onOpenCard={() => {
                setJustDrawn(false)
                setStep(1)
              }}
              onClose={onClose}
            />
          )}
        </div>
      </div>
    </div>
  )
}
