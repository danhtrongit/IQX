import dayjs from 'dayjs'
import 'dayjs/locale/vi'

dayjs.locale('vi')

interface MastheadProps {
  updatedAt: string
}

/**
 * Masthead — AI Insight v2 brand header.
 * §4.3.1: logo "AI Insight" (serif, gold) + tag "Bản tin cổ phiếu" + date/timestamp.
 */
export function Masthead({ updatedAt }: MastheadProps) {
  const d = dayjs(updatedAt)
  // e.g. "Thứ Sáu, 19/06/2026 · 10:38"
  const formattedDate = d.format('dddd, DD/MM/YYYY · HH:mm')
  // Capitalise first char (Vietnamese weekday may be lowercase from dayjs locale)
  const dateLabel = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1)

  return (
    <header className="masthead">
      <div className="masthead-brand">
        <span className="logo serif">AI Insight</span>
        <span className="tag">Bản tin cổ phiếu</span>
      </div>
      <time className="masthead-date num" dateTime={updatedAt}>
        {dateLabel}
      </time>
    </header>
  )
}
