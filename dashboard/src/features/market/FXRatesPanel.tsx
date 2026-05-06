import { Panel } from "./Panel";
import { useFXRates } from "./hooks";
import { changeColor } from "./utils";
import {
  TerminalTable,
  TTHead,
  TTH,
  TTRow,
  TTD,
} from "./TerminalTable";
import { DollarSign } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function FXRatesPanel() {
  const { data: rates, source, loading } = useFXRates();

  return (
    <Panel
      title="Tỷ giá"
      source={source}
      icon={<DollarSign size={14} className="text-cyan-300" />}
    >
      {loading && rates.length === 0 ? (
        <div className="space-y-2 p-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-5 w-full rounded" />
          ))}
        </div>
      ) : rates.length === 0 ? (
        <div className="text-center text-slate-400 text-xs py-8">
          Không có dữ liệu tỷ giá.
        </div>
      ) : (
        <TerminalTable>
          <TTHead>
            <tr>
              <TTH align="left">Ngoại tệ</TTH>
              <TTH>Hôm nay</TTH>
              <TTH>Hôm qua</TTH>
              <TTH>Chênh lệch</TTH>
            </tr>
          </TTHead>
          <tbody>
            {rates.map((r) => {
              const numericChange = r.changeNumeric ?? 0;
              return (
                <TTRow key={r.currency}>
                  <TTD align="left" className="font-bold text-slate-100">
                    {r.currency}
                  </TTD>
                  <TTD className="font-semibold text-slate-100">
                    {r.today}
                  </TTD>
                  <TTD className="font-medium text-slate-300">
                    {r.yesterday}
                  </TTD>
                  <TTD className={`font-bold ${changeColor(numericChange)}`}>
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
