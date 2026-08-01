import "./cap0.css"
import type { BadgeOptions, Cap0Level } from "./types"

/**
 * Level colour table — spec §12 (Cấp 0-5, the "mạch nền tảng"), EXTENDED as the
 * theme levels ship. The evolving hexagon: the edge glows brighter, the core
 * fills denser, rays appear from level 4, glow at level 5+.
 *
 * Cấp 6 «Đối chiếu» (đỏ son `#d64550`, fill=6) is the first theme level — spec
 * `IQX-Cap6-Spec.md` §0/§1 — followed by Cấp 7 «Đọc sổ lệnh» (hồng magenta
 * `#c65cae`, fill=7 — `IQX-Cap7-Spec.md` §1) and Cấp 8 «Quản trị rủi ro danh
 * mục» (xanh lá `#3f9b5a`, fill=8 — `IQX-Cap8-Spec.md` §1), the LAST level of
 * the current program. Each cấp also declares its own hex inside its own CSS
 * (there is no single colour map); this table is only what the shared `Badge`
 * needs.
 *
 * ★ This array IS the 0-8 rail (`JourneyPanelCap8`'s huy-hiệu rail renders it in
 * order, and `iqx-badges.html` — the roadmap's §D "mockup chuẩn" for the rail —
 * uses exactly these colours). Adding a level here adds a rail cell; nothing
 * else needs a second colour table.
 */
export const LEVELS: Cap0Level[] = [
  { n: 0, name: "Nhập môn", color: "#8a90a5", fill: 0 },
  { n: 1, name: "Học việc", color: "#c97b4a", fill: 1 },
  { n: 2, name: "Kỷ luật", color: "#7dd3c0", fill: 2 },
  { n: 3, name: "Bản lĩnh", color: "#4f8ff7", fill: 3 },
  { n: 4, name: "Thuần thục", color: "#a78bfa", fill: 4 },
  { n: 5, name: "Lão luyện", color: "#e0b64d", fill: 5 },
  { n: 6, name: "Đối chiếu", color: "#d64550", fill: 6 },
  { n: 7, name: "Đọc sổ lệnh", color: "#c65cae", fill: 7 },
  { n: 8, name: "Quản trị rủi ro danh mục", color: "#3f9b5a", fill: 8 },
]

/**
 * Render one evolving-hexagon badge → SVG string. Ported VERBATIM from spec §12
 * `badge(o)` — geometry, opacities and props are unchanged; only the JSDoc is
 * re-typed for TS.
 */
export function badge(o: BadgeOptions): string {
  const s = o.size || 96,
    c = s / 2,
    R = s * 0.34
  const col = o.color,
    fill = o.fill,
    ring = o.ring,
    glow = o.glow
  const pts: [number, number][] = []
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 3
    pts.push([c + R * Math.cos(a), c - R * Math.sin(a)])
  }
  const uid = "g" + Math.random().toString(36).slice(2, 7)

  let litEdges = ""
  for (let i = 0; i < 6; i++) {
    const p1 = pts[i],
      p2 = pts[(i + 1) % 6]
    const lit = i < Math.min(fill + 1, 6)
    litEdges += `<line x1="${p1[0].toFixed(1)}" y1="${p1[1].toFixed(1)}" x2="${p2[0].toFixed(1)}" y2="${p2[1].toFixed(1)}" stroke="${lit ? col : "#3a3f52"}" stroke-width="${lit ? 2.4 : 1.4}" stroke-linecap="round" opacity="${lit ? 1 : 0.6}"/>`
  }

  // Spec §12's table stops at fill=5 (Cấp 0-5). Entries are APPENDED for fill=6
  // (Cấp 6), fill=7 (Cấp 7) and fill=8 (Cấp 8) — indices 0-5 are byte-for-byte
  // the spec's, so every existing badge renders identically; without them
  // `coreOpacity` would be `undefined` and the gradient's stop-opacity would
  // render as `NaN` (an invisible badge — the exact bug Cấp 6 hit at fill=6,
  // Cấp 7 hit again at fill=7 and Cấp 8 hit again at fill=8).
  //
  // ★ ONE ENTRY PER LEVEL: this array must stay at least as long as `LEVELS`.
  const coreOpacity = [0, 0.1, 0.2, 0.34, 0.52, 0.9, 1, 1, 1][fill]
  const innerR = R * 0.56
  const innerPts: string[] = []
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 3
    innerPts.push((c + innerR * Math.cos(a)).toFixed(1) + "," + (c - innerR * Math.sin(a)).toFixed(1))
  }
  const showNum = o.showNum !== false

  let rays = ""
  if (fill >= 4) {
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 2 + (i * Math.PI) / 3 + Math.PI / 6
      const x1 = c + R * 1.05 * Math.cos(a),
        y1 = c - R * 1.05 * Math.sin(a)
      const x2 = c + R * 1.3 * Math.cos(a),
        y2 = c - R * 1.3 * Math.sin(a)
      // `fill >= 5` (was `fill === 5`) so Cấp 6 keeps the bright rays instead of
      // regressing to Cấp 4's dim ones. Identical output for fill 0-5.
      rays += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${col}" stroke-width="1.6" stroke-linecap="round" opacity="${fill >= 5 ? 0.9 : 0.5}"/>`
    }
  }

  let ringSvg = ""
  if (ring != null) {
    const rr = R * 1.5,
      cir = 2 * Math.PI * rr
    ringSvg = `<circle cx="${c}" cy="${c}" r="${rr}" fill="none" stroke="#2c3244" stroke-width="3"/>
    <circle cx="${c}" cy="${c}" r="${rr}" fill="none" stroke="${col}" stroke-width="3" stroke-linecap="round"
      stroke-dasharray="${cir}" stroke-dashoffset="${(cir * (1 - ring)).toFixed(1)}" transform="rotate(-90 ${c} ${c})"/>`
  }

  return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" style="display:block">
    <defs>
      <radialGradient id="${uid}c" cx="50%" cy="42%" r="60%">
        <stop offset="0%"   stop-color="${col}" stop-opacity="${Math.min(coreOpacity + 0.15, 1)}"/>
        <stop offset="100%" stop-color="${col}" stop-opacity="${coreOpacity * 0.5}"/>
      </radialGradient>
      ${glow ? `<filter id="${uid}g" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>` : ""}
    </defs>
    ${ringSvg}
    <g ${glow ? `filter="url(#${uid}g)"` : ""}>
      ${rays}
      <polygon points="${innerPts.join(" ")}" fill="url(#${uid}c)"/>
      ${litEdges}
      ${showNum ? `<text x="${c}" y="${c + 1}" text-anchor="middle" dominant-baseline="central"
        font-family="'Space Grotesk',sans-serif" font-weight="700" font-size="${s * 0.26}"
        fill="${fill >= 3 ? "#fff" : col}" opacity="${fill === 0 ? 0.6 : 1}">${o.n}</text>` : ""}
    </g>
  </svg>`
}

/**
 * React wrapper around `badge()`. Renders the ported SVG string via
 * `dangerouslySetInnerHTML` so the spec §12 geometry stays byte-for-byte
 * faithful (no JSX transcription risk). The inner content is a static SVG we
 * generate ourselves — no user input flows in.
 */
export function Badge(props: BadgeOptions) {
  return (
    <span
      className="cap0-badge"
      style={{ display: "inline-flex", lineHeight: 0 }}
      dangerouslySetInnerHTML={{ __html: badge(props) }}
    />
  )
}
