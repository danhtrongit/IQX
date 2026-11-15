/** Step 1: shake the bamboo cup (the server picks the lá while it shakes), then the card flips open. */
import { useState } from "react"

import { floorApi } from "../../net/api.ts"
import type { ThanTaiToday } from "../../net/types.ts"
import { THAN_TAI } from "../../than-tai.ts"
import { cx } from "../utils.ts"
import { wait } from "./hooks.ts"
import { QueCard } from "./QueCard.tsx"
import { TubeArt } from "./ShrineArt.tsx"
import type { Act, Step } from "./types.ts"

interface Props {
  today: ThanTaiToday
  reduced: boolean
  act: Act
  /** The card was drawn in this dialog: animate it and keep the luận behind its button. */
  justDrawn: boolean
  onDrawn: (today: ThanTaiToday) => void
  onGo: (step: Step) => void
}

type Phase = "idle" | "shaking" | "flying"

export function StepDraw({
  today,
  reduced,
  act,
  justDrawn,
  onDrawn,
  onGo,
}: Props) {
  const [phase, setPhase] = useState<Phase>("idle")
  const [error, setError] = useState("")

  const shake = async (): Promise<void> => {
    if (phase !== "idle") return
    setError("")
    setPhase("shaking")
    const [res] = await Promise.all([
      act(floorApi.thanTai.draw),
      wait(reduced ? 0 : THAN_TAI.shakeMs),
    ])
    if ("fail" in res) {
      setPhase("idle")
      if (res.fail.kind !== "het_gio") setError(res.fail.text)
      return
    }
    if (!reduced) {
      setPhase("flying")
      await wait(THAN_TAI.stickMs)
    }
    setPhase("idle")
    onDrawn(res.ok)
  }

  // The answer can land while the cup still shakes: the card waits for the stick to fly.
  if (today.la && phase === "idle") {
    const next = nextButton(today)
    return (
      <>
        <QueCard
          la={today.la}
          day={today.day}
          animate={justDrawn && !reduced}
          full={!justDrawn}
        />
        <div className="tt-act">
          <button
            type="button"
            className="tt-btn-main"
            onClick={() => onGo(next.step)}
          >
            {next.label}
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <h3 className="tt-h3">Gieo quẻ đầu ngày</h3>
      <p className="tt-lead">
        Tĩnh tâm, nghĩ về việc đầu tư của mình rồi lắc ống xăm.
      </p>
      <div
        className={cx(
          "tt-tube-wrap",
          phase === "shaking" && !reduced && "tt-shake"
        )}
      >
        <TubeArt />
        <div
          className={cx("tt-fly-stick", phase === "flying" && "tt-fly-go")}
          aria-hidden="true"
        />
      </div>
      <div className="tt-tube-hint">Mỗi ngày một quẻ, không gieo lại</div>
      {error && (
        <p className="tt-error" role="alert">
          {error}
        </p>
      )}
      <div className="tt-act">
        <button
          type="button"
          className="tt-btn-main"
          disabled={phase !== "idle"}
          onClick={() => void shake()}
        >
          {phase === "idle" ? (error ? "Lắc lại" : "Lắc ống xăm") : "Đang lắc…"}
        </button>
      </div>
    </>
  )
}

function nextButton(today: ThanTaiToday): { step: Step; label: string } {
  if (today.status === "da_xong" || today.status === "het_gio")
    return { step: 4, label: "Xem kết quả" }
  if (today.step === 3) return { step: 3, label: "Tiếp: Cầu mã →" }
  return { step: 2, label: "Tiếp: Dự đoán VNINDEX →" }
}
