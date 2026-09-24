/** Newly drawn, articulated phoenix following the approved plush reference. */
export function PhungHoangArtwork({ idPrefix }: { idPrefix: string }) {
  const id = (name: string) => `${idPrefix}-phoenix-${name}`
  const fill = (name: string) => `url(#${id(name)})`
  return <g data-artwork="phung-hoang-vector">
    <defs>
      <radialGradient id={id("plumage")} cx="45%" cy="24%" r="70%"><stop stopColor="#fffff8" /><stop offset=".36" stopColor="#fff2dd" /><stop offset=".64" stopColor="#e5cdbb" /><stop offset=".85" stopColor="#c5abb0" /><stop offset="1" stopColor="#9e869d" /></radialGradient>
      <radialGradient id={id("face")} cx="55%" cy="27%" r="70%"><stop stopColor="#fffffc" /><stop offset=".34" stopColor="#fff7e9" /><stop offset=".62" stopColor="#f3e2d3" /><stop offset=".84" stopColor="#c8b4b6" /><stop offset="1" stopColor="#a18fa7" /></radialGradient>
      <radialGradient id={id("highlight")}><stop stopColor="#fffef5" stopOpacity=".83" /><stop offset=".6" stopColor="#fffdf4" stopOpacity=".3" /><stop offset="1" stopColor="#fff7e7" stopOpacity="0" /></radialGradient>
      <radialGradient id={id("blush")}><stop stopColor="#ef8b8c" stopOpacity=".67" /><stop offset=".5" stopColor="#f1a29c" stopOpacity=".33" /><stop offset="1" stopColor="#f5b8ab" stopOpacity="0" /></radialGradient>
      <linearGradient id={id("fire")} x1=".2" y1="1" x2=".74" y2="0"><stop stopColor="#983722" /><stop offset=".35" stopColor="#e25728" /><stop offset=".7" stopColor="#ffac50" /><stop offset="1" stopColor="#fff1a7" /></linearGradient>
      <linearGradient id={id("outer-feather")} x1=".76" y1=".7" x2=".2" y2="0"><stop stopColor="#ab3726" /><stop offset=".45" stopColor="#ef6130" /><stop offset=".8" stopColor="#ffba5b" /><stop offset="1" stopColor="#fff7c2" /></linearGradient>
      <linearGradient id={id("inner-feather")} x1=".1" y1="0" x2=".7" y2="1"><stop stopColor="#fffcea" /><stop offset=".45" stopColor="#ffe5ac" /><stop offset=".85" stopColor="#ffb978" /><stop offset="1" stopColor="#ce693f" /></linearGradient>
      <linearGradient id={id("crest")} x1=".8" y1="1" x2=".25" y2="0"><stop stopColor="#d77c3a" /><stop offset=".35" stopColor="#ffc369" /><stop offset=".65" stopColor="#ffb161" /><stop offset=".88" stopColor="#f47448" /><stop offset="1" stopColor="#fff4c0" /></linearGradient>
      <linearGradient id={id("gold")} x1=".18" y1="0" x2=".8" y2="1"><stop stopColor="#fff4bc" /><stop offset=".4" stopColor="#f7b851" /><stop offset=".75" stopColor="#d87a32" /><stop offset="1" stopColor="#ad5529" /></linearGradient>
      <linearGradient id={id("scarf")} x1=".2" y1="0" x2=".74" y2="1"><stop stopColor="#5780ca" /><stop offset=".25" stopColor="#2853a1" /><stop offset=".66" stopColor="#13336e" /><stop offset="1" stopColor="#0d2357" /></linearGradient>
      <linearGradient id={id("gem")} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fffbd5" /><stop offset=".35" stopColor="#ffc765" /><stop offset=".65" stopColor="#ff632e" /><stop offset="1" stopColor="#be3823" /></linearGradient>
      <filter id={id("soft-shadow")} x="-20%" y="-20%" width="140%" height="155%"><feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#814738" floodOpacity=".18" /></filter>
      <filter id={id("gem-glow")} x="-90%" y="-60%" width="280%" height="220%"><feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#ffad60" floodOpacity=".6" /></filter>
    </defs>

    <g data-part="tail" data-pivot-x="215" data-pivot-y="381" filter={fill("soft-shadow")}>
      <path d="M225 379C195 382 154 395 119 373C123 399 148 411 177 405C163 417 147 420 129 414C150 435 184 435 211 406Z" fill={fill("fire")} stroke="#ffc66f" strokeWidth="1.1" />
      <path d="M220 380C191 391 168 396 145 391C163 406 190 408 211 397C192 418 174 423 150 424C179 436 210 422 228 395Z" fill={fill("inner-feather")} />
      <path d="M214 387C190 402 179 414 163 419M203 385C185 396 169 397 150 393" fill="none" stroke="#fff6d6" strokeWidth="1.6" opacity=".7" />
    </g>

    <g data-part="left-wing" data-pivot-x="207" data-pivot-y="312" filter={fill("soft-shadow")}>
      <path d="M210 302C182 282 133 261 107 218C104 244 117 267 134 281L109 272C113 293 137 309 154 314L124 309C138 333 163 337 180 334L158 339C180 355 207 346 218 327Z" fill={fill("outer-feather")} stroke="#fbb581" strokeWidth="1.1" />
      <path d="M211 311C179 288 150 272 126 245C140 274 161 291 183 305C157 298 140 290 124 280C138 302 160 311 187 318C164 316 151 315 140 318C159 335 181 330 200 328L176 338C193 341 210 335 218 323Z" fill="#ffac69" opacity=".72" />
      <path d="M211 313C199 296 187 284 168 276C167 291 177 301 187 307C176 300 163 296 155 297C160 311 174 320 187 322C178 321 169 321 162 325C178 337 190 335 203 330Z" fill={fill("inner-feather")} stroke="#ffdfa4" strokeWidth=".7" />
      <path d="M211 315C205 302 199 296 191 291C186 301 193 312 199 317C186 311 180 311 174 314C180 324 193 329 203 325L194 333C205 332 213 326 215 320Z" fill={fill("plumage")} />
      <path d="M124 246Q148 281 183 304M129 284Q152 305 180 312M144 320Q164 325 182 324" fill="none" stroke="#ffe9bb" strokeWidth="1" opacity=".42" />
    </g>
    <g data-part="right-wing" data-pivot-x="290" data-pivot-y="313" filter={fill("soft-shadow")}>
      <path d="M287 304C315 287 357 265 384 224C390 245 376 270 362 282L386 271C382 296 358 309 343 314L370 307C358 330 335 337 316 333L340 341C319 352 295 344 282 327Z" fill={fill("outer-feather")} stroke="#fbb581" strokeWidth="1.1" />
      <path d="M288 313C316 290 350 272 369 248C358 275 339 291 317 305C339 299 357 291 373 281C359 303 338 313 314 319L355 318C338 334 317 331 303 328L322 339C306 339 292 333 283 322Z" fill="#ffad68" opacity=".74" />
      <path d="M288 315C299 297 312 285 329 280C330 294 320 304 311 310C322 302 334 300 343 300C337 315 325 322 310 324C319 322 327 324 334 328C319 337 306 334 296 329Z" fill={fill("inner-feather")} stroke="#ffe7b5" strokeWidth=".7" />
      <path d="M289 316C295 304 300 299 308 294C314 304 306 314 301 319C312 314 319 314 323 318C317 327 307 330 297 326L306 334C295 331 288 325 284 320Z" fill={fill("plumage")} />
      <path d="M371 249Q348 281 319 305M368 285Q347 306 321 313M351 321Q334 326 317 325" fill="none" stroke="#fff0c7" strokeWidth="1" opacity=".45" />
    </g>

    <g data-part="body" filter={fill("soft-shadow")}>
      <path d="M215 311C195 332 190 361 198 380C202 394 216 402 230 400C240 406 254 403 262 399C278 401 290 391 295 377C302 356 291 330 278 315Z" fill={fill("plumage")} stroke="#f8e1c9" strokeWidth="1.1" />
      <path d="M231 330C216 346 211 372 219 390C223 398 228 402 236 398L241 403L247 397C255 401 263 396 268 388C278 368 271 346 259 331Z" fill={fill("highlight")} opacity=".65" />
      <path d="M216 343Q211 353 216 362M221 337L218 348M280 341Q285 351 281 360M225 374L228 389M269 373L266 387M243 389L244 398" fill="none" stroke="#d5c5bb" strokeWidth=".9" strokeLinecap="round" opacity=".45" />
      <path d="M220 397L216 419L211 428L207 434Q207 437 210 436L219 430L225 433Q229 432 226 429L221 424L225 402" fill={fill("gold")} stroke="#d28a42" strokeWidth="1" />
      <path d="M269 399L274 419L279 426L287 430Q289 434 285 434L277 431L271 433Q267 433 268 429L270 425L265 402" fill={fill("gold")} stroke="#d28a42" strokeWidth="1" />
      <path d="M215 423L215 430M221 420L221 426M274 422L273 427M279 427L282 429" fill="none" stroke="#fff0ae" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M217 313Q201 322 195 336L208 334L201 344L216 341L221 350L232 328Z" fill="#f8e5cc" />
      <path d="M270 314Q286 323 295 335L284 334L290 344L276 340L271 349L260 329Z" fill="#f9e8d2" />
    </g>

    <g data-part="head" data-pivot-x="247" data-pivot-y="315" transform="translate(247 315) scale(1.1 1) translate(-247 -315)" filter={fill("soft-shadow")}>
      <path d="M211 190C180 187 158 174 151 146C146 163 147 177 157 188L145 185C146 199 161 209 179 209L164 214C177 224 195 218 213 206Z" fill={fill("fire")} stroke="#ffd499" strokeWidth=".8" />
      <path d="M188 211C171 209 159 207 148 199C148 214 162 226 181 224L172 230C186 233 198 224 203 217Z" fill={fill("outer-feather")} />
      <path d="M321 217L348 204C347 218 340 228 330 233Z" fill={fill("fire")} />
      <path d="M182 206C186 186 208 173 231 173C249 168 266 172 279 182C304 180 325 195 333 215C344 232 343 250 340 265L351 277L340 279L344 287L332 291C323 307 306 316 281 320C259 324 235 320 215 313C197 313 181 306 169 297L154 282L167 282L150 267L164 269L155 258L170 255C166 240 171 219 182 206Z" fill={fill("face")} stroke="#fff7e9" strokeWidth="1.1" />
      <path d="M183 223C187 202 203 187 222 185M193 194Q207 178 231 179M173 268L185 274L169 272M179 286Q190 298 206 300M327 274L335 280L326 282M283 313Q307 309 319 298" fill="none" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" opacity=".75" />
      <path d="M182 204L174 213L184 210M169 248L165 255L177 253M182 286L190 291M314 208L325 218M329 238L336 248" fill="none" stroke="#ddcfc7" strokeWidth=".8" strokeLinecap="round" opacity=".48" />
      <ellipse cx="277" cy="213" rx="59" ry="42" fill={fill("highlight")} opacity=".64" />
      <ellipse cx="208" cy="277" rx="31" ry="22" fill={fill("blush")} />
      <ellipse cx="315" cy="279" rx="22" ry="20" fill={fill("blush")} />
      <g fill="none" strokeLinecap="round" strokeWidth=".7" opacity=".55">
        <path d="M176 251L180 257M179 239L182 243M186 215L189 210M191 205L195 201M202 191L208 189M217 184L223 183M322 222L325 226M331 247L332 254M326 282L322 287M315 296L309 299M291 310L284 312M223 307L218 305M203 302L198 299M188 292L185 289" stroke="#fffdf2" />
        <path d="M183 252L185 257M189 238L191 233M197 218L199 215M212 194L217 192M305 219L309 222M329 258L330 262M313 287L309 291M293 305L289 307M212 296L208 294M194 278L192 275" stroke="#c1aeb0" opacity=".65" />
      </g>
      <path d="M215 214Q221 210 227 217" fill="none" stroke="#d5b8a7" strokeWidth="3" strokeLinecap="round" opacity=".7" />
      <path d="M314 225Q320 220 325 225" fill="none" stroke="#d5b8a7" strokeWidth="2.7" strokeLinecap="round" opacity=".65" />
      <g data-part="eyes-open" opacity="0">
        <ellipse cx="212" cy="249" rx="14" ry="19" fill="#3c292d" /><ellipse cx="215" cy="251" rx="9" ry="14" fill="#9b642e" /><ellipse cx="216" cy="251" rx="5" ry="11" fill="#211d2b" /><ellipse cx="209" cy="242" rx="5" ry="6" fill="#fffef3" />
        <ellipse cx="317" cy="258" rx="10" ry="15" fill="#39272c" /><ellipse cx="318" cy="259" rx="6" ry="11" fill="#965e2c" /><ellipse cx="315" cy="252" rx="3" ry="4" fill="#fffdf1" />
      </g>
      <g data-part="eyes-closed" opacity="1" fill="none" stroke="#402b32" strokeLinecap="round">
        <path d="M196 246Q215 234 232 253" strokeWidth="5" /><path d="M200 244L195 240M204 242L201 237" strokeWidth="2.5" />
        <path d="M306 261Q319 250 330 264" strokeWidth="4.5" /><path d="M327 259L331 257" strokeWidth="2" />
        <path d="M198 249Q214 242 228 253M307 263Q319 257 327 264" stroke="#8f696c" strokeWidth="1" opacity=".45" />
      </g>
      <path d="M243 269Q258 258 274 270Q273 279 266 283L252 282Q246 278 243 269Z" fill={fill("gold")} stroke="#eab36c" strokeWidth=".7" />
      <path d="M248 270Q258 265 268 270" fill="none" stroke="#fff3c1" strokeWidth="2" strokeLinecap="round" opacity=".7" />
      <g data-part="mouth-open" opacity="1">
        <path d="M249 279Q260 283 270 276Q270 295 260 301Q250 298 249 279Z" fill="#9b492c" stroke="#e99a50" strokeWidth="2" />
        <path d="M254 293Q261 288 266 291Q264 298 260 298Q256 298 254 293Z" fill="#ec896c" />
        <path d="M251 281Q252 293 256 296" fill="none" stroke="#ffc16a" strokeWidth="1.4" strokeLinecap="round" />
      </g>
      <g data-part="mouth-closed" opacity="0"><path d="M250 282Q260 289 270 280Q263 294 255 288Z" fill={fill("gold")} /><path d="M251 282Q260 287 270 279" fill="none" stroke="#a56135" strokeWidth="1.4" strokeLinecap="round" /></g>

      <path d="M264 194C264 171 252 154 238 143C244 146 249 145 254 147C244 137 240 127 244 116C250 132 257 134 265 137C256 118 257 101 266 89C277 75 291 71 306 77C290 77 280 92 283 105C285 118 298 126 304 139C305 131 304 124 304 120C317 132 319 148 315 161C322 153 322 145 321 139C332 157 326 178 314 190L292 218L284 204Z" fill={fill("crest")} stroke="#ffe8a7" strokeWidth=".85" />
      <path d="M289 210C287 179 275 158 269 145C268 157 275 170 276 181C264 166 253 162 252 157C254 176 269 188 276 204Z" fill="#ffe5a0" opacity=".8" />
      <path d="M293 203C313 179 308 161 303 149C304 169 293 174 293 189C288 174 283 164 279 158C283 177 286 189 285 204Z" fill="#fff3c2" opacity=".73" />
      <path d="M272 141C260 115 271 92 289 82M291 157Q298 175 293 194M308 159Q314 178 303 190" fill="none" stroke="#fff5c8" strokeWidth="1.5" strokeLinecap="round" opacity=".8" />
      <path d="M280 95Q275 113 283 124M261 151L271 166M304 142L307 150" fill="none" stroke="#e68548" strokeWidth="1" opacity=".55" />
    </g>

    <g data-part="scarf" filter={fill("soft-shadow")}>
      <path d="M199 308Q240 325 292 313L285 327Q264 337 245 345Q228 336 209 329Z" fill={fill("scarf")} stroke="#6888c4" strokeWidth=".9" />
      <path d="M206 312Q238 330 286 317M214 324Q229 331 240 333" fill="none" stroke="#8facdf" strokeWidth="1.4" opacity=".55" strokeLinecap="round" />
      <path d="M277 329L294 332L287 349L276 343L265 345Z" fill="#173c7d" stroke="#315999" strokeWidth=".7" />
      <text x="243" y="333" fill="#f6f7ff" fontSize="13" fontWeight="700" fontFamily="Arial, sans-serif" textAnchor="middle" transform="rotate(6 243 329)">IQX</text>
      <path d="M243 342L240 354" stroke="#c59860" strokeWidth="2" />
      <g filter={fill("gem-glow")}>
        <path d="M242 349L255 363L244 383L231 363Z" fill={fill("gem")} stroke="#fff0b3" strokeWidth="1.2" />
        <path d="M242 351L243 363L232 363Z" fill="#ffebb1" /><path d="M243 363L244 381L253 363Z" fill="#d74424" /><path d="M243 352L253 362L243 363Z" fill="#ff9550" /><path d="M233 364L243 365L244 380Z" fill="#ffbf65" />
        <path d="M242 351L243 364L244 380M233 363L253 363" fill="none" stroke="#ffedbb" strokeWidth=".85" />
      </g>
    </g>
    <g fill="#fff5d5" opacity=".8">
      <path d="M111 289L113 294L111 299L109 294ZM373 341L375 344L373 349L371 344Z" />
      <circle cx="325" cy="380" r="1.3" /><circle cx="159" cy="359" r="1" />
    </g>
  </g>
}
