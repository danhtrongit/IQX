interface ChartBlockProps {
  title: string
  legend?: React.ReactNode
  children: React.ReactNode
}

export function ChartBlock({ title, legend, children }: ChartBlockProps) {
  return (
    <div className="chart-block">
      <div className="chart-block-title">{title}</div>
      <div className="chart-block-canvas">{children}</div>
      {legend && (
        <div className="chart-block-legend">{legend}</div>
      )}
    </div>
  )
}
