import { useState, useMemo } from "react";
import { Panel } from "./Panel";
import { changeColor, formatVND } from "./utils";
import { useSectorData } from "./hooks";
import { useSelectedSector } from "./useSelectedSector";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, Layers } from "lucide-react";

const ITEMS_PER_PAGE = 6;

const labelStyle: Record<string, string> = {
  "Dẫn sóng": "bg-emerald-900/50 text-emerald-300",
  "Hút tiền": "bg-blue-900/50 text-blue-300",
  "Tích lũy": "bg-yellow-900/50 text-yellow-300",
  "Phân phối": "bg-red-900/50 text-red-400",
  "Hồi kỹ thuật": "bg-purple-900/50 text-purple-300",
  "Suy yếu": "bg-slate-800 text-slate-400",
};

function SectorSkeletons() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="px-2.5 py-2.5 bg-slate-800/50 rounded-md border border-slate-700"
        >
          <div className="flex items-center gap-2">
            <Skeleton className="h-3 w-24 bg-slate-800" />
            <Skeleton className="h-3 w-12 bg-slate-800" />
            <Skeleton className="h-3 w-14 bg-slate-800" />
            <Skeleton className="h-4 w-14 bg-slate-800" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SectorDataPanel() {
  const { data: sectorData, source, loading } = useSectorData();
  const { selectedSectorCode, setSelectedSectorCode } = useSelectedSector();
  const [page, setPage] = useState(0);

  // Sort by GTGD (totalValueVnd) descending as default
  const sortedData = useMemo(
    () => [...sectorData].sort((a, b) => (b.totalValueVnd || 0) - (a.totalValueVnd || 0)),
    [sectorData],
  );

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(sortedData.length / ITEMS_PER_PAGE)),
    [sortedData.length]
  );

  const pageData = useMemo(
    () =>
      sortedData.slice(
        page * ITEMS_PER_PAGE,
        page * ITEMS_PER_PAGE + ITEMS_PER_PAGE
      ),
    [sortedData, page]
  );

  return (
    <Panel
      title="Dữ liệu ngành"
      source={source}
      icon={<Layers size={14} className="text-cyan-300" />}
    >
      {/* Column Headers */}
      <div className="flex items-center gap-2 px-2.5 py-1.5 mb-1 border-b border-slate-800">
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex-1 min-w-0">
          Ngành
        </span>
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 shrink-0 min-w-[50px] text-right">
          Hiệu suất
        </span>
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 shrink-0 min-w-[55px] text-right">
          GTGD
        </span>
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 shrink-0 min-w-[56px] text-right">
          Nhãn
        </span>
      </div>

      {/* Sector Rows */}
      {loading ? (
        <SectorSkeletons />
      ) : sortedData.length === 0 ? (
        <div className="text-[11px] text-slate-400 italic py-4 text-center">
          Không có dữ liệu ngành.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {pageData.map((s) => {
            const isSelected = selectedSectorCode === s.code;
            return (
              <div
                key={s.code}
                onClick={() => setSelectedSectorCode(isSelected ? null : s.code)}
                className={`flex items-center gap-2 px-2.5 py-2.5 bg-slate-800/60 rounded-md border cursor-pointer transition-all duration-150 ${
                  isSelected
                    ? "border-blue-500 bg-blue-950/40 ring-1 ring-blue-500/30"
                    : "border-slate-700 hover:border-slate-600 hover:bg-cyan-950/30"
                }`}
              >
                {/* Ngành */}
                <span className="text-[11px] font-semibold text-slate-100 flex-1 min-w-0 truncate">
                  {s.name}
                </span>
                {/* Hiệu suất */}
                <span
                  className={`text-[10px] font-semibold tabular-nums shrink-0 min-w-[50px] text-right ${changeColor(s.change)}`}
                >
                  {s.change > 0 ? "+" : ""}
                  {s.change.toFixed(2)}%
                </span>
                {/* GTGD */}
                <span className="text-[10px] tabular-nums shrink-0 min-w-[55px] text-right text-slate-300">
                  {s.totalValueVnd > 0 ? formatVND(s.totalValueVnd) : "—"}
                </span>
                {/* Nhãn */}
                <Badge
                  variant="outline"
                  className={`h-auto text-[8px] px-1.5 py-px leading-tight font-bold rounded-sm border-transparent shrink-0 ${labelStyle[s.label] || ""}`}
                >
                  {s.label}
                </Badge>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2 mt-1 border-t border-slate-800">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="p-0.5 rounded hover:bg-cyan-950/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5 text-slate-400" />
          </button>

          <div className="flex items-center gap-1.5">
            {Array.from({ length: totalPages }).map((_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                className={`w-1.5 h-1.5 rounded-full transition-all duration-200 ${i === page
                  ? "bg-blue-500 scale-125"
                  : "bg-slate-600 hover:bg-slate-500"
                  }`}
              />
            ))}
          </div>

          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page === totalPages - 1}
            className="p-0.5 rounded hover:bg-cyan-950/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>
      )}
    </Panel>
  );
}
