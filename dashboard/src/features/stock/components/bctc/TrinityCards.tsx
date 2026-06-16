import { fmtNumber, statusColors } from "../../format"
import type { BctcStatus } from "../../types"

interface Trinity {
  altman_z: number | null
  piotroski_f?: { score: number | null }
  beneish_m: number | null
}

interface Verdict {
  status: BctcStatus
  label: string
}

function altmanVerdict(z: number | null): Verdict {
  if (z == null) return { status: "na", label: "—" }
  if (z > 2.99) return { status: "green", label: "Vùng An toàn" }
  if (z >= 1.81) return { status: "amber", label: "Vùng Xám" }
  return { status: "red", label: "Nguy cơ" }
}

function piotroskiVerdict(s: number | null): Verdict {
  if (s == null) return { status: "na", label: "—" }
  if (s >= 7) return { status: "green", label: "Fundamental mạnh" }
  if (s >= 4) return { status: "amber", label: "Trung bình" }
  return { status: "red", label: "Yếu" }
}

function beneishVerdict(m: number | null): Verdict {
  if (m == null) return { status: "na", label: "—" }
  if (m < -1.78) return { status: "green", label: "Không manipulation" }
  return { status: "red", label: "Cảnh báo" }
}

function Card({ label, value, sub, verdict }: { label: string; value: string; sub: string; verdict: Verdict }) {
  const sc = statusColors(verdict.status)
  return (
    <div className="bg-[var(--color-bg-2)] p-4 text-center">
      <div className="text-[10px] uppercase tracking-wide text-[var(--color-text-3)]">{label}</div>
      <div className="mt-1 text-3xl font-bold tabular-nums" style={{ color: sc.color }}>
        {value}
      </div>
      <div className="mt-0.5 text-[10px] text-[var(--color-text-3)]">{sub}</div>
      <div className="mt-2">
        <span
          className="inline-block rounded px-2 py-0.5 text-[10px] font-bold"
          style={{ background: sc.bg, color: sc.color, borderColor: sc.border }}
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
    <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg bg-[var(--color-border-2)] sm:grid-cols-3">
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
