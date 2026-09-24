import { cn } from "@/lib/utils"

import { fmtNumber, STATUS_TONE_CLASS } from "../../format"
import type { BctcStatus } from "../../types"

type Trinity = {
  altman_z: number | null
  piotroski_f?: { score: number | null }
  beneish_m: number | null
}

type Verdict = { status: BctcStatus; label: string }

function altmanVerdict(z: number | null): Verdict {
  if (z == null) return { status: "na", label: "—" }
  if (z > 2.99) return { status: "green", label: "Vùng An toàn" }
  if (z >= 1.81) return { status: "amber", label: "Vùng Xám" }
  return { status: "red", label: "Nguy cơ" }
}

function piotroskiVerdict(score: number | null): Verdict {
  if (score == null) return { status: "na", label: "—" }
  if (score >= 7) return { status: "green", label: "Fundamental mạnh" }
  if (score >= 4) return { status: "amber", label: "Trung bình" }
  return { status: "red", label: "Yếu" }
}

function beneishVerdict(m: number | null): Verdict {
  if (m == null) return { status: "na", label: "—" }
  if (m < -1.78) return { status: "green", label: "Không manipulation" }
  return { status: "red", label: "Cảnh báo" }
}

function Card({
  label,
  value,
  sub,
  verdict,
}: {
  label: string
  value: string
  sub: string
  verdict: Verdict
}) {
  return (
    <div className="bg-card p-4 text-center">
      <div className="text-[10px] tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="mt-1 text-3xl font-bold tabular-nums">
        <span
          className={cn(
            verdict.status === "green" && "text-price-up",
            verdict.status === "amber" && "text-price-ref",
            verdict.status === "red" && "text-price-down",
          )}
        >
          {value}
        </span>
      </div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">{sub}</div>
      <div className="mt-2">
        <span
          className={cn(
            "inline-block rounded-sm border px-2 py-0.5 text-[10px] font-bold",
            STATUS_TONE_CLASS[verdict.status],
          )}
        >
          {verdict.label}
        </span>
      </div>
    </div>
  )
}

/** Forensic trio (Altman Z' · Piotroski F · Beneish M) as verdict cards. */
export function TrinityCards({ trinity }: { trinity: Trinity }) {
  const score = trinity.piotroski_f?.score ?? null
  return (
    <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg bg-border sm:grid-cols-3">
      <Card
        label="Altman Z'"
        value={fmtNumber(trinity.altman_z, 2)}
        sub="An toàn > 2.99"
        verdict={altmanVerdict(trinity.altman_z)}
      />
      <Card
        label="Piotroski F"
        value={score == null ? "—" : `${score}/9`}
        sub="Strong > 7"
        verdict={piotroskiVerdict(score)}
      />
      <Card
        label="Beneish M"
        value={fmtNumber(trinity.beneish_m, 2)}
        sub="An toàn < −1.78"
        verdict={beneishVerdict(trinity.beneish_m)}
      />
    </div>
  )
}
