import { clampLevel } from "../config"

// All surfaces are newly drawn geometry. Reference artwork is never sampled.
const SHELL = "M240 94C205 86 170 133 145 196C116 264 111 324 134 369C156 411 196 429 239 430C291 431 330 405 349 361C371 306 348 233 317 171C294 125 269 94 240 94Z"
const SEAM = "M102 285L136 278L155 288L176 274L195 290L217 278L236 290L258 278L278 293L298 276L318 289L341 277L376 287"
const BANDS = [
  "M239 96C291 110 268 145 238 164C208 184 167 186 149 224C130 265 143 313 158 346C177 384 211 399 240 427",
  "M249 96C307 119 276 155 246 174C216 193 172 200 159 239C146 277 159 324 173 347C191 375 228 400 246 426",
  "M307 162C333 211 336 247 301 274C265 302 230 309 220 344C210 375 227 403 245 427",
  "M315 179C337 222 344 257 310 285C281 309 244 316 233 349C224 377 237 406 250 425",
]
function Star({ x, y, size = 5, color = "#fff8e7" }: { x: number; y: number; size?: number; color?: string }) {
  return <path d={`M${x} ${y-size}Q${x+1} ${y-1} ${x+size} ${y}Q${x+1} ${y+1} ${x} ${y+size}Q${x-1} ${y+1} ${x-size} ${y}Q${x-1} ${y-1} ${x} ${y-size}Z`} fill={color} />
}
function Crystal({ x, y, size, rotate, id }: { x: number; y: number; size: number; rotate: number; id: string }) {
  return <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${size})`}>
    <path d="M0 -10L6 -3L4 8L-3 10L-6 2Z" fill={`url(#${id}-gold)`} stroke="#ffe5b3" strokeWidth=".55" />
    <path d="M0 -10L0 1L6 -3M0 1L4 8M0 1L-3 10M0 1L-6 2" fill="none" stroke="#fff2ce" strokeWidth=".7" />
    <path d="M0 -9L0 1L-5 2Z" fill="#fff9ed" opacity=".8" />
  </g>
}
export function EggArtwork({ level, accent, idPrefix: id }: { level: number; accent: string; idPrefix: string }) {
  const n = clampLevel(level), ornate = n >= 4, cracks = n >= 4
  const facets = Array.from({ length: 132 }, (_, i) => {
    const row = Math.floor(i / 12), x = 112 + i % 12 * 21 + row % 2 * 9, y = 106 + row * 29 + i * 7 % 11, w = 12 + i * 11 % 15
    return <path key={i} d={`M${x} ${y}l${w} ${-5-i%7}l${7-i%4} ${18+i%9}l${-w+3} ${12-i%5}l-11 -10Z`}
      fill={["#fffdf7", "#dec8ff", "#8451d2", "#efe9ff", "#b69bdf", "#cab0ee"][i % 6]} opacity={[.25, .2, .32, .35, .24][i % 5]} />
  })
  const surface = <g>
    <path d={SHELL} fill={`url(#${id}-pearl)`} />
    <g clipPath={`url(#${id}-shell-clip)`}>
      <path d="M230 84C206 131 253 145 205 192C180 218 174 230 179 266C163 281 140 303 168 337C175 356 176 387 226 420L130 450L74 235L197 67Z" fill={`url(#${id}-amethyst)`} />
      <path d="M267 138C277 184 262 185 281 217C307 253 287 278 271 306C250 343 311 378 266 421L338 404L383 291L329 167Z" fill={`url(#${id}-amethyst)`} opacity=".66" />
      {facets}
      <path d={SHELL} fill={`url(#${id}-volume)`} />
      <path d="M274 129C295 162 317 204 316 239C315 255 308 271 296 273C285 270 283 250 286 234C292 196 269 155 274 129Z" fill="#fff9ef" opacity=".67" filter={`url(#${id}-soft)`} />
      {Array.from({length: 64}, (_, i) => <ellipse key={`grain-${i}`} cx={136+i*31%205} cy={143+i*59%253} rx={2+i%3} ry={3+i%4} fill="#fff9fc" opacity={.18+i%3*.1} transform={`rotate(${i*17} ${136+i*31%205} ${143+i*59%253})`} />)}
      <g fill="none" stroke="#fff5ff" opacity=".3" strokeWidth="1.3">
        <path d="M172 152L187 176L170 193L189 218L176 239L192 260L170 287L186 309L173 330L193 350L189 376M291 179L276 201L294 219L278 244L303 259L284 284L305 307L285 327L306 350L283 378" />
        <path d="M134 279L154 274L176 281M143 325L162 316L179 328M269 346L287 338L311 344M258 146L266 162L288 168" />
      </g>
      <path d="M275 121C292 140 306 177 313 208C320 230 303 250 285 252C274 244 273 224 269 215C257 192 273 169 264 149Z" fill="#fffef7" opacity=".57" filter={`url(#${id}-soft)`} />
      <path d="M227 112C190 119 163 173 149 219M329 288C346 343 310 400 271 410" fill="none" stroke="#ffe2fc" strokeWidth="7" opacity=".7" filter={`url(#${id}-soft)`} />
      {BANDS.map((d, i) => <g key={d}>
        <path d={d} fill="none" stroke="#74402f" strokeWidth={i % 2 ? 3 : 8.5} opacity=".55" transform="translate(1.5 2)" />
        <path d={d} fill="none" stroke={`url(#${id}-gold)`} strokeWidth={i % 2 ? 3 : 7} />
        <path d={d} fill="none" stroke="#fff8d4" strokeWidth={i % 2 ? .75 : 1.5} transform="translate(-1 -1)" />
      </g>)}
      {cracks && <g data-part="egg-crack" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M302 139L300 161L307 179L300 194L308 211L298 230L304 245L292 259M176 345L184 359L176 374L187 389L185 411" stroke="#693d39" strokeWidth="2" />
        <path d="M303 139L301 161L308 179L301 194L309 211L299 230L305 245L293 259M177 345L185 359L177 374L188 389L186 411" stroke="#ffde88" strokeWidth="1" />
        {ornate && <><path d="M237 308L226 323L229 338L213 352L218 371L206 382M260 323L275 342L271 361L281 377L278 393L293 409M155 232L164 247L158 261L170 274L166 293" stroke="#79403a" strokeWidth="3" />
          <path d="M238 308L227 323L230 338L214 352L219 371L207 382M261 323L276 342L272 361L282 377L279 393L294 409M156 232L165 247L159 261L171 274L167 293" stroke="#ffce71" strokeWidth="1.6" /></>}
      </g>}
      {Array.from({ length: 27 }, (_, i) => <Star key={i} x={143 + i * 43 % 188} y={140 + i * 71 % 258} size={i % 6 === 0 ? 6 : 1.7} color={i % 3 ? "#fff8ef" : "#ffcffb"} />)}
    </g>
    <path d={SHELL} fill="none" stroke={`url(#${id}-rim)`} strokeWidth="2.7" />
    <g data-part="egg-jewel" data-pivot-x="240" data-pivot-y="247">
      <path d="M240 183L282 245L240 311L198 247Z" fill="#935330" stroke="#e9a253" strokeWidth="2" />
      <path d="M240 188L277 246L240 305L203 247Z" fill={`url(#${id}-gold)`} />
      <path d="M240 200L268 247L240 294L212 247Z" fill={`url(#${id}-jewel)`} stroke="#fff0ac" strokeWidth="1.3" />
      <path d="M240 202L239 247L213 247ZM267 247L239 247L240 294Z" fill="#e6acff" opacity=".8" />
      <path d="M240 202L252 234L239 247L229 230ZM239 247L251 262L240 294L229 264Z" fill="#fff4ff" opacity=".53" />
      <path d="M213 247L229 230L252 234L267 247L251 262L229 264Z" fill="none" stroke="#e6c2ff" strokeWidth=".8" />
      <ellipse cx="240" cy="247" rx={ornate ? 28 : 20} ry={ornate ? 39 : 28} fill={`url(#${id}-heart)`} />
      <Star x={240} y={247} size={ornate ? 25 : 19} color="#fff9ff" />
      <path d="M219 247H262M240 224V271" stroke="white" strokeWidth=".8" opacity=".9" />
    </g>
  </g>
  return <g data-artwork="recreated-egg" data-egg-level={n}>
    <defs>
      <clipPath id={`${id}-shell-clip`}><path d={SHELL} /></clipPath>
      <clipPath id={`${id}-top-clip`}><path d={`${SEAM}L400 60H80Z`} /></clipPath>
      <clipPath id={`${id}-bottom-clip`}><path d={`${SEAM}L400 470H80Z`} /></clipPath>
      <radialGradient id={`${id}-volume`} cx="67%" cy="35%" r="69%"><stop stopColor="#fffdf8" stopOpacity=".34" /><stop offset=".4" stopColor="#fffdfb" stopOpacity=".08" /><stop offset=".7" stopColor="#421764" stopOpacity=".08" /><stop offset=".85" stopColor="#371653" stopOpacity=".5" /><stop offset=".96" stopColor="#8545af" stopOpacity=".25" /><stop offset="1" stopColor="#f0c9ff" stopOpacity=".2" /></radialGradient>
      <radialGradient id={`${id}-pearl`} cx="68%" cy="26%" r="77%"><stop stopColor="#fffef5" /><stop offset=".26" stopColor="#f3e6fa" /><stop offset=".48" stopColor="#dbc8f0" /><stop offset=".71" stopColor="#ab84d6" /><stop offset=".9" stopColor="#ecc9e9" /><stop offset="1" stopColor="#8655b5" /></radialGradient>
      <linearGradient id={`${id}-amethyst`} x1="0" y1="0" x2="1" y2=".7"><stop stopColor="#e2b9ff" /><stop offset=".23" stopColor="#8750d0" /><stop offset=".54" stopColor="#dfc5ff" /><stop offset=".82" stopColor="#7850be" /><stop offset="1" stopColor="#f5d8ff" /></linearGradient>
      <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="1" y2=".45"><stop stopColor="#6f3522" /><stop offset=".18" stopColor="#e2933a" /><stop offset=".34" stopColor="#fff4b8" /><stop offset=".48" stopColor="#dc8131" /><stop offset=".68" stopColor="#ffdf8c" /><stop offset=".82" stopColor="#fff7d4" /><stop offset="1" stopColor="#b45322" /></linearGradient>
      <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#ffe2f5" /><stop offset=".22" stopColor="#fffce0" /><stop offset=".55" stopColor="#ffbd86" /><stop offset=".78" stopColor="#fff3fb" /><stop offset="1" stopColor="#d393fb" /></linearGradient>
      <radialGradient id={`${id}-jewel`}><stop stopColor="#fff2ff" /><stop offset=".23" stopColor="#e4a3ff" /><stop offset=".58" stopColor="#a35cff" /><stop offset="1" stopColor="#583aaf" /></radialGradient>
      <radialGradient id={`${id}-heart`}><stop stopColor="#fff" /><stop offset=".24" stopColor="#ffd9ff" stopOpacity=".95" /><stop offset=".61" stopColor="#d279ff" stopOpacity=".55" /><stop offset="1" stopColor="#bf73ff" stopOpacity="0" /></radialGradient>
      <radialGradient id={`${id}-aura`}><stop stopColor="#d991ff" stopOpacity=".26" /><stop offset=".63" stopColor="#ae6afa" stopOpacity=".09" /><stop offset="1" stopColor="#703afb" stopOpacity="0" /></radialGradient>
      <radialGradient id={`${id}-floor`}><stop stopColor="#fff1fe" /><stop offset=".2" stopColor="#c48eff" stopOpacity=".9" /><stop offset=".53" stopColor="#9c51ff" stopOpacity=".33" /><stop offset="1" stopColor="#7942c9" stopOpacity="0" /></radialGradient>
      <linearGradient id={`${id}-violet`}><stop stopColor="#9c59ff" /><stop offset=".5" stopColor="#ffccff" /><stop offset="1" stopColor="#a870ff" /></linearGradient>
      <linearGradient id={`${id}-blue`}><stop stopColor="#076bff" /><stop offset=".48" stopColor="#bff9ff" /><stop offset=".7" stopColor="#42a8ff" /><stop offset="1" stopColor="#498aff" /></linearGradient>
      <filter id={`${id}-soft`} x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="4" /></filter>
      <filter id={`${id}-glow`} x="-50%" y="-100%" width="200%" height="300%"><feGaussianBlur stdDeviation="2.2" /><feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge></filter>
    </defs>
    <g data-part="egg-effects">
      <ellipse cx="240" cy="267" rx="203" ry="213" fill={`url(#${id}-aura)`} />
      <ellipse cx="240" cy="442" rx="166" ry="28" fill={`url(#${id}-floor)`} />
      {[164, 151, 130, 112, 89].map((r, i) => <ellipse key={r} cx="240" cy="442" rx={r} ry={r * .125} fill="none" stroke={i < 2 ? `url(#${id}-gold)` : i % 2 ? "#eee2ff" : "#9d69ff"} strokeWidth={i === 4 ? 2 : 1.1} opacity={i < 2 ? .7 : .95} filter={i === 4 ? `url(#${id}-glow)` : undefined} />)}
      <ellipse cx="240" cy="435" rx="60" ry="8" fill={`url(#${id}-floor)`} />
      {Array.from({ length: 10 }, (_, i) => <g key={i} opacity={.35 + i % 4 * .16} filter={i % 7 === 0 ? `url(#${id}-glow)` : undefined}><Star x={63 + i * 73 % 354} y={104 + i * 47 % 308} size={i % 7 === 0 ? 5 : i % 3 === 0 ? 2.5 : 1} color={i % 3 === 0 ? "#ffba67" : "#ce9bff"} /></g>)}
    </g>
    <ellipse data-part="egg-core" cx="240" cy="272" rx="129" ry="160" fill={`url(#${id}-heart)`} opacity="0" />
    <g data-part="egg-shell-bottom" data-pivot-x="240" data-pivot-y="280" clipPath={`url(#${id}-bottom-clip)`}>{surface}</g>
    <g data-part="egg-shell-top" data-pivot-x="240" data-pivot-y="280" clipPath={`url(#${id}-top-clip)`}>{surface}</g>
    <g data-part="egg-level-effect" data-pivot-x="240" data-pivot-y="270">
      {n === 0 && <g fill="none" stroke={`url(#${id}-violet)`} opacity=".72" filter={`url(#${id}-glow)`}>
        <ellipse data-part="egg-orbit-a" data-pivot-x="240" data-pivot-y="270" cx="240" cy="270" rx="149" ry="105" transform="rotate(32 240 270)" />
        <ellipse data-part="egg-orbit-b" data-pivot-x="240" data-pivot-y="270" cx="240" cy="270" rx="150" ry="103" transform="rotate(-31 240 270)" />
      </g>}
      {n === 1 && <g data-part="egg-core-cluster" filter={`url(#${id}-glow)`}>
        <path d="M220 229L240 247L260 229M220 229L240 276L260 229" fill="none" stroke={accent} strokeWidth="1" opacity=".42" />
        {[[220,229], [260,229], [240,276]].map(([x,y], i) => <g key={i} data-part="egg-core-node" data-node-index={i}>
          <circle cx={x} cy={y} r="7" fill={accent} opacity=".34" /><circle cx={x} cy={y} r="3" fill="#fff" />
        </g>)}
      </g>}
      {n === 2 && <g data-part="egg-node-ring" filter={`url(#${id}-glow)`}>
        <ellipse cx="240" cy="270" rx="148" ry="108" fill="none" stroke={accent} strokeWidth="1" opacity=".24" />
        {[[240,158], [372,238], [322,365], [158,365], [108,238]].map(([x,y], i) => <g key={i} data-part="egg-node" data-node-index={i}>
          <circle cx={x} cy={y} r="8" fill={accent} opacity=".28" /><circle cx={x} cy={y} r="3.5" fill="#fff" />
        </g>)}
      </g>}
      {n === 3 && <g data-part="egg-analysis-ring" fill="none" filter={`url(#${id}-glow)`}>
        <ellipse cx="240" cy="270" rx="163" ry="54" stroke={`url(#${id}-gold)`} strokeWidth="1.4" strokeDasharray="2 8" />
        <path data-part="egg-radar" data-pivot-x="240" data-pivot-y="270" d="M240 270L395 270" stroke="#ffe3a0" strokeWidth="2.4" />
        <circle data-part="egg-blip" data-node-index="0" cx="339" cy="247" r="5" fill="#fff7c7" stroke="#e0b64d" strokeWidth="2" />
        <circle data-part="egg-blip" data-node-index="1" cx="156" cy="294" r="4" fill="#fff7c7" stroke="#e0b64d" strokeWidth="2" />
      </g>}
      {n === 4 && <g data-part="egg-conflict-cross" fill="none" strokeWidth="2" filter={`url(#${id}-glow)`}>
        <ellipse data-part="egg-flow-a" data-pivot-x="240" data-pivot-y="280" cx="240" cy="280" rx="174" ry="43" transform="rotate(-32 240 280)" stroke={`url(#${id}-gold)`} />
        <ellipse data-part="egg-flow-b" data-pivot-x="240" data-pivot-y="280" cx="240" cy="280" rx="174" ry="40" transform="rotate(39 240 280)" stroke={`url(#${id}-blue)`} />
      </g>}
      {n === 5 && <g data-part="egg-balanced-orbit" fill="none" filter={`url(#${id}-glow)`}>
        <ellipse data-part="egg-segment-ring" data-pivot-x="240" data-pivot-y="270" cx="240" cy="270" rx="162" ry="49" stroke={`url(#${id}-gold)`} strokeWidth="3" strokeDasharray="30 12" />
        <ellipse cx="240" cy="270" rx="151" ry="43" stroke={accent} strokeWidth="1" strokeDasharray="16 12" opacity=".55" />
      </g>}
      {n === 6 && <g data-part="egg-pre-hatch" fill="none" filter={`url(#${id}-glow)`}>
        <path data-part="egg-wisp" data-node-index="0" d="M161 185C112 143 97 217 131 240C153 255 143 282 111 292" stroke="#e8b1ff" strokeWidth="2" strokeLinecap="round" />
        <path data-part="egg-wisp" data-node-index="1" d="M322 183C375 157 393 221 360 245C339 260 351 284 381 298" stroke="#ffd592" strokeWidth="2" strokeLinecap="round" />
        <ellipse cx="240" cy="280" rx="166" ry="44" transform="rotate(-9 240 280)" stroke={`url(#${id}-gold)`} strokeWidth="1.5" opacity=".72" />
      </g>}
      {(n >= 4 || n === 2) && [[95,202,.8,-24],[109,358,1.05,-17],[375,206,.85,14],[390,340,.65,24],[361,395,.9,38],[86,283,.55,17],[377,260,.6,-14]].map(([x,y,size,rotate], i) => <Crystal key={i} x={x} y={y} size={size} rotate={rotate} id={id} />)}
      <Star x={n === 1 ? 91 : 123} y={n === 1 ? 264 : 328} size={7} color="#fff2d2" />
    </g>
    <circle cx="240" cy="442" r="1" fill={accent} opacity="0" />
  </g>
}
