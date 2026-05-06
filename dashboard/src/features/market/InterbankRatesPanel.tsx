import { Panel } from "./Panel";
import { useInterbankRates } from "./hooks";
import { changeColor } from "./utils";
import {
  TerminalTable,
  TTHead,
  TTH,
  TTRow,
  TTD,
} from "./TerminalTable";
import { Percent } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function InterbankRatesPanel() {
  const { data: rates, source, loading } = useInterbankRates();

  return (
    <Panel
      title="Lãi suất VND liên ngân hàng"
      source={source}
      icon={<Percent size={14} className="text-cyan-300" />}
      headerRight={
        <span className="text-[11px] font-bold text-cyan-300">%</span>
      }
    >
      {loading && rates.length === 0 ? (
        <div className="space-y-2 p-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-5 w-full rounded" />
          ))}
        </div>
      ) : rates.length === 0 ? (
        <div className="text-center text-slate-400 text-xs py-8">
          Không có dữ liệu lãi suất VND.
        </div>
      ) : (
        <TerminalTable>
          <TTHead>
            <tr>
              <TTH align="left">Kỳ hạn</TTH>
              <TTH>Hôm nay</TTH>
              <TTH>Hôm qua</TTH>
              <TTH>Chênh lệch %</TTH>
            </tr>
          </TTHead>
          <tbody>
            {rates.map((r) => (
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
                <TTD className={`font-bold ${changeColor(r.changeNumeric ?? 0)}`}>
                  {r.change}
                </TTD>
              </TTRow>
            ))}
          </tbody>
        </TerminalTable>
      )}
    </Panel>
  );
}
