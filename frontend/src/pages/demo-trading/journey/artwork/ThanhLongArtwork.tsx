import { Crystal, PlushDefs } from "./BachHoArtwork"

/** Independently drawn 2D dragon puppet: curved solid color/gradient shapes,
 * articulated source-inspired proportions, and no embedded reference image. */
export function ThanhLongArtwork({ idPrefix }: { idPrefix: string }) {
  const f = (name: string) => `url(#${idPrefix}-${name})`
  return <g transform="translate(76.2 57.4) scale(1.17)" strokeLinecap="round" strokeLinejoin="round">
    <PlushDefs idPrefix={idPrefix} cyan />
    <defs>
      <radialGradient id={`${idPrefix}-orb`} cx="36%" cy="25%" r="78%"><stop stopColor="#c4fbff" stopOpacity=".72" /><stop offset=".45" stopColor="#3fc7fb" stopOpacity=".69" /><stop offset=".82" stopColor="#46bdf1" stopOpacity=".51" /><stop offset="1" stopColor="#d3ffff" stopOpacity=".94" /></radialGradient>
      <clipPath id={`${idPrefix}-eye-window`}><path d="M61 148 C67 138 79 137 86 145 C93 153 93 166 86 171 C76 178 64 171 62 163Z" /></clipPath>
      <clipPath id={`${idPrefix}-smile-window`}><path d="M91 182 C101 187 116 187 128 181 C124 195 117 205 108 204 C99 203 94 193 91 182Z" /></clipPath>
    </defs>
    <g data-part="tail" data-pivot-x="175" data-pivot-y="296">
      <path d="M169 290 C190 302 216 299 235 284 C255 268 261 245 249 227 C257 229 264 237 265 251 C272 247 272 238 271 235 C282 257 275 282 255 300 C239 314 209 321 182 315Z" fill={f("ice")} />
      <path d="M176 303 C206 319 246 302 258 280 C269 261 264 245 260 239 C275 256 269 280 252 296 C231 315 205 320 184 313Z" fill={f("fur")} />
      <path d="M178 293 C201 307 224 295 236 286 C223 294 200 297 186 290Z" fill="#2574b5" opacity=".35" />
      <path d="M185 286 C184 278 185 275 193 274 L199 284 C197 272 204 268 210 270 L211 286 C217 272 225 267 231 268 L228 283 C237 273 245 265 249 267 L242 281" fill={f("blue")} stroke="#b8edff" strokeWidth=".8" />
      <path d="M251 252 C235 245 232 237 234 231 C239 237 243 238 246 238 C242 224 243 214 242 207 C254 213 263 222 265 235 C267 229 265 224 264 222 C277 232 280 243 271 249 C265 253 258 254 251 252Z" fill={f("ice")} />
      <path d="M243 210 C253 220 258 235 259 247 M237 235 Q245 247 251 249 M265 226 Q271 237 267 247" fill="none" stroke="#effeff" strokeWidth="1.1" />
      <path d="M257 250 C269 273 248 297 229 303" stroke="#f8fcff" strokeWidth="1.8" fill="none" opacity=".9" />
      <g fill="#d7f8ff" opacity=".5"><path d="M194 291 L198 287 L204 291 L200 296Z M205 294 L211 288 L216 291 L211 297Z M218 289 L225 283 L230 286 L224 293Z M231 281 L237 275 L243 280 L237 286Z" /></g>
    </g>
    <g data-part="body">
      <path d="M100 232 C120 233 149 231 166 232 C164 253 171 266 179 278 C189 294 184 311 174 316 C162 329 143 326 137 313 C124 320 111 323 100 316 C92 324 80 324 73 320 C71 314 76 306 78 302 C70 288 74 278 87 268 C91 255 91 244 100 232Z" fill={f("belly")} />
      <path d="M85 273 C72 281 71 296 80 306 C76 311 74 318 78 322 C86 325 97 322 102 317 C106 305 108 286 97 276Z" fill={f("limb")} />
      <path d="M154 270 C136 280 132 303 143 313 C138 319 145 327 157 327 L172 326 C182 325 184 319 180 314 C191 294 182 279 171 273Z" fill={f("fur")} />
      <path d="M104 267 C103 283 106 304 117 309 C130 305 146 283 149 263 C136 251 115 255 104 267Z" fill="#fff8ef" opacity=".6" />
      <path d="M85 279 C78 287 79 298 84 303 M155 276 C143 287 144 303 149 310 M162 275 C151 284 147 293 149 302" stroke="#fffaf4" strokeWidth="1.3" fill="none" />
      <path d="M100 305 Q108 304 116 314 L110 313 L117 320 Q104 320 100 315 L102 314Z M117 306 Q124 306 129 313 L127 315 Q120 315 117 310Z" fill="#cad6e8" opacity=".6" />
      <path d="M76 317 C78 314 80 319 79 323 L76 323Z M84 318 C87 315 89 319 88 323 L85 323Z M145 321 C147 318 150 323 149 326 L146 326Z M154 321 C157 318 159 323 158 327 L154 327Z M170 319 C173 317 175 322 173 326 L170 326Z" fill="#36598f" />
      <path d="M147 322 L148 325 M155 322 L156 325 M171 321 L172 324" stroke="#7bb9ed" strokeWidth=".8" />
    </g>
    <g data-part="left-arm" data-pivot-x="99" data-pivot-y="240">
      <path d="M99 233 C109 241 111 251 103 260 C97 268 89 274 80 277 C65 281 47 281 39 275 C33 277 28 271 31 268 C34 265 38 267 42 269 C40 263 44 261 49 266 C49 260 54 260 57 265 C66 265 77 258 83 249 C86 241 91 236 99 233Z" fill={f("limb")} />
      <path d="M37 270 C50 277 72 278 86 269 M94 240 C94 249 89 257 82 260" fill="none" stroke="#e7faff" strokeWidth="1.2" />
      <path d="M43 269 L45 274 M51 267 L54 273 M60 267 L62 272" stroke="#c4cfdd" strokeWidth=".9" />
    </g>
    <g data-part="head" data-pivot-x="137" data-pivot-y="214">
      <path d="M55 61 C57 75 65 78 80 83 L91 104 L78 135 C53 125 39 99 55 61Z" fill={f("fur")} />
      <path d="M50 76 C50 97 57 111 66 116 C61 100 63 94 69 96 L62 81Z" fill={f("blue")} /><path d="M53 70 C47 85 47 101 53 114" fill="none" stroke="#e9f8ff" strokeWidth="1.2" />
      <path d="M83 100 C83 83 79 74 77 63 C74 54 77 49 80 49 C83 51 83 57 86 60 C91 42 97 28 103 22 C108 17 114 21 113 28 C111 41 105 54 102 60 C108 58 112 52 115 53 C121 54 116 65 109 70 C102 80 97 89 94 101Z" fill={f("blue")} />
      <path d="M106 22 C98 35 93 51 91 65 M80 52 Q77 65 85 74 M113 56 L103 68" stroke="#d5fcff" strokeWidth="1.7" fill="none" opacity=".9" />
      <path d="M87 97 C85 83 92 75 99 65 C94 80 91 90 92 100Z" fill="#3a85c8" opacity=".35" />
      <path d="M73 120 C56 128 42 123 35 116 C34 132 43 145 51 152 L44 153 C43 155 47 158 49 158 C42 162 36 162 31 157 C32 170 38 179 46 183 L41 184 C45 192 54 196 62 196 C81 215 110 220 140 221 C164 221 188 219 205 213 L219 216 L216 211 C228 214 239 209 244 205 C237 204 234 202 230 199 C239 200 247 196 251 192 C243 192 239 188 236 184 C251 181 263 168 273 155 C263 158 257 155 252 151 C266 137 272 117 273 98 C254 114 236 117 218 113 C216 91 204 82 185 78 C185 72 183 69 181 68 L176 75 C173 65 172 56 181 49 C188 43 193 44 199 47 C199 40 188 35 177 35 C161 34 145 45 140 63 C124 61 103 64 89 72 C72 82 71 102 73 120Z" fill={f("fur")} />
      <path d="M36 119 C42 129 52 132 66 130 L62 145 C48 144 41 135 36 119Z M228 130 C247 120 261 109 270 102 C267 123 256 140 242 149 L251 151 C258 155 265 156 271 155 C263 166 251 176 239 179 L219 167Z" fill={f("blue")} />
      <path d="M264 113 C262 128 252 139 244 142 C254 137 260 133 263 128 M242 160 Q254 166 265 160" fill="none" stroke="#c9f5ff" strokeWidth="1.6" />
      <path d="M72 120 C91 100 117 103 139 109 C166 103 184 106 200 123 C215 140 214 168 219 184 C224 195 234 201 244 205 C237 212 224 214 215 211 L219 216 L204 214 C186 222 163 223 140 221 C110 220 81 215 62 196 C54 196 45 192 41 184 L47 184 C37 178 33 169 32 158 C39 163 45 162 51 159 C54 143 61 131 72 120Z" fill={f("fur")} />
      <path d="M52 160 C54 147 64 137 74 134 C64 149 62 163 51 174Z M48 183 C61 187 70 180 77 177 C72 190 65 195 60 193Z M201 194 C210 204 218 208 228 207 C224 214 214 215 205 212Z" fill={f("lock")} opacity=".72" />
      <path d="M57 146 C62 139 68 137 72 136 M52 185 C60 188 65 187 71 183 M191 209 Q207 217 216 214" fill="none" stroke="#fffdf8" strokeWidth="1.1" opacity=".85" />
      <path d="M90 100 C81 92 87 77 100 68 C109 62 122 62 131 56 L127 65 C134 64 138 65 141 66 C143 46 163 34 177 36 C187 36 194 40 197 44 C185 40 175 51 176 63 C177 76 189 89 180 103 C173 114 158 113 146 108 C131 119 117 126 105 115 C100 113 93 109 90 100Z" fill={f("lock")} />
      <path d="M145 59 C143 77 158 82 164 94 C153 110 132 116 118 113 C138 109 148 103 152 96 C149 87 139 75 145 59Z" fill="#a6aac3" opacity=".8" />
      <path d="M174 40 C163 42 153 51 153 61 C156 74 164 75 169 86 C172 93 170 99 166 103 C181 91 172 79 169 68 C163 53 166 47 174 40Z" fill="#fffdf8" opacity=".94" />
      <path d="M96 79 C96 99 118 98 129 97 C117 107 108 110 101 107 C91 99 88 91 96 79Z M155 49 C151 61 161 74 166 83 C176 99 167 106 158 108 C166 97 159 87 154 80 C146 69 147 57 155 49Z" fill={f("occlusion")} opacity=".53" />
      <path d="M95 89 C98 78 113 72 123 69 M98 96 C112 98 124 94 132 85 M107 104 C121 107 137 99 145 91 M146 68 C145 80 155 90 156 97" stroke="#fffef8" strokeWidth="1.15" fill="none" opacity=".9" />
      <path d="M106 105 C101 115 105 129 112 136 L119 129 L121 133 C131 124 141 117 143 108 C132 116 114 116 106 105Z" fill={f("lock")} />
      <path d="M109 113 Q111 126 114 130 M126 117 L120 126" stroke="#fffaf6" strokeWidth=".9" fill="none" />
      <path d="M162 106 C174 92 181 80 189 71 C192 65 195 59 199 61 C203 64 201 72 203 74 C215 65 222 52 226 42 C230 31 237 34 239 40 C242 54 230 75 219 86 C225 85 229 80 232 80 C239 79 238 88 230 96 C217 108 196 117 177 120Z" fill={f("blue")} />
      <path d="M232 38 C233 54 219 79 199 93 M197 64 Q190 77 190 85 M232 84 Q222 95 209 98" fill="none" stroke="#dbfdff" strokeWidth="1.8" opacity=".9" /><path d="M167 107 C185 112 199 105 212 100 C197 112 187 116 177 117Z" fill="#2b71bb" opacity=".4" />
      <g transform="translate(118 111) rotate(8)"><Crystal idPrefix={idPrefix} x={0} y={0} scale={.20} /></g>
      <path d="M79 104 C97 116 112 119 126 122 L117 143 C98 141 88 133 76 134Z M145 111 C158 109 166 101 171 96 C172 110 164 120 153 126Z" fill={f("occlusion")} opacity=".55" filter={f("soft-shadow")} />
      <ellipse cx="162" cy="162" rx="49" ry="43" fill={f("soft-cream")} opacity=".42" />
      <ellipse cx="109" cy="184" rx="43" ry="24" fill={f("soft-cream")} />
      <ellipse cx="61" cy="180" rx="19" ry="17" fill={f("soft-cream")} opacity=".7" />
      <path d="M65 120 C72 111 80 111 84 120 C77 117 71 117 65 120Z M144 138 C153 126 164 128 169 139 C159 135 151 136 144 138Z" fill={f("blue")} opacity=".72" />
      <path d="M99 143 L103 137 L105 144 L110 140 L108 151 L103 155Z" fill="#b5dff6" opacity=".5" />
      <ellipse cx="59" cy="177" rx="15" ry="9" fill={f("blush")} /><ellipse cx="182" cy="184" rx="23" ry="13" fill={f("blush")} />
      <g data-part="eyes-open" opacity="1"><path d="M61 148 C68 135 80 132 89 143 C97 155 96 167 88 173 C77 179 64 172 62 162 L60 153 L57 149Z" fill="#292438" /><path d="M61 148 C68 139 79 137 86 145 C94 155 94 166 86 171 C76 177 65 170 63 162Z" fill={f("eye-white")} />
        <g clipPath={`url(#${idPrefix}-eye-window)`}><g data-part="pupils" data-pivot-x="80" data-pivot-y="157"><ellipse cx="78.6" cy="157" rx="13.1" ry="20.5" fill="#131f3e" /><ellipse cx="79" cy="158" rx="11.7" ry="18.9" fill={f("iris")} /><ellipse cx="81" cy="156" rx="7.3" ry="14.5" fill="#0b1c33" /><path d="M73 168 Q82 177 89 164" stroke="#8ad7f7" strokeWidth="1.2" fill="none" /><ellipse cx="76" cy="145" rx="3.3" ry="2" transform="rotate(-25 76 145)" fill="#effdff" /><circle cx="86" cy="149" r="2.1" fill="#ffffff" /></g></g>
        <path d="M60 148 Q72 131 86 140" fill="none" stroke="#484052" strokeWidth="1.1" />
      </g>
      <g data-part="eyes-closed" opacity="0"><path d="M63 157 Q77 143 91 158" fill="none" stroke="#2c2535" strokeWidth="2.6" /></g>
      <path d="M133 170 C145 157 162 153 174 163 L177 163 L175 166 L178 168 L173 172 C164 166 158 163 151 164 C143 164 139 168 133 170Z" fill="#282234" /><path d="M139 162 C152 153 165 158 171 162" fill="none" stroke="#625164" strokeWidth=".8" />
      <path d="M96 170 C99 167 106 168 109 171 L104 175Z" fill={f("muzzle")} /><path d="M99 170 Q103 168 106 171 L103 173Z" fill="#e6b3aa" /><circle cx="90" cy="170" r="1.1" fill="#acc4df" />
      <g data-part="mouth-open" opacity="1"><path d="M91 182 C101 187 116 187 128 181 C124 195 117 205 108 204 C99 203 94 193 91 182Z" fill="#5e262c" /><g clipPath={`url(#${idPrefix}-smile-window)`}><path d="M98 201 C97 191 111 189 119 194 L121 204 L109 210Z" fill={f("tongue")} /><path d="M95 184 L101 186 L101 190 L97 189Z M119 185 L124 183 L123 189Z" fill="#fffaf0" /></g><path d="M90 181 C100 186 116 188 129 180" stroke="#d9c3c1" strokeWidth="1" fill="none" /></g>
      <g data-part="mouth-closed" opacity="0"><path d="M94 186 C103 196 116 195 125 186" stroke="#9b6c71" strokeWidth="1.5" fill="none" /></g>
      <path d="M78 205 C94 215 117 220 134 218 M188 207 Q202 208 209 202" stroke="#fffaf1" strokeWidth="1.3" fill="none" opacity=".7" />
    </g>
    <g data-part="right-arm" data-pivot-x="163" data-pivot-y="247"><path d="M146 236 C154 232 167 229 174 224 C174 220 179 219 182 223 C184 219 188 221 189 225 C194 225 196 230 193 233 C197 235 195 243 192 248 C188 255 179 260 169 260 C159 259 151 252 146 245Z" fill={f("limb")} /><path d="M173 229 C173 225 178 224 180 228 C182 234 178 237 175 233Z M183 229 C184 225 188 225 190 230 C191 235 186 238 184 235Z M185 241 C188 237 192 238 192 242 C191 247 188 249 186 246Z M170 239 C175 234 182 239 182 246 C180 252 174 252 171 248 C166 248 166 243 170 239Z" fill={f("blue")} opacity=".79" /><path d="M151 243 C157 252 165 256 173 255" stroke="#fff9ef" strokeWidth="1.2" fill="none" /></g>
    <g data-part="scarf"><path d="M87 213 C110 222 145 225 166 218 C170 220 168 225 164 227 C169 230 168 234 163 237 C150 244 121 249 106 250 C95 247 86 236 84 225 C82 219 83 216 87 213Z" fill={f("scarf")} /><path d="M87 216 C113 226 144 227 163 221 M88 226 C106 237 133 237 154 232" stroke="#7ba9e5" strokeWidth="1" opacity=".75" fill="none" /><path d="M91 228 C112 239 136 237 163 229 C149 242 122 246 108 245Z" fill="#17326e" opacity=".24" /><g transform="translate(98 230) rotate(3)" fill="none" stroke="#fbffff" strokeWidth="1.3"><path d="M0 0 V8 M9 0 C3 0 3 8 9 8 C15 8 15 0 9 0 M10 6 L15 10 M20 0 L27 8 M27 0 L20 8" /></g></g>
    <g data-part="crystal" data-pivot-x="105" data-pivot-y="272"><Crystal idPrefix={idPrefix} x={105} y={272} scale={1.08} /></g>
    <g data-part="hologram" data-pivot-x="55" data-pivot-y="239"><ellipse cx="55" cy="240" rx="34" ry="35" fill={`url(#${idPrefix}-orb)`} stroke="#c7fdff" strokeWidth="1.2" /><ellipse cx="55" cy="240" rx="31" ry="32" fill="none" stroke="#9df9ff" strokeWidth=".55" opacity=".75" /><path d="M28 234 C28 222 35 214 45 211" fill="none" stroke="#e9ffff" strokeWidth="2.8" opacity=".9" /><g fill="none" stroke="#f0ffff" strokeWidth="1.9"><path d="M37 251 L43 251 L43 242 L37 242Z M49 251 L55 251 L55 238 L49 238Z M61 251 L67 251 L67 231 L61 231Z" /><path d="M35 240 L46 228 L56 234 L69 221 M61 221 L69 221 L68 229" strokeWidth="2.2" /></g><circle cx="47" cy="211" r="1.4" fill="#fff" /><circle cx="69" cy="267" r=".8" fill="#eaffff" /></g>
  </g>
}
