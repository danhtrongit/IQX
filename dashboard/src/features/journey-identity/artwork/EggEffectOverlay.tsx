import { clampLevel } from "../config"

const nodes = [[240, 164], [354, 230], [312, 356], [168, 356], [126, 230]] as const

/** Lightweight semantic effects remain code-driven so the generated poster is
 * never mistaken for live journey or Bot data. */
export function EggEffectOverlay({ level, accent, idPrefix: id }: { level: number; accent: string; idPrefix: string }) {
  const n = clampLevel(level)
  return <g data-artwork="egg-effect-overlay" data-egg-effect={n} aria-hidden="true">
    <defs>
      <linearGradient id={`${id}-warm`}><stop stopColor="#fff5bd" /><stop offset=".5" stopColor="#e0b64d" /><stop offset="1" stopColor={accent} /></linearGradient>
      <filter id={`${id}-effect-glow`} x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="2" /><feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge></filter>
    </defs>
    <ellipse cx="240" cy="441" rx="122" ry="13" fill="none" stroke={accent} strokeWidth="1.4" opacity=".45" />
    {n === 0 && <g fill="none" stroke={accent} opacity=".72" filter={`url(#${id}-effect-glow)`}>
      <ellipse data-part="egg-orbit-a" data-pivot-x="240" data-pivot-y="270" cx="240" cy="270" rx="155" ry="61" transform="rotate(24 240 270)" />
      <ellipse data-part="egg-orbit-b" data-pivot-x="240" data-pivot-y="270" cx="240" cy="270" rx="154" ry="60" transform="rotate(-27 240 270)" />
    </g>}
    {n === 1 && <g filter={`url(#${id}-effect-glow)`}>
      <path d="M219 233L240 262L261 233M219 233H261" fill="none" stroke={accent} strokeWidth="1" opacity=".45" />
      {[[219,233], [261,233], [240,272]].map(([x,y], i) => <g key={i} data-part="egg-core-node" data-node-index={i}><circle cx={x} cy={y} r="7" fill={accent} opacity=".35" /><circle cx={x} cy={y} r="3" fill="#fff" /></g>)}
    </g>}
    {n === 2 && <g filter={`url(#${id}-effect-glow)`}>
      <ellipse cx="240" cy="270" rx="132" ry="116" fill="none" stroke={accent} strokeWidth="1" opacity=".28" />
      {nodes.map(([x,y], i) => <g key={i} data-part="egg-node" data-node-index={i}><circle cx={x} cy={y} r="8" fill={accent} opacity=".28" /><circle cx={x} cy={y} r="3.5" fill="#fff" /></g>)}
    </g>}
    {n === 3 && <g fill="none" filter={`url(#${id}-effect-glow)`}>
      <ellipse cx="240" cy="270" rx="160" ry="55" stroke={`url(#${id}-warm)`} strokeWidth="1.2" strokeDasharray="2 8" />
      <path data-part="egg-radar" data-pivot-x="240" data-pivot-y="270" d="M240 270L395 270" stroke="#ffe9a7" strokeWidth="2.2" />
      <circle data-part="egg-blip" data-node-index="0" cx="338" cy="249" r="5" fill="#fff7c7" stroke="#e0b64d" strokeWidth="2" />
      <circle data-part="egg-blip" data-node-index="1" cx="159" cy="292" r="4" fill="#fff7c7" stroke="#e0b64d" strokeWidth="2" />
    </g>}
    {/* C4–C6 posters already contain their exact two flows, one segmented
        orbit, or two wisps. Do not duplicate those authored counts here. */}
  </g>
}
