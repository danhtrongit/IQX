import { Panel } from "./Panel";
import { useBondYields } from "./hooks";
import { changeColor } from "./utils";
import {
  TerminalTable,
  TTHead,
  TTH,
  TTRow,
  TTD,
} from "./TerminalTable";
import { Landmark } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function BondYieldsPanel() {
  const { data: rows, source, loading } = useBondYields();

  return (
    <Panel
      title="Lãi suất TPCP"
      source={source}
      className="col-span-4"
      icon={<Landmark size={14} className="text-cyan-300" />}
    >
      {loading && rows.length === 0 ? (
        <div className="space-y-2 p-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-5 w-full rounded" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center text-slate-400 text-xs py-8">
          Không có dữ liệu lãi suất TPCP.
        </div>
      ) : (
        <TerminalTable>
          <TTHead>
            <tr>
              <TTH align="left">Kỳ hạn</TTH>
              <TTH>Hôm nay</TTH>
              <TTH>Hôm qua</TTH>
              <TTH>Chênh lệch Points</TTH>
            </tr>
          </TTHead>
          <tbody>
            {rows.map((r) => {
              // "-" means no change -> treat as zero for color
              const numericChange = r.changeNumeric ?? 0;
              const isNoChange = r.change === "-";
              return (
                <TTRow key={r.tenor}>
                  <TTD align="left" className="font-bold text-slate-100">
                    {r.tenor}
                  </TTD>
                  <TTD className="font-semibold text-slate-100">
                    {r.today}
                  </TTD>
                  <TTD className="font-medium text-slate-300">
                    {r.yesterday}
                  </TTD>
                  <TTD className={`font-bold ${isNoChange ? "text-yellow-300" : changeColor(numericChange)}`}>
                    {r.change}
                  </TTD>
                </TTRow>
              );
            })}
          </tbody>
        </TerminalTable>
      )}
    </Panel>
  );
}
