import { useMemo, useState, type ReactNode } from "react"
import { Select, Skeleton } from "@arco-design/web-react"
import { Panel } from "./Panel"
import { useAIMarketAnalysis, useAISectorAnalysisBatch, useIndustryList } from "../hooks"
import { useSelectedSector } from "./SectorContext"
import { IconSparkles } from "@/shared/icons"
import type { IndustryOption } from "../types"

interface AIAnalysisPanelProps {
  type: "market" | "sector"
}

function SectorSelect({
  value,
  onChange,
  industries,
  loading,
}: {
  value: number
  onChange: (code: number) => void
  industries: IndustryOption[]
  loading: boolean
}) {
  return (
    <Select
      size="mini"
      value={value ? String(value) : undefined}
      onChange={(v) => onChange(Number(v))}
      disabled={loading || industries.length === 0}
      placeholder={loading ? "Đang tải ngành..." : "Chọn ngành"}
      style={{ width: 180 }}
      showSearch={{ retainInputValue: true }}
      filterOption={(input, option) =>
        String((option.props as { children?: unknown }).children ?? "")
          .toLowerCase()
          .includes(input.toLowerCase())
      }
    >
      {industries.map((ind) => (
        <Select.Option key={ind.code} value={String(ind.code)}>
          {ind.name}
        </Select.Option>
      ))}
    </Select>
  )
}

function AISkeletons() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton
          key={i}
          animation
          text={{ rows: 1, width: `${85 - i * 10}%` }}
          image={false}
        />
      ))}
    </div>
  )
}

/** Bold the part before the first colon (≤40 chars) as a label. */
function HighlightedBullet({ text }: { text: string }): ReactNode {
  const colonIdx = text.indexOf(":")
  if (colonIdx > 0 && colonIdx < 40) {
    return (
      <>
        <span className="font-bold text-[rgb(var(--gold-6))]">{text.slice(0, colonIdx + 1)}</span>
        {text.slice(colonIdx + 1)}
      </>
    )
  }
  return <>{text}</>
}

function BulletList({ bullets, loading }: { bullets: string[]; loading: boolean }) {
  if (loading) return <AISkeletons />
  if (bullets.length === 0) {
    return (
      <div className="text-[13px] text-[var(--color-text-3)] italic py-2">Không có dữ liệu phân tích.</div>
    )
  }
  return (
    <ul className="flex flex-col gap-1.5 list-none p-0 m-0">
      {bullets.map((bullet, i) => (
        <li key={i} className="text-[13px] leading-snug text-[var(--color-text-2)] pl-4 relative">
          <span className="absolute left-0 text-[rgb(var(--gold-6))] font-bold">•</span>
          <HighlightedBullet text={bullet} />
        </li>
      ))}
    </ul>
  )
}

function AIMarketAnalysisPanel() {
  const { data, loading } = useAIMarketAnalysis()
  return (
    <Panel
      title="AI phân tích thị trường"
      source={loading ? "mock" : "live"}
      icon={<IconSparkles className="text-[rgb(var(--gold-6))]" />}
    >
      <BulletList bullets={data.bullets} loading={loading} />
    </Panel>
  )
}

function AISectorAnalysisPanel() {
  const { data: industries, loading: industriesLoading } = useIndustryList()
  const { selectedSectorCode } = useSelectedSector()
  const [selectedICB, setSelectedICB] = useState<number>(0)

  const effectiveICB = useMemo(() => {
    if (selectedSectorCode && industries.length > 0) {
      const match = industries.find((i) => String(i.code) === selectedSectorCode)
      if (match) return match.code
    }
    if (industries.length === 0) return selectedICB
    if (selectedICB !== 0 && industries.some((i) => i.code === selectedICB)) {
      return selectedICB
    }
    return industries[0].code
  }, [industries, selectedICB, selectedSectorCode])

  const { data, loading, batchLoading } = useAISectorAnalysisBatch(industries, effectiveICB)

  return (
    <Panel
      title="AI phân tích ngành"
      source={loading ? "mock" : "live"}
      icon={<IconSparkles className="text-[rgb(var(--gold-6))]" />}
      headerRight={
        <SectorSelect
          value={effectiveICB}
          onChange={setSelectedICB}
          industries={industries}
          loading={industriesLoading}
        />
      }
    >
      {batchLoading && !loading ? (
        <div className="text-[13px] text-[var(--color-text-3)] italic py-2">
          Đang phân tích các ngành...
        </div>
      ) : (
        <BulletList bullets={data.bullets} loading={loading} />
      )}
    </Panel>
  )
}

export function AIAnalysisPanel({ type }: AIAnalysisPanelProps) {
  return type === "market" ? <AIMarketAnalysisPanel /> : <AISectorAnalysisPanel />
}
