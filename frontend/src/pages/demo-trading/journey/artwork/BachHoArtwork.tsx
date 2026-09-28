/** Newly drawn vector surfaces only: no original pixels, images or textures. */
export function PlushDefs({ idPrefix, cyan = false }: { idPrefix: string; cyan?: boolean }) {
  const id = (name: string) => `${idPrefix}-${name}`
  return <defs>
    <radialGradient id={id("fur")} cx="69%" cy="24%" r="79%"><stop stopColor="#fffdf2" /><stop offset=".25" stopColor="#fbf4ea" /><stop offset=".49" stopColor="#e9dfe4" /><stop offset=".74" stopColor="#c9c0d4" /><stop offset=".9" stopColor="#aaaecb" /><stop offset="1" stopColor="#8797bc" /></radialGradient>
    <radialGradient id={id("lock")} cx="77%" cy="17%" r="100%"><stop stopColor="#fffef7" /><stop offset=".30" stopColor="#fff8ee" /><stop offset=".55" stopColor="#e4dce3" /><stop offset=".76" stopColor="#bdb7cf" /><stop offset="1" stopColor="#8a97be" /></radialGradient>
    <radialGradient id={id("limb")} cx="74%" cy="25%" r="89%"><stop stopColor="#fff9ec" /><stop offset=".27" stopColor="#f4e8e2" /><stop offset=".57" stopColor="#d3c7d3" /><stop offset=".8" stopColor="#acabc7" /><stop offset="1" stopColor="#8296ba" /></radialGradient>
    <radialGradient id={id("belly")} cx="66%" cy="22%" r="87%"><stop stopColor="#fff9ee" /><stop offset=".28" stopColor="#f3e4df" /><stop offset=".6" stopColor="#d4c6d0" /><stop offset=".84" stopColor="#a4a7c3" /><stop offset="1" stopColor="#8292b5" /></radialGradient>
    <linearGradient id={id("blue")} x1=".9" y1=".05" x2=".1" y2="1"><stop stopColor={cyan ? "#d4fcff" : "#cadfff"} /><stop offset=".28" stopColor={cyan ? "#79e0ff" : "#75baff"} /><stop offset=".65" stopColor={cyan ? "#32b6ed" : "#3487e7"} /><stop offset="1" stopColor="#2358b5" /></linearGradient>
    <radialGradient id={id("ear")} cx="84%" cy="16%" r="96%"><stop stopColor="#b5d8ff" /><stop offset=".25" stopColor="#679aed" /><stop offset=".56" stopColor="#2853b4" /><stop offset=".81" stopColor="#102d7d" /><stop offset="1" stopColor="#1669c9" /></radialGradient>
    <linearGradient id={id("ice")} x1="0" y1="0" x2=".75" y2="1"><stop stopColor="#f0fdff" /><stop offset=".3" stopColor="#c4efff" /><stop offset=".72" stopColor="#6cc8f9" /><stop offset="1" stopColor="#4c87d4" /></linearGradient>
    <linearGradient id={id("scarf")} x1=".2" y1="0" x2=".8" y2="1"><stop stopColor="#5e86ca" /><stop offset=".2" stopColor="#315da5" /><stop offset=".58" stopColor="#244c99" /><stop offset=".83" stopColor="#173777" /><stop offset="1" stopColor="#4671b8" /></linearGradient>
    <radialGradient id={id("iris")} cx="62%" cy="75%" r="77%"><stop stopColor="#a1eaff" /><stop offset=".36" stopColor="#5697e7" /><stop offset=".72" stopColor="#214d9c" /><stop offset="1" stopColor="#102348" /></radialGradient>
    <radialGradient id={id("blush")}><stop stopColor="#f4b4b5" stopOpacity=".55" /><stop offset="1" stopColor="#f1bfbd" stopOpacity="0" /></radialGradient>
    <radialGradient id={id("muzzle")} cx="60%" cy="28%" r="74%"><stop stopColor="#fff9e9" /><stop offset=".45" stopColor="#fff1e4" /><stop offset=".8" stopColor="#ead5d4" /><stop offset="1" stopColor="#c6b3c7" /></radialGradient>
    <radialGradient id={id("soft-cream")}><stop stopColor="#fff7e8" stopOpacity=".98" /><stop offset=".5" stopColor="#fff4e8" stopOpacity=".7" /><stop offset="1" stopColor="#fff4e8" stopOpacity="0" /></radialGradient>
    <linearGradient id={id("occlusion")} x1="0" y1="0" x2=".2" y2="1"><stop stopColor="#736c91" stopOpacity=".65" /><stop offset=".45" stopColor="#a89bb7" stopOpacity=".32" /><stop offset="1" stopColor="#bba6bb" stopOpacity="0" /></linearGradient>
    <radialGradient id={id("eye-white")} cx="54%" cy="62%" r="72%"><stop stopColor="#fff4e7" /><stop offset=".63" stopColor="#d2cee3" /><stop offset="1" stopColor="#676787" /></radialGradient>
    <filter id={id("soft-shadow")} x="-40%" y="-60%" width="180%" height="220%"><feGaussianBlur stdDeviation="2.1" /></filter>
    <linearGradient id={id("tongue")} x1="0" y1="0" x2=".5" y2="1"><stop stopColor="#b84549" /><stop offset="1" stopColor="#f49b91" /></linearGradient>
    <linearGradient id={id("crystal")} x1=".1" y1=".1" x2=".8" y2="1"><stop stopColor="#f1ffff" /><stop offset=".27" stopColor="#80edff" /><stop offset=".59" stopColor="#288ddf" /><stop offset="1" stopColor="#1353b0" /></linearGradient>
  </defs>
}
export function Crystal({ idPrefix, x, y, scale = 1 }: { idPrefix: string; x: number; y: number; scale?: number }) {
  return <g transform={`translate(${x} ${y}) scale(${scale})`}>
    <path d="M0 -19 L14 0 L0 24 L-14 0Z" fill={`url(#${idPrefix}-crystal)`} stroke="#c0e9fa" strokeWidth="1.2" />
    <path d="M0 -18 L1 0 L-13 0Z" fill="#b3edff" /><path d="M1 0 L13 0 L0 23Z" fill="#185aaa" opacity=".8" />
    <path d="M0 -18 L13 0 L1 0Z" fill="#f2ffff" opacity=".93" /><path d="M-13 0 L1 0 L0 23Z" fill="#459ada" opacity=".75" />
    <path d="M-11 -1 L0 -17 M-12 1 L-1 20" fill="none" stroke="#f6ffff" strokeWidth=".8" opacity=".9" /><path d="M0 -16 L1 -4" stroke="#fff" strokeWidth="1.4" />
  </g>
}
export function BachHoArtwork({ idPrefix }: { idPrefix: string }) {
  const f = (name: string) => `url(#${idPrefix}-${name})`
  return <g transform="translate(72 58.5) scale(1.17)" strokeLinecap="round" strokeLinejoin="round">
    <PlushDefs idPrefix={idPrefix} />
    <defs><clipPath id={`${idPrefix}-eye-window`}><path d="M94 155 C100 143 118 136 129 145 C137 153 139 171 130 180 C117 189 97 179 95 169Z" /></clipPath><clipPath id={`${idPrefix}-smile-window`}><path d="M137 191 C148 198 164 198 177 193 C172 211 162 218 153 215 C142 212 139 204 137 191Z" /></clipPath></defs>
    <g data-part="tail" data-pivot-x="81" data-pivot-y="287">
      <path d="M81 295 C61 302 40 292 29 277 C15 258 18 238 31 222 C21 219 16 224 11 228 C16 214 31 207 44 207 C65 204 77 223 75 242 C74 259 88 276 81 295Z" fill={f("ice")} />
      <path d="M20 241 C24 256 33 260 34 245 C35 267 42 280 61 287 C48 286 42 282 35 276 C46 293 60 297 76 292 C67 300 46 292 35 282 C20 268 17 251 20 241Z" fill="#e9faff" />
      <path d="M12 226 C28 207 43 209 51 216 C58 223 54 240 43 248 C46 238 46 231 42 229 C38 239 32 245 28 242 C34 226 28 218 12 226Z" fill={f("blue")} />
      <path d="M53 215 C68 226 72 241 66 251 C57 267 61 278 69 283 C55 278 49 263 57 249 C67 232 61 222 53 215Z" fill="#f5fbff" opacity=".9" />
      <path d="M15 223 C32 208 48 207 60 216 M25 260 C31 278 47 289 62 291" fill="none" stroke="#e4fbff" strokeWidth="1.5" />
      <g fill="#e5faff" opacity=".8"><circle cx="35" cy="218" r="1.2" /><circle cx="43" cy="220" r=".8" /><circle cx="58" cy="230" r="1" /><circle cx="47" cy="234" r=".7" /></g>
    </g>
    <g data-part="body">
      <path d="M98 231 C116 239 163 243 181 237 C186 252 184 267 196 280 C208 295 201 310 190 315 C183 327 165 320 158 309 C146 316 133 315 122 310 C112 324 91 326 85 312 C76 318 65 321 61 316 C60 312 66 307 67 304 C61 291 64 282 79 271 C91 260 89 243 98 231Z" fill={f("belly")} />
      <ellipse cx="188" cy="302" rx="17" ry="15" fill={f("limb")} /><path d="M169 309 C179 306 198 307 203 314 C210 324 192 326 177 322 C172 320 169 315 169 309Z" fill={f("fur")} />
      <path d="M71 294 C67 305 67 310 63 313 C59 316 62 320 67 320 L85 319 C91 314 86 306 84 300" fill={f("limb")} />
      <path d="M112 265 C90 268 83 289 91 308 C85 313 88 325 101 326 L119 326 C131 325 128 315 121 310 C133 294 130 274 112 265Z" fill={f("fur")} />
      <path d="M128 266 C140 278 142 305 151 309 C163 306 175 294 176 273 C169 260 140 259 128 266Z" fill="#fff7ef" opacity=".45" />
      <path d="M99 272 C90 286 92 300 98 307 M105 270 C98 280 96 288 96 296 M174 276 C190 280 195 291 192 300" fill="none" stroke="#fffcf5" strokeWidth="1.8" opacity=".8" />
      <path d="M99 318 C101 316 104 321 104 326 L100 326Z M115 318 C118 317 120 322 119 326 L115 326Z M182 317 C184 314 187 320 186 324 L182 323Z M195 318 C197 316 200 321 199 324 L195 324Z M64 315 L66 320 L63 320Z M77 314 C80 312 81 318 80 320 L77 320Z" fill="#294d82" />
      <path d="M101 320 L102 324 M116 320 L117 324 M183 318 L184 321" stroke="#76b6eb" strokeWidth=".8" />
    </g>
    <g data-part="left-arm" data-pivot-x="102" data-pivot-y="240"><path d="M99 234 C88 240 76 252 69 266 C62 277 59 286 63 290 C65 293 68 292 69 291 C70 295 75 295 77 290 C80 293 85 289 86 286 C91 286 92 280 95 274 C101 261 109 248 108 241Z" fill={f("limb")} /><path d="M101 238 C87 247 76 263 72 278 C77 266 86 259 95 251" fill="#fff8f0" opacity=".5" /><path d="M99 242 C88 251 80 261 76 273 M67 280 L64 286 M72 283 L70 290 M79 280 L77 288" fill="none" stroke="#d1cbd9" strokeWidth=".8" /><path d="M63 286 C65 286 66 289 66 292" stroke="#45608d" strokeWidth="1.4" /></g>
    <g data-part="head" data-pivot-x="151" data-pivot-y="219">
      <path d="M60 25 C71 43 92 54 114 61 L125 70 C123 64 123 58 125 54 C130 61 136 64 140 66 C141 48 158 36 171 39 L179 42 C168 43 165 49 170 56 C179 63 189 69 194 80 C196 74 196 69 194 64 C204 74 207 86 205 92 C222 84 244 87 258 77 L272 66 C275 88 271 107 263 121 L252 135 L263 130 C258 148 248 163 234 171 C239 179 242 181 246 181 L240 186 Q248 192 255 193 C249 202 237 210 226 215 C201 233 167 233 137 230 C109 226 84 216 70 212 L60 204 L68 200 C56 198 48 191 44 185 L50 186 C39 179 33 171 28 165 L43 161 L33 158 L41 156 C30 149 22 141 20 134 L38 144 C25 134 21 120 20 108 C28 116 39 119 48 121 C36 98 36 80 44 58Z" fill={f("fur")} />
      <path d="M60 28 C71 51 85 71 89 86 C94 109 79 126 61 131 C44 111 41 79 49 55Z" fill={f("ear")} /><path d="M52 45 C50 72 48 88 55 102 C55 91 58 83 65 86 C59 69 63 67 68 71 C64 58 59 51 52 45Z" fill="#d2d6ef" opacity=".8" />
      <path d="M21 111 C39 125 51 119 66 120 C70 133 65 145 48 155 C31 143 24 130 21 111Z" fill={f("blue")} /><path d="M27 127 C38 141 51 142 63 136 C55 148 44 151 38 148Z" fill="#a7e7ff" />
      <path d="M239 99 C254 90 266 78 272 68 C273 99 262 123 249 134 C240 143 236 150 230 154 L224 131Z" fill={f("blue")} /><path d="M267 82 C265 101 258 113 249 120 L262 94Z" fill="#edf5ff" /><path d="M237 139 C249 139 255 135 262 132 C254 155 244 167 231 172 L221 155Z" fill={f("ice")} />
      <path d="M71 127 C80 116 99 110 117 109 C142 102 170 104 189 101 C214 110 230 126 236 149 C236 164 238 178 240 186 Q248 192 255 193 C249 202 237 210 226 215 C200 232 166 232 137 229 C109 225 84 216 70 212 L60 204 L68 200 C56 198 48 191 44 185 L50 186 C39 179 33 171 28 165 L45 161 L35 158 C51 156 64 143 71 127Z" fill={f("fur")} />
      <path d="M41 164 C63 170 72 149 85 140 C75 159 64 174 47 174Z M48 181 C68 183 77 174 88 169 C77 185 65 191 58 188Z M64 201 C84 202 91 194 99 191 C92 207 79 210 71 207Z" fill={f("lock")} opacity=".85" />
      <path d="M72 137 C67 147 53 154 44 158 M56 174 C62 174 70 172 75 167 M76 204 C83 205 89 203 94 199" stroke="#fffaf4" strokeWidth="1" fill="none" /><path d="M220 175 C230 190 236 193 250 193 C239 204 229 205 218 204 M204 214 C216 213 227 208 234 206 C227 221 215 225 204 224" fill={f("lock")} opacity=".6" />
      <path d="M104 116 C104 102 115 94 128 92 C120 83 122 64 125 55 C131 67 140 72 149 77 C145 60 152 43 171 40 C162 48 166 58 177 66 C191 76 197 89 196 107 C195 115 190 123 183 127 C188 105 178 102 174 95 C167 111 151 120 135 115 C121 111 118 119 104 116Z" fill={f("lock")} />
      <path d="M143 78 C149 88 164 93 173 99 C163 111 151 116 137 112 C154 111 160 105 160 100 C152 94 144 88 143 78Z" fill="#a59db9" opacity=".75" /><path d="M174 44 C165 54 178 64 185 74 C198 92 192 105 189 109 C192 92 180 81 171 71 C162 60 164 49 174 44Z" fill="#fffdf6" />
      <path d="M126 83 C132 96 149 96 157 103 C143 110 128 107 116 112 C124 100 122 95 126 83Z" fill={f("occlusion")} opacity=".7" /><path d="M158 58 C160 73 174 78 181 91 C186 102 183 111 178 116 C181 99 167 91 161 81 C156 73 155 64 158 58Z" fill={f("occlusion")} opacity=".48" />
      <path d="M128 66 C129 88 154 90 165 99 M149 60 C147 78 163 84 174 89 M121 99 C134 95 148 104 153 105 M126 104 C137 103 143 107 145 109" fill="none" stroke="#fffdf6" strokeWidth="1.1" opacity=".85" />
      <path d="M101 113 C118 119 127 114 139 117 C155 124 174 112 181 109 C183 121 176 132 169 136 C156 133 144 129 133 133 C116 137 106 133 98 129Z" fill={f("occlusion")} filter={f("soft-shadow")} opacity=".64" />
      <ellipse cx="176" cy="169" rx="60" ry="49" fill={f("soft-cream")} opacity=".48" />
      <ellipse cx="155" cy="195" rx="48" ry="25" fill={f("soft-cream")} />
      <ellipse cx="100" cy="192" rx="30" ry="22" fill={f("soft-cream")} opacity=".68" />
      <path d="M72 174 C77 184 80 188 88 192 M221 164 C226 173 228 179 232 184" fill="none" stroke="#f8ede9" strokeWidth="2.4" opacity=".3" />
      <path d="M111 121 C120 116 128 117 133 128 C127 123 119 121 111 121Z M195 135 C202 126 211 129 214 138 C207 133 201 134 195 135Z" fill={f("blue")} opacity=".8" />
      <g transform="translate(171 124) rotate(8)"><Crystal idPrefix={idPrefix} x={0} y={0} scale={.64} /></g>
      <ellipse cx="91" cy="185" rx="20" ry="11" fill={f("blush")} /><ellipse cx="216" cy="198" rx="21" ry="11" fill={f("blush")} />
      <g data-part="eyes-open" opacity="1"><path d="M93 156 C99 140 118 132 130 141 C142 150 143 170 133 182 C118 190 99 179 96 169 L93 159 L86 154Z" fill="#242337" /><path d="M94 155 C101 142 117 137 128 144 C138 152 139 170 130 180 C117 188 98 178 96 168Z" fill={f("eye-white")} />
        <g clipPath={`url(#${idPrefix}-eye-window)`}><g data-part="pupils" data-pivot-x="124" data-pivot-y="163"><ellipse cx="121" cy="164" rx="18.4" ry="24.8" fill="#121e3d" /><ellipse cx="122" cy="165" rx="16.2" ry="23" fill={f("iris")} /><ellipse cx="124" cy="163" rx="10.7" ry="17.2" fill="#08172e" /><path d="M112 165 C111 177 119 184 128 181" fill="none" stroke="#4386da" strokeWidth="1.7" /><path d="M112 174 C119 184 130 184 135 172" stroke="#80c7f8" strokeWidth="2" opacity=".85" fill="none" /><ellipse cx="119" cy="149" rx="4" ry="2.4" transform="rotate(-28 119 149)" fill="#e6f8ff" /><circle cx="130" cy="153" r="3.3" fill="white" /><circle cx="118" cy="177" r="1.1" fill="#d7f8ff" /></g></g>
        <path d="M94 155 C100 141 118 135 129 142" stroke="#413e52" strokeWidth="1.5" fill="none" />
      </g>
      <g data-part="eyes-closed" opacity="0"><path d="M96 162 C106 151 125 149 137 164" fill="none" stroke="#2a2435" strokeWidth="3.2" /><path d="M98 159 L93 156" stroke="#2a2435" strokeWidth="1.4" /></g>
      <path d="M181 182 C193 172 205 169 216 175 C220 177 222 181 225 181 L221 185 C212 180 207 177 200 177 C192 177 187 180 181 182Z" fill="#292334" /><path d="M185 178 C197 168 213 170 219 177" stroke="#665163" strokeWidth=".8" fill="none" />
      <path d="M151 182 C156 178 165 179 169 184 C164 190 156 189 151 184Z" fill={f("muzzle")} /><path d="M155 183 C159 180 164 181 167 184 L162 187 C159 187 157 185 155 183Z" fill="#e7ada5" /><path d="M157 182 Q162 181 165 184" stroke="#ffd9cb" strokeWidth="1" fill="none" />
      <g data-part="mouth-open" opacity="1"><path d="M137 191 C148 198 164 198 177 193 C172 211 162 218 153 215 C142 212 139 204 137 191Z" fill="#5a2529" /><g clipPath={`url(#${idPrefix}-smile-window)`}><path d="M139 206 C143 197 157 198 164 207 C168 215 157 220 150 216Z" fill={f("tongue")} /><path d="M137 191 L144 194 L144 198 L141 198Z M166 196 L171 195 L168 200Z" fill="#fffdf2" /></g><path d="M136 190 C144 195 148 192 153 194 C164 197 172 196 178 191" fill="none" stroke="#d8c0bd" strokeWidth="1.1" /></g>
      <g data-part="mouth-closed" opacity="0"><path d="M141 197 C150 206 164 207 175 198" fill="none" stroke="#98636b" strokeWidth="1.6" /></g>
      <path d="M97 208 C113 221 133 226 151 226 M199 215 C206 213 211 211 216 207" fill="none" stroke="#fff9f0" strokeWidth="1.2" opacity=".65" />
    </g>
    <g data-part="right-arm" data-pivot-x="196" data-pivot-y="249"><path d="M184 238 C197 233 207 227 214 218 C216 213 219 211 223 212 C225 208 229 209 232 214 C235 210 239 211 241 216 C245 214 248 217 248 220 C253 222 253 226 249 230 C253 235 249 241 244 244 C233 255 214 263 202 260 L186 256Z" fill={f("limb")} /><path d="M215 219 C220 214 224 218 224 225 C223 231 217 233 215 228Z M232 218 C238 215 241 220 239 226 C237 231 232 232 230 228Z M242 230 C247 226 250 230 248 234 C246 239 240 238 240 235Z M218 234 C224 230 233 234 233 243 C233 252 224 253 220 247 C213 246 214 238 218 234Z" fill={f("ear")} opacity=".87" /><path d="M196 249 C208 254 215 251 221 249 M242 218 L245 223" fill="none" stroke="#fff8ed" strokeWidth="1.2" /></g>
    <g data-part="scarf"><path d="M93 218 C123 230 162 236 194 227 L203 223 C199 234 190 243 181 251 C167 262 154 263 138 258 C120 254 105 247 91 239 C88 235 88 230 92 227 C88 223 89 220 93 218Z" fill={f("scarf")} /><path d="M95 221 C123 232 165 238 192 230 M92 231 C113 245 132 250 150 252" fill="none" stroke="#88b5ed" strokeWidth="1" opacity=".72" /><path d="M93 228 C120 240 161 244 183 235 C166 248 144 251 127 246 C111 241 101 237 93 231Z" fill="#153374" opacity=".32" /><path d="M196 230 Q193 242 181 249" stroke="#718ecc" strokeWidth="1.2" fill="none" opacity=".8" /><g transform="translate(135 240) rotate(8)" fill="none" stroke="#f8fbff" strokeWidth="1.3"><path d="M0 0 V8 M9 0 C3 0 3 8 9 8 C15 8 15 0 9 0 M10 6 L15 10 M20 0 L27 8 M27 0 L20 8" /></g></g>
    <g data-part="crystal" data-pivot-x="153" data-pivot-y="281"><Crystal idPrefix={idPrefix} x={153} y={281} scale={1.07} /></g>
  </g>
}
