interface MaterialItem {
  title: string
  subtitle?: string
  tag: string
}

interface FillerItem {
  title: string
  tag: string
}

interface NewsListProps {
  material: MaterialItem[]
  filler: FillerItem[]
}

export function NewsList({ material, filler }: NewsListProps) {
  return (
    <div className="news-list">
      {/* Material news */}
      <div className="news-material">
        {material.map((item, i) => (
          <div
            key={i}
            className="news-item"
            style={{
              borderBottom: i < material.length - 1
                ? '1px dotted var(--border-soft)'
                : undefined,
            }}
          >
            <div className="news-item-body">
              <span className="news-title">{item.title}</span>
              {item.subtitle && (
                <small className="news-subtitle">{item.subtitle}</small>
              )}
            </div>
            <span className="news-tag">{item.tag}</span>
          </div>
        ))}
      </div>

      {/* Filler news — omit entirely when empty */}
      {filler.length > 0 && (
        <div className="news-filler-list">
          {filler.map((item, i) => (
            <span key={i} className="filler-item">
              {item.title}
              <span className="filler-tag">{item.tag}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
