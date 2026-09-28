/** Mint plush turtle with a sculpted, tiled shell and independently posed limbs. */
export function KimQuyArtwork({ idPrefix }: { idPrefix: string }) {
  const paint = (name: string) => `url(#${idPrefix}-${name})`
  return <g>
    <defs>
      <radialGradient id={`${idPrefix}-skin`} cx=".29" cy=".19" r=".8"><stop stopColor="#fffef0" /><stop offset=".3" stopColor="#eaf3df" /><stop offset=".61" stopColor="#c4d7b9" /><stop offset=".82" stopColor="#a6baa0" /><stop offset="1" stopColor="#718f7e" /></radialGradient>
      <radialGradient id={`${idPrefix}-face`} cx=".32" cy=".29" r=".79"><stop stopColor="#fffdf3" /><stop offset=".35" stopColor="#f3f8e9" /><stop offset=".59" stopColor="#dae7d4" /><stop offset=".82" stopColor="#b7cbb8" /><stop offset="1" stopColor="#84a395" /></radialGradient>
      <linearGradient id={`${idPrefix}-cap`} x1=".2" y1="0" x2=".5" y2="1"><stop stopColor="#b4d8c5" /><stop offset=".56" stopColor="#d3e9d7" /><stop offset="1" stopColor="#d4e8d7" stopOpacity="0" /></linearGradient>
      <radialGradient id={`${idPrefix}-belly`} cx=".39" cy=".21" r=".87"><stop stopColor="#fff8df" /><stop offset=".55" stopColor="#e9e2c8" /><stop offset="1" stopColor="#b4b89d" /></radialGradient>
      <radialGradient id={`${idPrefix}-shell`} cx=".32" cy=".21" r=".82"><stop stopColor="#a9d5aa" /><stop offset=".35" stopColor="#77a980" /><stop offset=".67" stopColor="#477e61" /><stop offset="1" stopColor="#1b453e" /></radialGradient>
      <linearGradient id={`${idPrefix}-plate`} x1="0" y1="0" x2="1" y2=".8"><stop stopColor="#9dc997" /><stop offset=".28" stopColor="#75aa7d" /><stop offset=".7" stopColor="#468162" /><stop offset="1" stopColor="#245a49" /></linearGradient>
      <linearGradient id={`${idPrefix}-rim`} x1=".1" y1="0" x2=".9" y2="1"><stop stopColor="#f1f2ca" /><stop offset=".22" stopColor="#c6dcb1" /><stop offset=".6" stopColor="#97bb91" /><stop offset=".84" stopColor="#688f75" /><stop offset="1" stopColor="#c1cea0" /></linearGradient>
      <linearGradient id={`${idPrefix}-leaf`} x1=".15" y1=".1" x2=".8" y2="1"><stop stopColor="#e1f7b8" /><stop offset=".26" stopColor="#9ad496" /><stop offset=".65" stopColor="#65aa7c" /><stop offset="1" stopColor="#346f58" /></linearGradient>
      <linearGradient id={`${idPrefix}-scarf`} x1="0" y1="0" x2=".4" y2="1"><stop stopColor="#456b9b" /><stop offset=".35" stopColor="#234778" /><stop offset=".67" stopColor="#16355c" /><stop offset="1" stopColor="#081b36" /></linearGradient>
      <radialGradient id={`${idPrefix}-eye`} cx=".25" cy=".2" r=".88"><stop stopColor="#607665" /><stop offset=".44" stopColor="#283e36" /><stop offset=".82" stopColor="#0d1d1c" /><stop offset="1" stopColor="#11141a" /></radialGradient>
      <radialGradient id={`${idPrefix}-iris`} cx=".35" cy=".4" r=".75"><stop stopColor="#aee3ce" /><stop offset=".36" stopColor="#66baa4" /><stop offset=".72" stopColor="#378673" /><stop offset="1" stopColor="#1d5148" /></radialGradient>
      <radialGradient id={`${idPrefix}-blush`}><stop stopColor="#e6aea1" stopOpacity=".65" /><stop offset=".58" stopColor="#f2c6b5" stopOpacity=".35" /><stop offset="1" stopColor="#f9dcd0" stopOpacity="0" /></radialGradient>
      <linearGradient id={`${idPrefix}-mouth`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#65342f" /><stop offset=".65" stopColor="#974d43" /><stop offset="1" stopColor="#b36e60" /></linearGradient>
      <linearGradient id={`${idPrefix}-gem`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#e0ffe4" /><stop offset=".33" stopColor="#a8e2bd" /><stop offset=".66" stopColor="#62b195" /><stop offset="1" stopColor="#2d7468" /></linearGradient>
      <filter id={`${idPrefix}-soft`} x="-.2" y="-.2" width="1.4" height="1.4"><feDropShadow dx="0" dy="3" stdDeviation="2.5" floodColor="#234635" floodOpacity=".19" /></filter>
      <filter id={`${idPrefix}-glow`} x="-.5" y="-.5" width="2" height="2"><feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#c8efc9" floodOpacity=".45" /></filter>
    </defs>

    <g filter={paint("soft")}>
      <path d="M171 233C176 201 211 180 249 177C289 173 327 199 348 235C365 264 374 307 375 337C377 352 383 358 391 360C389 373 373 381 359 376C351 373 342 364 337 356L292 400L204 388L158 314Z" fill={paint("rim")} />
      <path d="M181 236C187 206 216 190 250 187C285 184 316 204 338 237C354 263 364 306 365 338C361 349 353 354 344 350L299 389L207 382L169 311Z" fill={paint("shell")} />
      <path d="M262 192C282 191 300 201 314 213L305 238L275 248L248 227Z" fill={paint("plate")} stroke="#3e7258" strokeWidth="2.2" />
      <path d="M314 215C330 230 342 250 349 271L326 284L307 264L307 239Z" fill={paint("plate")} stroke="#356950" strokeWidth="2.2" />
      <path d="M279 250L305 242L326 268L323 302L295 317L270 295Z" fill={paint("plate")} stroke="#2c634e" strokeWidth="2.5" />
      <path d="M349 276C357 297 359 323 359 338L341 345L324 319L328 286Z" fill={paint("plate")} stroke="#285b49" strokeWidth="2.4" />
      <path d="M294 321L322 307L339 346L319 369L290 363L277 341Z" fill={paint("plate")} stroke="#2a5f4b" strokeWidth="2.2" />
      <path d="M268 297L290 317L274 340L241 335L231 310Z" fill={paint("plate")} stroke="#376d53" strokeWidth="2.1" />
      <path d="M185 231C199 204 226 191 253 190M266 196Q292 199 306 213M314 246L324 265M284 253L302 249M331 290L346 283M303 326L319 317" fill="none" stroke="#d9ebbb" strokeWidth="2.2" opacity=".7" strokeLinecap="round" />
      <path d="M185 219C222 173 284 183 321 220C352 249 367 296 367 337M369 353Q378 366 386 362" fill="none" stroke="#edf3cf" strokeWidth="3.5" opacity=".7" strokeLinecap="round" />
      <path d="M253 178L252 189M274 179L270 191M295 185L288 197M315 196L307 207M334 212L325 224M349 234L340 243M361 260L352 265M369 290L359 293M373 320L363 321M375 341L365 343" fill="none" stroke="#4e7e65" strokeWidth="2.6" opacity=".57" />
      <path d="M226 184Q242 178 258 181" stroke="#ffffe2" strokeWidth="2" fill="none" opacity=".85" />
    </g>
    <g data-part="sprout" data-pivot-x="279" data-pivot-y="183" filter={paint("soft")}>
      <path d="M277 184Q285 168 277 153" fill="none" stroke="#619c74" strokeWidth="5" strokeLinecap="round" />
      <path d="M280 161C264 160 247 149 249 137C260 124 282 134 286 148C289 155 286 160 280 161Z" fill={paint("leaf")} />
      <path d="M282 168C288 151 309 143 324 150C323 164 302 178 287 173Z" fill={paint("leaf")} />
      <path d="M253 137Q266 140 280 157M286 168Q301 160 319 152" fill="none" stroke="#d8efbc" strokeWidth="1.7" opacity=".9" strokeLinecap="round" />
      <path d="M265 145L265 137M274 150L279 145M299 162L296 154M307 158L313 163" fill="none" stroke="#bbdfa9" strokeWidth=".8" opacity=".7" />
    </g>

    <g filter={paint("soft")}>
      <path d="M198 330C177 348 173 379 184 403C196 423 222 432 248 429C277 432 307 419 316 397C324 374 307 346 281 334Z" fill={paint("skin")} />
      <path d="M199 352C217 339 260 340 281 355C294 368 293 397 280 412C262 428 225 427 205 414C189 401 186 370 199 352Z" fill={paint("belly")} />
      <path d="M198 370Q241 386 286 370M199 390Q241 405 286 390M218 350L214 374L218 397L225 422M263 349L269 375L264 397L259 423" fill="none" stroke="#a5ad8d" strokeWidth="1.4" opacity=".47" />
      <path d="M205 364Q236 375 277 364M207 386Q240 396 279 386" fill="none" stroke="#fff9e3" strokeWidth="1.3" opacity=".6" />
      <path d="M183 391C173 401 171 424 179 435C185 441 207 440 214 434C220 425 212 407 205 398Z" fill={paint("skin")} />
      <path d="M302 390C315 389 330 400 335 415C340 425 339 436 329 439L305 438C295 434 292 418 296 402Z" fill={paint("skin")} />
      <path d="M181 433L184 438M191 433L192 440M201 432L202 439M310 433L310 439M320 433L321 440M329 431L332 437" stroke="#6c947b" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M178 409Q178 400 187 397M316 404Q328 411 329 421" fill="none" stroke="#eff8dd" strokeWidth="3" strokeLinecap="round" opacity=".7" />
    </g>
    <g data-part="left-arm" data-pivot-x="183" data-pivot-y="356" filter={paint("soft")}>
      <path d="M190 350C178 348 167 346 160 340C160 334 156 330 152 335L151 341C146 335 140 337 142 344C135 341 133 346 137 351C135 357 141 367 151 374C164 385 181 384 190 373Z" fill={paint("skin")} />
      <path d="M144 351C147 362 159 372 170 372" fill="none" stroke="#eff7de" strokeWidth="2.9" opacity=".7" strokeLinecap="round" />
      <path d="M147 343L145 350M155 339L154 346" stroke="#7fa185" strokeWidth="1.4" strokeLinecap="round" />
    </g>
    <g data-part="right-arm" data-pivot-x="291" data-pivot-y="354" filter={paint("soft")}>
      <path d="M286 345C277 353 272 369 272 384C267 398 275 412 287 416C299 422 313 412 318 399C324 381 318 358 303 348Z" fill={paint("skin")} />
      <path d="M284 354C276 367 279 384 276 390" fill="none" stroke="#f4fbe9" strokeWidth="3.8" strokeLinecap="round" opacity=".65" />
      <ellipse cx="307" cy="395" rx="4.4" ry="6" fill="#8cae91" transform="rotate(20 307 395)" /><ellipse cx="297" cy="407" rx="3.8" ry="5.5" fill="#8cae91" transform="rotate(20 297 407)" /><ellipse cx="284" cy="407" rx="3.5" ry="4.4" fill="#7c9e83" />
      <path d="M293 367L298 374M289 376L293 382M297 381L300 386" stroke="#b0d2b2" strokeWidth="1.2" fill="none" strokeLinecap="round" />
    </g>

    <path d="M174 333C207 349 262 351 301 331L302 353C274 372 215 372 182 353Z" fill={paint("scarf")} filter={paint("soft")} />
    <path d="M178 339C211 352 263 356 298 339" stroke="#7897b8" strokeWidth="2.6" opacity=".65" fill="none" />
    <path d="M215 362L226 382L249 365C237 370 224 367 215 362Z" fill={paint("scarf")} />
    <path d="M183 346Q193 355 207 355M281 357L296 346" fill="none" stroke="#0b2644" strokeWidth="1.8" />
    <text x="234" y="361" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="600" fontSize="16" fill="#f7fbff" letterSpacing="1">IQX</text>
    <g filter={paint("glow")}>
      <path d="M231 374L249 393L233 416L215 395Z" fill="#c7d9bb" /><path d="M231 378L245 393L233 412L219 395Z" fill={paint("gem")} />
      <path d="M231 378L232 394L219 395Z" fill="#e6ffe8" /><path d="M231 378L245 393L232 394Z" fill="#a5dfb6" /><path d="M232 394L245 393L233 412Z" fill="#3f997f" /><path d="M219 395L232 394L233 412Z" fill="#89cbb1" /><path d="M231 379L232 394L233 410" fill="none" stroke="#f3ffeb" strokeWidth="1" />
    </g>

    <g data-part="head" data-pivot-x="234" data-pivot-y="342">
      <g transform="translate(234 0) scale(1.08 1) translate(-234 0)">
      <path d="M162 222C180 196 211 184 243 190C273 191 302 212 313 242C324 265 324 295 312 319C297 343 269 353 235 352C204 354 170 343 152 322C137 303 137 274 144 252C148 239 154 230 162 222Z" fill={paint("face")} filter={paint("soft")} />
      <path d="M160 226C186 187 238 181 275 203C296 215 307 235 310 258C287 237 265 227 239 228C210 224 181 231 146 256C149 243 152 235 160 226Z" fill={paint("cap")} />
      <path d="M163 224C185 199 216 191 239 195" fill="none" stroke="#f5fbe5" strokeWidth="3.8" strokeLinecap="round" opacity=".8" />
      <path d="M274 215Q296 230 301 248" fill="none" stroke="#dceede" strokeWidth="2.2" opacity=".68" strokeLinecap="round" />
      <g fill="#8bbcad" opacity=".76">
        <path d="M222 201Q229 196 236 201L235 209Q228 213 222 208Z" /><path d="M238 204Q245 201 250 207L248 215Q241 218 237 213Z" />
        <path d="M216 211Q221 208 226 212L225 219Q218 222 215 217Z" /><path d="M229 216Q237 212 241 219L237 226Q230 228 226 223Z" /><path d="M218 226Q223 223 226 228L223 234Q217 235 216 231Z" /><ellipse cx="240" cy="232" rx="3" ry="4.1" />
      </g>
      <ellipse cx="166" cy="305" rx="24" ry="18" fill={paint("blush")} /><ellipse cx="301" cy="311" rx="24" ry="17" fill={paint("blush")} />
      <path d="M166 248Q175 240 184 246M280 247Q288 241 295 248" stroke="#7caa95" strokeWidth="4.5" strokeLinecap="round" fill="none" opacity=".85" />
      <g data-part="eyes-open" data-pivot-x="233" data-pivot-y="276">
        <path d="M160 272C159 253 171 244 184 249C199 252 204 268 200 282C195 297 181 305 170 297C163 291 161 283 160 272Z" fill="#fffef2" />
        <path d="M159 268C161 250 176 242 190 251" fill="none" stroke="#29453c" strokeWidth="4.7" strokeLinecap="round" />
        <g data-part="pupils" data-pivot-x="182" data-pivot-y="276"><ellipse cx="182" cy="275" rx="17.5" ry="25" fill={paint("eye")} /><ellipse cx="184" cy="279" rx="12.2" ry="18.4" fill={paint("iris")} /><ellipse cx="181" cy="273" rx="8.1" ry="13.7" fill="#122b27" /><ellipse cx="176" cy="261" rx="6.4" ry="8.4" fill="#ffffff" /><circle cx="190" cy="281" r="3.3" fill="#e8fff3" /><path d="M176 293Q186 298 193 285" fill="none" stroke="#9bd6b4" strokeWidth="1.5" opacity=".8" /></g>
        <path d="M262 286C272 272 289 273 300 286" fill="none" stroke="#263c34" strokeWidth="6.5" strokeLinecap="round" /><path d="M296 282L303 278" stroke="#263c34" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M268 275Q281 269 292 276" fill="none" stroke="#a8c4ae" strokeWidth="2" opacity=".65" />
      </g>
      <g data-part="eyes-closed" opacity="0" data-pivot-x="233" data-pivot-y="276" fill="none" stroke="#263c34" strokeLinecap="round"><path d="M161 282Q179 267 198 282M262 286Q280 270 300 286" strokeWidth="5.8" /><path d="M166 278L158 274M296 282L303 278" strokeWidth="2.3" /></g>
      <ellipse cx="227" cy="306" rx="26" ry="17" fill="#fcf9eb" opacity=".63" />
      <ellipse cx="218" cy="299" rx="1.5" ry="1" fill="#b2b79d" /><ellipse cx="229" cy="300" rx="1.4" ry="1" fill="#b2b79d" />
      <g data-part="mouth-open" data-pivot-x="226" data-pivot-y="322"><path d="M208 313C218 318 234 318 245 312C241 327 234 334 225 334C217 333 211 326 208 313Z" fill={paint("mouth")} /><path d="M209 314Q220 319 230 317L228 321Q217 324 212 320Z" fill="#fff8e9" /><path d="M218 330C222 321 233 322 238 327C232 335 224 337 218 330Z" fill="#e7a398" /><path d="M222 327Q229 325 233 328" stroke="#ffcabc" strokeWidth="1.2" fill="none" /></g>
      <g data-part="mouth-closed" opacity="0" data-pivot-x="226" data-pivot-y="321"><path d="M208 313Q225 326 244 313" fill="none" stroke="#8c7660" strokeWidth="2.4" strokeLinecap="round" /></g>
      <path d="M146 281Q144 297 153 308M166 323Q181 336 201 338M268 339Q291 333 304 318" stroke="#ffffef" strokeWidth="1.8" fill="none" opacity=".6" strokeLinecap="round" />
      <path d="M150 273L152 267M156 264L159 258M307 276L309 286M286 337L281 340" stroke="#bad5bd" strokeWidth="1" fill="none" opacity=".55" strokeLinecap="round" />
      </g>
    </g>
  </g>
}
