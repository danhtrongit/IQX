import type { CandleChartProps } from "../candle-chart"

/** Biểu đồ giả: mỗi nến là một nút (chạm theo chỉ số), kèm vùng tô, nhãn và lớp phủ để kiểm tra. */
export function FakeCandleChart({ bars, bands = [], tags = [], onTapBar, overlay, fadeFrom, dimTo, nums, slots, volume, "aria-label": label }: CandleChartProps) {
  const scale = { x: (index: number) => index * 10, y: (price: number) => price, barWidth: 6, width: 500, height: 200 }
  return (
    <div
      data-testid="chart"
      role="img"
      aria-label={label}
      data-bars={bars.length}
      data-slots={slots ?? bars.length}
      data-volume={volume ? "1" : "0"}
      data-fade-from={fadeFrom ?? ""}
      data-dim-to={dimTo ?? ""}
      data-nums={JSON.stringify(nums ?? [])}
      data-bands={JSON.stringify(bands)}
      data-tags={JSON.stringify(tags)}
    >
      {onTapBar
        ? bars.map((_, index) => <button key={index} type="button" aria-label={`Nến ${index}`} onClick={() => onTapBar(index)} />)
        : null}
      <svg>{overlay ? overlay(scale) : null}</svg>
    </div>
  )
}
