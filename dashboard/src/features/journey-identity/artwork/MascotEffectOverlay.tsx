import type { MascotId, MascotState } from "../types"

export function MascotEffectOverlay({ mascotId, state, accent, idPrefix: id }: { mascotId: MascotId; state: MascotState; accent: string; idPrefix: string }) {
  return <g data-artwork="mascot-effect-overlay" data-mascot-effect={state} aria-hidden="true">
    <defs><filter id={`${id}-mascot-glow`} x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="2.2" /><feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
    {state === "analyzing" && <g data-part="mascot-hologram" opacity=".75" filter={`url(#${id}-mascot-glow)`}>
      <ellipse cx={mascotId === "thanh_long" ? 100 : 370} cy="275" rx="48" ry="34" fill={accent} opacity=".09" stroke={accent} strokeWidth="1.2" />
      <path d={mascotId === "thanh_long" ? "M68 283L81 273L94 279L110 258L127 267" : "M338 283L351 273L364 279L380 258L397 267"} fill="none" stroke={accent} strokeWidth="2" />
      <circle cx={mascotId === "thanh_long" ? 100 : 370} cy="275" r="42" fill="none" stroke={accent} strokeWidth="1" strokeDasharray="7 10" />
    </g>}
    {state === "updated" && <g data-part="mascot-update-pulse" fill="none" stroke={accent} filter={`url(#${id}-mascot-glow)`}>
      <ellipse cx="240" cy="444" rx="112" ry="14" strokeWidth="2" />
      <path d="M364 245l8 8 16-19" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </g>}
    {state === "greet" && <path data-part="mascot-greet-trail" d="M337 226Q382 188 397 238" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" opacity=".75" filter={`url(#${id}-mascot-glow)`} />}
    {state === "tap_reaction" && <g data-part="mascot-tap-spark" fill={accent} filter={`url(#${id}-mascot-glow)`}><path d="M374 183l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" /></g>}
  </g>
}
