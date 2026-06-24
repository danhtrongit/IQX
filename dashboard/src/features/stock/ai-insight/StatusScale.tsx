const LEVEL_COLORS: Record<number, string> = {
  1: 'var(--bear-deep)',
  2: 'var(--bear)',
  3: 'var(--text-1)',
  4: 'var(--bull)',
  5: 'var(--bull-deep)',
}

interface StatusScaleProps {
  level: 1 | 2 | 3 | 4 | 5
}

export function StatusScale({ level }: StatusScaleProps) {
  return (
    <span
      role="img"
      aria-label={`bậc ${level} trên 5`}
      style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }}
    >
      {([1, 2, 3, 4, 5] as const).map((n) => {
        const isActive = n === level
        return (
          <span
            key={n}
            data-seg={n}
            data-active={isActive ? 'true' : 'false'}
            style={{
              display: 'inline-block',
              width: 14,
              height: 4,
              background: isActive ? LEVEL_COLORS[level] : 'var(--bg-3)',
              borderRadius: 2,
            }}
          />
        )
      })}
    </span>
  )
}
