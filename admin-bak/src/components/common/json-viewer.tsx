import { cn } from "@/lib/utils"

interface JsonViewerProps {
  data: unknown
  className?: string
  maxHeight?: string
}

function JsonNode({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === null) {
    return <span className="text-gray-400">null</span>
  }
  if (typeof value === "boolean") {
    return <span className={value ? "text-green-500" : "text-red-500"}>{String(value)}</span>
  }
  if (typeof value === "number") {
    return <span className="text-blue-400">{value}</span>
  }
  if (typeof value === "string") {
    return <span className="text-amber-400">"{value}"</span>
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-foreground">[]</span>
    return (
      <span>
        <span className="text-foreground">{"["}</span>
        <div style={{ paddingLeft: (depth + 1) * 16 }}>
          {value.map((item, i) => (
            <div key={i}>
              <JsonNode value={item} depth={depth + 1} />
              {i < value.length - 1 && <span className="text-muted-foreground">,</span>}
            </div>
          ))}
        </div>
        <span className="text-foreground">{"]"}</span>
      </span>
    )
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) return <span className="text-foreground">{"{}"}</span>
    return (
      <span>
        <span className="text-foreground">{"{"}</span>
        <div style={{ paddingLeft: (depth + 1) * 16 }}>
          {entries.map(([key, val], i) => (
            <div key={key}>
              <span className="text-purple-400">"{key}"</span>
              <span className="text-muted-foreground">: </span>
              <JsonNode value={val} depth={depth + 1} />
              {i < entries.length - 1 && <span className="text-muted-foreground">,</span>}
            </div>
          ))}
        </div>
        <span className="text-foreground">{"}"}</span>
      </span>
    )
  }
  return <span className="text-muted-foreground">{String(value)}</span>
}

export function JsonViewer({ data, className, maxHeight = "400px" }: JsonViewerProps) {
  return (
    <pre
      className={cn(
        "overflow-auto rounded-md bg-muted/60 p-3 font-mono text-xs leading-relaxed",
        className,
      )}
      style={{ maxHeight }}
    >
      <JsonNode value={data} />
    </pre>
  )
}
