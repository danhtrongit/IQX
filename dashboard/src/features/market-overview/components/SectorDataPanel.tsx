import { useState, useMemo } from "react"
import { Skeleton } from "@arco-design/web-react"
import { IconLeft, IconRight } from "@arco-design/web-react/icon"
import { Panel } from "./Panel"
import { changeColor, formatVND } from "../utils"
import { useSectorData } from "../hooks"
import { useSelectedSector } from "./SectorContext"
import { IconLayers } from "../icons"

const ITEMS_PER_PAGE = 6

const labelStyle: Record<string, string> = {
  "Dẫn sóng": "bg-up/20 text-up",
  "Hút tiền": "bg-blue-900/50 text-blue-300",
  "Tích lũy": "bg-yellow-900/50 text-yellow-300",
  "Phân phối": "bg-down/20 text-down",
  "Hồi kỹ thuật": "bg-purple-900/50 text-purple-300",
  "Suy yếu": "bg-[var(--color-fill-2)] text-[var(--color-text-3)]",
}

function SectorSkeletons() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="px-2.5 py-2.5 bg-[var(--color-fill-2)] rounded-md border border-[var(--color-border-2)]">
          <Skeleton animation text={{ rows: 1 }} image={false} />
        </div>
      ))}
    </div>
  )
}

export function SectorDataPanel() {
  const { data: sectorData, loading } = useSectorData()
  const { selectedSectorCode, setSelectedSectorCode } = useSelectedSector()
  const [page, setPage] = useState(0)
  const source = loading ? "mock" : "live"

  const sortedData = useMemo(
    () => [...sectorData].sort((a, b) => (b.totalValueVnd || 0) - (a.totalValueVnd || 0)),
    [sectorData],
  )

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(sortedData.length / ITEMS_PER_PAGE)),
    [sortedData.length],
  )

  const pageData = useMemo(
    () => sortedData.slice(page * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE + ITEMS_PER_PAGE),
    [sortedData, page],
  )

  return (
    <Panel title="Dữ liệu ngành" source={source} icon={<IconLayers className="text-[rgb(var(--primary-6))]" />}>
      <div className="flex items-center gap-2 px-2.5 py-1.5 mb-1 border-b border-[var(--color-border-2)]">
        <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--color-text-3)] flex-1 min-w-0">
          Ngành
        </span>
        <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--color-text-3)] shrink-0 min-w-[50px] text-right">
          Hiệu suất
        </span>
        <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--color-text-3)] shrink-0 min-w-[55px] text-right">
          GTGD
        </span>
        <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--color-text-3)] shrink-0 min-w-[56px] text-right">
          Nhãn
        </span>
      </div>

      {loading ? (
        <SectorSkeletons />
      ) : sortedData.length === 0 ? (
        <div className="text-[11px] text-[var(--color-text-3)] italic py-4 text-center">
          Không có dữ liệu ngành.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {pageData.map((s) => {
            const isSelected = selectedSectorCode === s.code
            return (
              <div
                key={s.code}
                onClick={() => setSelectedSectorCode(isSelected ? null : s.code)}
                className={`flex items-center gap-2 px-2.5 py-2.5 bg-[var(--color-fill-2)] rounded-md border cursor-pointer transition-all duration-150 ${
                  isSelected
                    ? "border-[rgb(var(--primary-6))] bg-[var(--color-primary-light-1)] ring-1 ring-[rgb(var(--primary-6))]/30"
                    : "border-[var(--color-border-2)] hover:border-[var(--color-border-3)] hover:bg-[var(--color-fill-1)]"
                }`}
              >
                <span className="text-[11px] font-semibold text-[var(--color-text-1)] flex-1 min-w-0 truncate">
                  {s.name}
                </span>
                <span
                  className={`text-[10px] font-semibold tabular-nums shrink-0 min-w-[50px] text-right ${changeColor(s.change)}`}
                >
                  {s.change > 0 ? "+" : ""}
                  {Math.round(s.change)}%
                </span>
                <span className="text-[10px] tabular-nums shrink-0 min-w-[55px] text-right text-[var(--color-text-2)]">
                  {s.totalValueVnd > 0 ? formatVND(s.totalValueVnd) : "—"}
                </span>
                <span
                  className={`text-[8px] px-1.5 py-px leading-tight font-bold rounded-sm shrink-0 ${
                    labelStyle[s.label] || "bg-[var(--color-fill-2)] text-[var(--color-text-3)]"
                  }`}
                >
                  {s.label}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2 mt-1 border-t border-[var(--color-border-2)]">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="p-0.5 rounded hover:bg-[var(--color-fill-1)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <IconLeft className="text-[var(--color-text-3)] text-sm" />
          </button>
          <div className="flex items-center gap-1.5">
            {Array.from({ length: totalPages }).map((_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                className={`w-1.5 h-1.5 rounded-full transition-all duration-200 ${
                  i === page ? "bg-[rgb(var(--primary-6))] scale-125" : "bg-[var(--color-fill-3)] hover:bg-[var(--color-text-4)]"
                }`}
              />
            ))}
          </div>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page === totalPages - 1}
            className="p-0.5 rounded hover:bg-[var(--color-fill-1)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <IconRight className="text-[var(--color-text-3)] text-sm" />
          </button>
        </div>
      )}
    </Panel>
  )
}
