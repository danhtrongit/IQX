interface StatCell {
  label: string
  value: string
  sub?: string
  tone?: "up" | "down"
}

interface StatGridProps {
  cells: StatCell[]
  cols?: 2 | 4
}

export function StatGrid({ cells, cols = 4 }: StatGridProps) {
  const gridClass = cols === 2 ? "stat-grid c2" : "stat-grid"
  return (
    <div className={gridClass}>
      {cells.map((cell, i) => (
        <div key={i} className="stat">
          <div className="k">{cell.label}</div>
          <div className={cell.tone ? `v ${cell.tone}` : "v"}>{cell.value}</div>
          {cell.sub != null && <div className="sub">{cell.sub}</div>}
        </div>
      ))}
    </div>
  )
}
