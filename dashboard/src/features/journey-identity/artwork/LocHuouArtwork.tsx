/** Layered vector reconstruction of the approved cream-and-gold deer. */
export function LocHuouArtwork({ idPrefix }: { idPrefix: string }) {
  const paint = (name: string) => `url(#${idPrefix}-${name})`
  return <g>
    <defs>
      <radialGradient id={`${idPrefix}-fur`} cx=".31" cy=".21" r=".8"><stop stopColor="#fffcf4" /><stop offset=".28" stopColor="#fff3e1" /><stop offset=".54" stopColor="#ead6bb" /><stop offset=".78" stopColor="#c6b49f" /><stop offset="1" stopColor="#a69389" /></radialGradient>
      <radialGradient id={`${idPrefix}-face`} cx=".36" cy=".25" r=".78"><stop stopColor="#fffdf7" /><stop offset=".3" stopColor="#fff8ed" /><stop offset=".55" stopColor="#f3e7da" /><stop offset=".79" stopColor="#d6c5bb" /><stop offset="1" stopColor="#ac9ca0" /></radialGradient>
      <linearGradient id={`${idPrefix}-tuft`} x1=".2" y1="0" x2=".85" y2="1"><stop stopColor="#ffffff" /><stop offset=".42" stopColor="#fff9ef" /><stop offset=".8" stopColor="#ecdbc4" /><stop offset="1" stopColor="#c8ae8c" /></linearGradient>
      <linearGradient id={`${idPrefix}-horn`} x1="0" y1="0" x2="1" y2=".7"><stop stopColor="#774726" /><stop offset=".19" stopColor="#bf8645" /><stop offset=".43" stopColor="#ffdfa2" /><stop offset=".59" stopColor="#efc485" /><stop offset=".81" stopColor="#b67734" /><stop offset="1" stopColor="#80512e" /></linearGradient>
      <linearGradient id={`${idPrefix}-ear`} x1="0" y1="0" x2=".8" y2="1"><stop stopColor="#805237" /><stop offset=".24" stopColor="#c89358" /><stop offset=".7" stopColor="#f6cd91" /><stop offset="1" stopColor="#fff2d2" /></linearGradient>
      <radialGradient id={`${idPrefix}-blush`}><stop stopColor="#efa995" stopOpacity=".65" /><stop offset=".58" stopColor="#f6c2ac" stopOpacity=".32" /><stop offset="1" stopColor="#ffdcca" stopOpacity="0" /></radialGradient>
      <linearGradient id={`${idPrefix}-scarf`} x1="0" y1="0" x2=".4" y2="1"><stop stopColor="#3864a3" /><stop offset=".28" stopColor="#244679" /><stop offset=".62" stopColor="#153563" /><stop offset="1" stopColor="#071d40" /></linearGradient>
      <linearGradient id={`${idPrefix}-scarf-fold`} x1="0" y1="0" x2="1" y2=".8"><stop stopColor="#5781b6" /><stop offset=".37" stopColor="#244676" /><stop offset="1" stopColor="#0a234b" /></linearGradient>
      <radialGradient id={`${idPrefix}-eye`} cx=".32" cy=".23" r=".85"><stop stopColor="#9d713d" /><stop offset=".55" stopColor="#573c23" /><stop offset=".87" stopColor="#221b1b" /><stop offset="1" stopColor="#111019" /></radialGradient>
      <radialGradient id={`${idPrefix}-iris`} cx=".35" cy=".3" r=".78"><stop stopColor="#f7d290" /><stop offset=".45" stopColor="#b58343" /><stop offset=".76" stopColor="#77502b" /><stop offset="1" stopColor="#2f2220" /></radialGradient>
      <linearGradient id={`${idPrefix}-mouth`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#5b2a25" /><stop offset=".5" stopColor="#88392c" /><stop offset="1" stopColor="#b85b4e" /></linearGradient>
      <linearGradient id={`${idPrefix}-gem`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#f7feff" /><stop offset=".25" stopColor="#a8e5f4" /><stop offset=".61" stopColor="#5da9cf" /><stop offset="1" stopColor="#214d7c" /></linearGradient>
      <filter id={`${idPrefix}-soft`} x="-.2" y="-.2" width="1.4" height="1.4"><feDropShadow dx="0" dy="3" stdDeviation="2.8" floodColor="#6b4a31" floodOpacity=".18" /></filter>
      <filter id={`${idPrefix}-gem-glow`} x="-.6" y="-.5" width="2.2" height="2"><feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#bcdeed" floodOpacity=".45" /></filter>
    </defs>
    <g data-part="tail" data-pivot-x="191" data-pivot-y="389" filter={paint("soft")}>
      <path d="M201 388C192 363 169 335 143 337C125 337 112 347 113 362C121 349 135 349 144 358C130 367 126 380 134 394C146 415 174 421 194 408Z" fill={paint("fur")} />
      <path d="M146 355C138 362 140 371 135 378L145 376L139 389L150 385L153 398L160 389C169 402 181 404 193 401C179 409 159 406 151 397C141 388 144 372 153 367Z" fill={paint("horn")} opacity=".94" />
      <path d="M117 360C124 345 138 343 150 350M136 398C148 412 170 416 186 411" fill="none" stroke="#fffdf0" strokeWidth="3" strokeLinecap="round" opacity=".7" />
      <path d="M152 346Q161 355 163 365M161 350Q169 359 171 368M169 357L179 373" fill="none" stroke="#fff9e8" strokeWidth="1.3" opacity=".7" />
    </g>
    <g filter={paint("soft")}>
      <path d="M221 323C201 332 186 351 187 376C177 391 180 412 192 421C208 436 230 435 245 429C264 438 290 432 301 415C312 399 304 377 299 363C293 342 271 329 250 324Z" fill={paint("fur")} />
      <ellipse cx="245" cy="377" rx="41" ry="47" fill={paint("face")} />
      <path d="M194 400C183 413 185 434 196 439C204 442 222 440 227 433L226 415Z" fill={paint("fur")} />
      <path d="M270 404C265 415 266 435 276 439C288 443 307 440 307 431C306 419 297 408 291 404Z" fill={paint("fur")} />
      <path d="M207 407C199 418 199 435 207 440C216 446 235 442 237 435L236 414Z" fill={paint("face")} />
      <path d="M201 434L202 440M211 435L212 442M221 435L221 441M281 433L282 440M291 433L292 440M299 431L301 437" stroke="#a78b69" strokeWidth="2.1" strokeLinecap="round" />
      <path d="M190 382C193 371 197 367 201 364M194 390L200 380M291 389L297 398M223 409Q231 414 240 413" fill="none" stroke="#fff8e7" strokeWidth="1.7" opacity=".65" />
    </g>
    <g data-part="left-arm" data-pivot-x="215" data-pivot-y="356" filter={paint("soft")}>
      <path d="M211 345C197 348 194 367 198 380C200 390 210 401 222 400C230 400 235 394 233 388C224 383 224 370 230 358Z" fill={paint("face")} />
      <path d="M201 359C198 370 202 386 211 391" fill="none" stroke="#fffef4" strokeWidth="3" strokeLinecap="round" opacity=".75" />
      <path d="M219 391L222 398M225 389L228 395" stroke="#b89970" strokeWidth="1.5" strokeLinecap="round" />
    </g>
    <g data-part="right-arm" data-pivot-x="292" data-pivot-y="355" filter={paint("soft")}>
      <path d="M280 352C289 341 302 338 310 329L315 317C316 312 323 311 325 318C326 310 333 312 333 319C338 313 344 318 340 325C347 322 350 329 344 334C343 343 332 353 322 361C307 373 287 372 280 362Z" fill={paint("face")} />
      <path d="M288 352C299 349 304 344 310 339" fill="none" stroke="#fffdf2" strokeWidth="3" strokeLinecap="round" opacity=".75" />
      <ellipse cx="325" cy="331" rx="5" ry="6" fill="#cda676" transform="rotate(25 325 331)" />
      <ellipse cx="319" cy="319" rx="2.8" ry="3.6" fill="#b89567" /><ellipse cx="330" cy="318" rx="2.5" ry="3.4" fill="#b89567" /><ellipse cx="339" cy="325" rx="2.5" ry="3.1" fill="#b89567" />
    </g>
    <path d="M200 327C225 336 265 338 295 327L297 348C280 360 249 365 220 357L202 346Z" fill={paint("scarf")} filter={paint("soft")} />
    <path d="M204 332C232 342 273 343 293 333" fill="none" stroke="#7593bb" strokeWidth="2.5" opacity=".75" />
    <path d="M246 352L258 371L274 350C264 358 254 359 246 352Z" fill={paint("scarf-fold")} />
    <path d="M206 344Q217 352 226 350M281 353L291 346" stroke="#0c264d" strokeWidth="2" fill="none" opacity=".6" />
    <text x="249" y="353" textAnchor="middle" fill="#f7fbff" fontFamily="Arial, sans-serif" fontWeight="600" fontSize="15" letterSpacing="1">IQX</text>
    <g filter={paint("gem-glow")}>
      <path d="M252 367L266 382L253 403L239 384Z" fill="#c69758" /><path d="M252 371L263 383L253 399L242 384Z" fill={paint("gem")} />
      <path d="M252 371L251 384L242 384Z" fill="#effeff" /><path d="M252 371L263 383L251 384Z" fill="#a5d4e7" /><path d="M251 384L253 399L263 383Z" fill="#3f7fa9" /><path d="M251 384L242 384L253 399Z" fill="#9ed5e4" />
      <path d="M251 372L251 384L253 398" stroke="#ebfaff" strokeWidth=".9" fill="none" />
    </g>
    <g data-part="head" data-pivot-x="251" data-pivot-y="327">
      <g filter={paint("soft")}>
        <path d="M191 205C173 183 146 178 124 176C124 201 130 226 151 240C166 250 184 244 194 232Z" fill={paint("fur")} />
        <path d="M132 184C148 185 173 194 182 212L170 236C149 232 138 215 132 184Z" fill={paint("ear")} />
        <path d="M306 199C327 180 351 174 376 177C374 202 367 225 347 238C331 247 313 239 306 227Z" fill={paint("fur")} />
        <path d="M366 185C347 188 327 198 319 215L331 236C352 229 363 210 366 185Z" fill={paint("ear")} />
        <path d="M138 203Q146 222 165 231M356 199Q348 220 334 229" fill="none" stroke="#fff4d8" strokeWidth="4" opacity=".8" strokeLinecap="round" />
        <path d="M198 196C194 176 185 160 170 151C156 145 141 143 134 133C128 124 127 113 132 106C137 101 141 111 142 120C145 128 151 131 156 131C150 112 154 91 163 79C168 72 175 73 176 79C176 87 169 93 167 106C164 121 168 131 174 138L182 143C183 129 184 113 193 111C203 109 204 121 199 133C193 148 199 158 207 171L216 192Z" fill={paint("horn")} />
        <path d="M292 194C296 176 304 162 307 150C308 139 297 128 300 118C303 111 310 114 313 121L320 139C330 128 335 112 335 98C336 87 329 78 334 72C342 65 350 87 351 99C353 115 347 129 346 132C358 127 361 117 364 110C367 103 374 104 376 111C378 123 368 137 357 143C344 148 331 155 322 169L309 197Z" fill={paint("horn")} />
        <path d="M169 80C158 102 159 125 170 143C186 154 198 173 202 190M134 111Q132 130 151 136M192 116Q184 136 190 148M337 78C344 99 341 120 331 139Q311 156 302 189M370 111Q367 132 348 138" fill="none" stroke="#ffe8b8" strokeWidth="2.3" strokeLinecap="round" opacity=".67" />
      </g>
      <g transform="translate(251 0) scale(1.2 1) translate(-251 0)">
      <path d="M177 215C179 193 200 176 225 175C247 167 279 173 298 184C319 192 329 211 332 235L341 251L335 251L345 267L336 267L345 280L333 283L339 293L327 294L330 303L317 304C304 321 280 330 252 332C225 333 196 326 178 315L165 315L171 307L156 303L165 295L151 289L164 285L152 277L165 273L155 263L168 262L162 250L174 250C170 238 172 227 177 215Z" fill={paint("face")} filter={paint("soft")} />
      <path d="M183 226C183 207 201 187 223 184M306 203C319 213 324 229 324 241" stroke="#fffff5" strokeWidth="4" fill="none" opacity=".7" strokeLinecap="round" />
      <path d="M215 192C215 178 223 168 236 162C229 174 241 177 249 176C245 167 247 160 252 155C254 170 269 169 277 181C285 191 280 208 270 223C265 212 255 207 248 203C243 211 233 213 230 209C236 201 219 199 215 192Z" fill={paint("tuft")} filter={paint("soft")} />
      <path d="M235 170C229 184 249 185 251 199M250 166C252 182 271 190 269 213M220 187Q224 198 237 202" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" fill="none" opacity=".75" />
      <ellipse cx="191" cy="286" rx="27" ry="18" fill={paint("blush")} /><ellipse cx="316" cy="283" rx="25" ry="17" fill={paint("blush")} />
      <path d="M197 228Q207 223 215 228M302 226Q310 223 317 228" stroke="#d7b68d" strokeWidth="4.5" strokeLinecap="round" fill="none" opacity=".6" />
      <g data-part="eyes-open" data-pivot-x="256" data-pivot-y="255">
        <path d="M195 255C196 234 214 231 228 240C239 250 237 270 224 278C207 284 195 271 195 255Z" fill="#fffdf7" />
        <path d="M192 253C196 237 213 231 227 239M195 248L189 243M197 242L193 236" fill="none" stroke="#432d25" strokeWidth="4.4" strokeLinecap="round" />
        <g data-part="pupils" data-pivot-x="218" data-pivot-y="256"><ellipse cx="217.5" cy="257" rx="17.3" ry="22.4" fill={paint("eye")} /><ellipse cx="220" cy="259" rx="12.3" ry="17" fill={paint("iris")} /><ellipse cx="219" cy="256" rx="7.5" ry="12.5" fill="#241c18" /><ellipse cx="211.5" cy="246.5" rx="6.1" ry="7.7" fill="#ffffff" /><circle cx="225.5" cy="262" r="3.2" fill="#fffaf0" opacity=".9" /><path d="M211 272Q220 278 228 269" stroke="#e9bc74" strokeWidth="1.4" fill="none" opacity=".75" /></g>
        <path d="M290 264C300 250 316 251 327 263" fill="none" stroke="#412b25" strokeWidth="6.2" strokeLinecap="round" /><path d="M323 259L330 254M326 262L333 260" stroke="#412b25" strokeWidth="2.4" strokeLinecap="round" /><path d="M296 251Q311 245 322 252" stroke="#d5bfa6" strokeWidth="2" fill="none" opacity=".55" />
      </g>
      <g data-part="eyes-closed" opacity="0" data-pivot-x="256" data-pivot-y="255" fill="none" stroke="#412b25" strokeLinecap="round"><path d="M196 263Q214 248 232 263M290 264Q307 248 327 263" strokeWidth="5.7" /><path d="M199 259L191 255M324 260L331 255" strokeWidth="2.3" /></g>
      <path d="M233 282C243 275 267 275 279 281C288 287 285 300 276 303L244 304C234 301 227 291 233 282Z" fill="#fffaf0" opacity=".95" />
      <path d="M247 282Q255 278 263 283C263 287 258 289 255 290C251 289 247 286 247 282Z" fill="#a2724c" /><path d="M250 282Q255 280 259 283" stroke="#d7b48a" strokeWidth="1.3" fill="none" />
      <g data-part="mouth-open" data-pivot-x="255" data-pivot-y="304"><path d="M235 295C246 300 266 301 279 293C275 312 267 320 255 320C246 319 239 312 235 295Z" fill={paint("mouth")} /><path d="M237 296Q247 302 255 301L251 306Q243 306 239 303Z" fill="#fffdf4" /><path d="M245 316C248 307 262 307 269 313C265 321 254 324 245 316Z" fill="#e99583" /><path d="M250 312Q258 310 264 313" stroke="#ffc0a5" strokeWidth="1.4" fill="none" /></g>
      <g data-part="mouth-closed" opacity="0" data-pivot-x="255" data-pivot-y="300"><path d="M238 295Q254 308 273 296" fill="none" stroke="#98634d" strokeWidth="2.7" strokeLinecap="round" /></g>
      <g fill="none" strokeLinecap="round" opacity=".72"><path d="M173 265L183 269M169 278L181 280M174 292L186 293M185 304L197 306M314 288L328 282M310 303L321 298" stroke="#fffef6" strokeWidth="1.6" /><path d="M180 252L183 244M189 216L195 209M302 208L310 216M211 315L219 318M289 319L296 315" stroke="#e7d4b8" strokeWidth="1.1" /><path d="M141 201L146 208M146 206L153 213M154 212L160 217M352 202L346 208M348 211L341 217" stroke="#fff6dd" strokeWidth="1.5" /></g>
      </g>
    </g>
  </g>
}
