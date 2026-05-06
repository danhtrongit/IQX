import { useState, useMemo, type ReactNode } from "react";
import { Panel } from "./Panel";
import {
  useAIMarketAnalysis,
  useAISectorAnalysisBatch,
  useIndustryList,
} from "./hooks";
import { useSelectedSector } from "./useSelectedSector";
import { Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AIAnalysisPanelProps {
  type: "market" | "sector";
}

function SectorSelect({
  value,
  onChange,
  industries,
  loading,
}: {
  value: number;
  onChange: (code: number) => void;
  industries: { code: number; name: string }[];
  loading: boolean;
}) {
  return (
    <Select
      value={String(value)}
      onValueChange={(v) => onChange(Number(v))}
      disabled={loading || industries.length === 0}
    >
      <SelectTrigger
        size="sm"
        className="h-6 w-[170px] min-w-[170px] max-w-[220px] px-2 py-0 text-[10px] bg-slate-800 border-slate-700 text-slate-300 rounded"
      >
        <SelectValue
          placeholder={loading ? "Đang tải ngành..." : "Chọn ngành"}
        />
      </SelectTrigger>
      <SelectContent className="bg-slate-900 border-slate-700 text-slate-100">
        {industries.map((ind) => (
          <SelectItem
            key={ind.code}
            value={String(ind.code)}
            className="text-[11px] text-slate-300 focus:bg-cyan-950/30 focus:text-slate-100"
          >
            {ind.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function AISkeletons() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-4 bg-slate-800"
          style={{ width: `${85 - i * 10}%` }}
        />
      ))}
    </div>
  );
}

/**
 * Renders a bullet text with colon-based highlighting.
 * If the text contains ":", the part before the first colon is rendered
 * in bold accent color. Safe JSX rendering, no dangerouslySetInnerHTML.
 */
function HighlightedBullet({ text }: { text: string }): ReactNode {
  const colonIdx = text.indexOf(":");
  if (colonIdx > 0 && colonIdx < 40) {
    const label = text.slice(0, colonIdx + 1);
    const rest = text.slice(colonIdx + 1);
    return (
      <>
        <span className="font-bold text-yellow-300">{label}</span>
        {rest}
      </>
    );
  }
  return <>{text}</>;
}

function BulletList({ bullets, loading }: { bullets: string[]; loading: boolean }) {
  if (loading) return <AISkeletons />;
  if (bullets.length === 0) {
    return (
      <div className="text-[13px] text-slate-400 italic py-2">
        Không có dữ liệu phân tích.
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-1.5 list-none p-0 m-0">
      {bullets.map((bullet, i) => (
        <li
          key={i}
          className="text-[13px] leading-snug text-slate-300 pl-4 relative"
        >
          <span className="absolute left-0 text-yellow-300 font-bold">
            •
          </span>
          <HighlightedBullet text={bullet} />
        </li>
      ))}
    </ul>
  );
}

/**
 * AIMarketAnalysisPanel — no icon, full-width bullet list.
 */
function AIMarketAnalysisPanel() {
  const { data, source, loading } = useAIMarketAnalysis();

  return (
    <Panel
      title="AI phân tích thị trường"
      source={source}
      className="col-span-4"
      icon={<Sparkles size={14} className="text-yellow-300" />}
    >
      <BulletList bullets={data.bullets} loading={loading} />
    </Panel>
  );
}

/**
 * AISectorAnalysisPanel — uses batch endpoint to prefetch all industries.
 * Switching sectors is instant after the initial batch load.
 */
function AISectorAnalysisPanel() {
  const { data: industries, loading: industriesLoading } = useIndustryList();
  const { selectedSectorCode } = useSelectedSector();
  const [selectedICB, setSelectedICB] = useState<number>(0);

  // Compute effective ICB code:
  // Priority: selectedSectorCode from context → manual selection → first industry
  const effectiveICB = useMemo(() => {
    if (selectedSectorCode && industries.length > 0) {
      const match = industries.find((i) => String(i.code) === selectedSectorCode);
      if (match) return match.code;
    }
    if (industries.length === 0) return selectedICB;
    if (selectedICB !== 0 && industries.some((i) => i.code === selectedICB)) {
      return selectedICB;
    }
    return industries[0].code;
  }, [industries, selectedICB, selectedSectorCode]);

  const { data, source, loading, batchLoading } = useAISectorAnalysisBatch(
    industries,
    effectiveICB,
  );

  return (
    <Panel
      title="AI phân tích ngành"
      source={source}
      className="col-span-4"
      icon={<Sparkles size={14} className="text-yellow-300" />}
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
        <div className="text-[13px] text-slate-400 italic py-2">
          Đang phân tích các ngành...
        </div>
      ) : (
        <BulletList bullets={data.bullets} loading={loading} />
      )}
    </Panel>
  );
}

/**
 * AIAnalysisPanel — delegates to the correct sub-panel based on `type`.
 *
 * Each sub-panel only calls its own hook, avoiding redundant API calls.
 * This component is kept for backward compatibility with existing usage.
 */
export function AIAnalysisPanel({ type }: AIAnalysisPanelProps) {
  if (type === "market") {
    return <AIMarketAnalysisPanel />;
  }
  return <AISectorAnalysisPanel />;
}
