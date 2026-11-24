import { type JSX, useId } from "react"

import type { SpaceRoom } from "./loading-helpers.ts"
import { FLOOR_TICKER_ITEMS } from "./loading-tips.ts"

const SPARKLE_SPOTS = [
  { x: 12, y: 18, size: 12, delay: "0s" },
  { x: 86, y: 20, size: 10, delay: "0.7s" },
  { x: 20, y: 74, size: 9, delay: "1.3s" },
  { x: 82, y: 70, size: 13, delay: "0.4s" },
  { x: 34, y: 12, size: 8, delay: "1.9s" },
  { x: 70, y: 14, size: 10, delay: "1.1s" },
] as const

export function SparklesOverlay(): JSX.Element {
  return (
    <div className="sls-sparkles" aria-hidden="true">
      {SPARKLE_SPOTS.map((spot, idx) => (
        <svg
          key={idx}
          className="sls-sparkle"
          width={spot.size}
          height={spot.size}
          viewBox="0 0 16 16"
          style={{
            left: `${spot.x}%`,
            top: `${spot.y}%`,
            animationDelay: spot.delay,
          }}
        >
          <path
            d="M8 1 L9.7 6.3 L15 8 L9.7 9.7 L8 15 L6.3 9.7 L1 8 L6.3 6.3 Z"
            fill="#F3CD6A"
          />
        </svg>
      ))}
    </div>
  )
}

interface ChibiMascotSvgProps {
  room: SpaceRoom
  waving: boolean
}

/**
 * Pure inline SVG chibi mascot styled after IQX's 3D chibi characters:
 * big glossy round head, shiny dark eyes, rosy cheeks, tailored tiny suit,
 * holding a mini green candlestick chart (floor) or gleaming IQX gold coin (office).
 */
export function ChibiMascotSvg({
  room,
  waving,
}: ChibiMascotSvgProps): JSX.Element {
  const uid = useId()
  const skinGrad = `${uid}-skin`
  const hairGrad = `${uid}-hair`
  const suitGrad = `${uid}-suit`
  const goldGrad = `${uid}-gold`

  const isOffice = room === "office"
  const suitTop = isOffice ? "#2554B0" : "#223663"
  const suitBottom = isOffice ? "#17377B" : "#14213F"
  const tieColor = isOffice ? "#F3CD6A" : "#E6B44C"

  return (
    <div className="sls-mascot-wrap" aria-hidden="true">
      <div className="sls-mascot-shadow" />
      <svg
        className="sls-mascot-svg"
        width="136"
        height="148"
        viewBox="0 0 136 148"
        fill="none"
      >
        <defs>
          <radialGradient id={skinGrad} cx="42%" cy="32%" r="68%">
            <stop offset="0%" stopColor="#FFF0DF" />
            <stop offset="62%" stopColor="#FFE1C4" />
            <stop offset="100%" stopColor="#F2BE94" />
          </radialGradient>
          <linearGradient id={hairGrad} x1="20%" y1="5%" x2="80%" y2="95%">
            <stop offset="0%" stopColor="#3B312B" />
            <stop offset="52%" stopColor="#201B18" />
            <stop offset="100%" stopColor="#12100E" />
          </linearGradient>
          <linearGradient id={suitGrad} x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor={suitTop} />
            <stop offset="100%" stopColor={suitBottom} />
          </linearGradient>
          <linearGradient id={goldGrad} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFF0B2" />
            <stop offset="50%" stopColor="#F3CD6A" />
            <stop offset="100%" stopColor="#C98D26" />
          </linearGradient>
        </defs>

        {/* Rounded chibi feet / shoes */}
        <ellipse cx="56" cy="134" rx="10" ry="6.5" fill="#111829" />
        <ellipse cx="80" cy="134" rx="10" ry="6.5" fill="#111829" />
        <ellipse
          cx="54"
          cy="132"
          rx="4.5"
          ry="2"
          fill="#2A3A5E"
          opacity="0.65"
        />
        <ellipse
          cx="78"
          cy="132"
          rx="4.5"
          ry="2"
          fill="#2A3A5E"
          opacity="0.65"
        />

        {/* Short chibi legs */}
        <rect x="49" y="118" width="14" height="14" rx="6" fill="#141F38" />
        <rect x="73" y="118" width="14" height="14" rx="6" fill="#141F38" />

        {/* Tiny tailored suit torso */}
        <rect
          x="42"
          y="85"
          width="52"
          height="39"
          rx="18"
          fill={`url(#${suitGrad})`}
          stroke="rgba(243, 205, 106, 0.35)"
          strokeWidth="1.2"
        />

        {/* Crisp white shirt V-front */}
        <path d="M58 86 L68 108 L78 86 Z" fill="#FFFAF0" />
        {/* Blazer lapels */}
        <path d="M55 87 L62 103 L53 102 Z" fill="#111E3A" opacity="0.45" />
        <path d="M81 87 L74 103 L83 102 Z" fill="#111E3A" opacity="0.45" />
        {/* Tie */}
        <path
          d="M65.5 90 L70.5 90 L71.5 104 L68 110 L64.5 104 Z"
          fill={tieColor}
        />
        <circle cx="68" cy="91" r="2.6" fill="#D9A03A" />
        {/* Gold lapel pin */}
        <circle cx="53" cy="98" r="2.2" fill="#F3CD6A" />

        {/* Left arm holding room prop (stock chart sign or gold coin) */}
        <g className="sls-mascot-prop-arm">
          <path
            d="M44 96 C33 99 29 107 34 114 C38 118 44 114 46 109"
            stroke={`url(#${suitGrad})`}
            strokeWidth="11"
            strokeLinecap="round"
          />
          <circle cx="33" cy="109" r="6.2" fill={`url(#${skinGrad})`} />

          {isOffice ? (
            /* Gleaming IQX Xu gold coin */
            <g transform="translate(8, 86)">
              <circle
                cx="18"
                cy="18"
                r="15"
                fill={`url(#${goldGrad})`}
                stroke="#A86F18"
                strokeWidth="1.5"
              />
              <circle
                cx="18"
                cy="18"
                r="11"
                fill="none"
                stroke="#FFF5C8"
                strokeWidth="1.2"
                strokeDasharray="3 2"
              />
              <path
                d="M18 11 L23 18 L18 25 L13 18 Z"
                fill="#7A4E00"
                opacity="0.82"
              />
              <path
                d="M11 11 C13 8 17 7 21 8"
                stroke="#FFFFFF"
                strokeWidth="1.6"
                strokeLinecap="round"
                opacity="0.8"
              />
            </g>
          ) : (
            /* Mini gold-trimmed green stock chart sign */
            <g transform="translate(4, 72)">
              <rect x="15" y="26" width="4" height="16" rx="2" fill="#C98D26" />
              <rect
                x="2"
                y="2"
                width="34"
                height="26"
                rx="6"
                fill="#0B1325"
                stroke={`url(#${goldGrad})`}
                strokeWidth="2"
              />
              {/* Candlesticks & rising trend */}
              <rect x="8" y="16" width="4" height="7" rx="1" fill="#EF4444" />
              <line
                x1="10"
                y1="14"
                x2="10"
                y2="24"
                stroke="#EF4444"
                strokeWidth="1.2"
              />
              <rect x="15" y="12" width="4" height="9" rx="1" fill="#22C55E" />
              <line
                x1="17"
                y1="9"
                x2="17"
                y2="23"
                stroke="#22C55E"
                strokeWidth="1.2"
              />
              <rect x="22" y="8" width="4" height="11" rx="1" fill="#22C55E" />
              <line
                x1="24"
                y1="6"
                x2="24"
                y2="21"
                stroke="#22C55E"
                strokeWidth="1.2"
              />
              <path
                d="M8 20 L16 14 L23 10 L30 7"
                stroke="#F3CD6A"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path d="M27.5 6.5 L31 6.5 L30.5 10" fill="#F3CD6A" />
            </g>
          )}
        </g>

        {/* Right arm (waves happily on done) */}
        <g
          className={
            waving ? "sls-mascot-wave-arm is-waving" : "sls-mascot-wave-arm"
          }
        >
          <path
            d={
              waving
                ? "M92 94 C104 88 112 78 115 66"
                : "M92 96 C103 99 107 107 103 114"
            }
            stroke={`url(#${suitGrad})`}
            strokeWidth="11"
            strokeLinecap="round"
          />
          <circle
            cx={waving ? 116 : 103}
            cy={waving ? 64 : 113}
            r="6.2"
            fill={`url(#${skinGrad})`}
          />
        </g>

        {/* Big adorable chibi head */}
        <g>
          {/* Ears */}
          <circle cx="29" cy="56" r="7" fill="#F5C8A2" />
          <circle cx="107" cy="56" r="7" fill="#F5C8A2" />
          {/* Head sphere */}
          <rect
            x="31"
            y="16"
            width="74"
            height="72"
            rx="35"
            fill={`url(#${skinGrad})`}
          />

          {/* Glossy rounded chibi hair */}
          <path
            d="M29 52 C28 24 46 11 68 11 C90 11 108 24 107 52 C104 42 98 37 91 34 C86 42 78 44 72 36 C65 44 53 45 45 36 C38 40 33 45 29 52 Z"
            fill={`url(#${hairGrad})`}
          />
          {/* Cute hair cowlick tuft */}
          <path
            d="M66 12 C69 4 78 5 76 13"
            stroke="#261F1B"
            strokeWidth="4.5"
            strokeLinecap="round"
          />
          {/* Glossy 3D highlight arc on hair */}
          <path
            d="M46 24 C54 18 66 17 75 20"
            stroke="#FFFFFF"
            strokeWidth="3"
            strokeLinecap="round"
            opacity="0.22"
          />

          {/* Rosy cheeks */}
          <ellipse
            cx="45"
            cy="65"
            rx="6.5"
            ry="3.8"
            fill="#F48A8A"
            opacity="0.45"
          />
          <ellipse
            cx="91"
            cy="65"
            rx="6.5"
            ry="3.8"
            fill="#F48A8A"
            opacity="0.45"
          />

          {/* Expressive chibi eyes (crescent joy when waving goodbye) */}
          {waving ? (
            <>
              <path
                d="M47 58 C50 52 57 52 60 58"
                stroke="#181B24"
                strokeWidth="3.4"
                strokeLinecap="round"
              />
              <path
                d="M76 58 C79 52 86 52 89 58"
                stroke="#181B24"
                strokeWidth="3.4"
                strokeLinecap="round"
              />
            </>
          ) : (
            <>
              <ellipse cx="53.5" cy="57" rx="6.2" ry="7.4" fill="#151924" />
              <ellipse cx="82.5" cy="57" rx="6.2" ry="7.4" fill="#151924" />
              {/* Twin specular eye highlights */}
              <circle cx="51.3" cy="54.2" r="2.3" fill="#FFFFFF" />
              <circle
                cx="55.6"
                cy="59.4"
                r="1.1"
                fill="#FFFFFF"
                opacity="0.85"
              />
              <circle cx="80.3" cy="54.2" r="2.3" fill="#FFFFFF" />
              <circle
                cx="84.6"
                cy="59.4"
                r="1.1"
                fill="#FFFFFF"
                opacity="0.85"
              />
            </>
          )}

          {/* Warm friendly smile */}
          <path
            d={
              waving
                ? "M61 68 C64 74 72 74 75 68"
                : "M63 69 C66 72.5 70 72.5 73 69"
            }
            stroke="#7A3E2A"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </g>
      </svg>
    </div>
  )
}

/**
 * Thần Tài-inspired auspicious gold coin (tiền xu cổ + nơ đỏ) spinning gently
 * beside the mascot on the trading floor enter screen.
 */
export function ThanTaiCoinSvg(): JSX.Element {
  const uid = useId()
  const coinFace = `${uid}-coin-face`
  const coinRim = `${uid}-coin-rim`

  return (
    <div className="sls-thantai-coin" aria-hidden="true">
      <svg
        className="sls-thantai-coin-svg"
        width="56"
        height="64"
        viewBox="0 0 56 64"
        fill="none"
      >
        <defs>
          <linearGradient id={coinFace} x1="12%" y1="8%" x2="88%" y2="92%">
            <stop offset="0%" stopColor="#FFF4BE" />
            <stop offset="48%" stopColor="#F3CD6A" />
            <stop offset="100%" stopColor="#C9881E" />
          </linearGradient>
          <linearGradient id={coinRim} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFE694" />
            <stop offset="100%" stopColor="#9C6410" />
          </linearGradient>
        </defs>

        {/* Red auspicious ribbon loop at top */}
        <path
          d="M28 11 C22 4 17 5 19 11 C21 15 26 14 28 12 C30 14 35 15 37 11 C39 5 34 4 28 11 Z"
          fill="#C8232C"
        />
        <circle cx="28" cy="11.5" r="2.6" fill="#F3CD6A" />

        {/* Gold coin body */}
        <circle
          cx="28"
          cy="36"
          r="21"
          fill={`url(#${coinFace})`}
          stroke={`url(#${coinRim})`}
          strokeWidth="2.5"
        />
        <circle
          cx="28"
          cy="36"
          r="16.2"
          fill="none"
          stroke="#FFF5CC"
          strokeWidth="1.2"
          opacity="0.8"
        />
        {/* Traditional square hole */}
        <rect
          x="22"
          y="30"
          width="12"
          height="12"
          rx="1.8"
          fill="#0E1830"
          stroke="#B57A1A"
          strokeWidth="1.6"
        />
        {/* Four cardinal dot ornaments */}
        <circle cx="28" cy="23.5" r="1.6" fill="#8C540B" />
        <circle cx="28" cy="48.5" r="1.6" fill="#8C540B" />
        <circle cx="15.5" cy="36" r="1.6" fill="#8C540B" />
        <circle cx="40.5" cy="36" r="1.6" fill="#8C540B" />
      </svg>
    </div>
  )
}

/**
 * Mini LED ticker strip sliding seamlessly on the compositor (translate3d)
 * matching BẢNG ĐIỆN VN30 in Khu Giao Dịch.
 */
export function FloorMiniTicker(): JSX.Element {
  return (
    <div className="sls-ticker" aria-hidden="true">
      <div className="sls-ticker-track">
        {[0, 1].map((dup) => (
          <div className="sls-ticker-group" key={dup}>
            {FLOOR_TICKER_ITEMS.map((item) => (
              <span className="sls-ticker-chip" key={`${dup}-${item.code}`}>
                <span
                  className={`sls-ticker-tri sls-ticker-tri--${item.tone}`}
                />
                <span className="sls-ticker-code">{item.code}</span>
                <span className="sls-ticker-label">{item.label}</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Chibi walnut desk + dark monitor with green chart + cream coffee mug with
 * rising CSS steam wisps for Văn phòng enter mode.
 */
export function OfficeDeskAccentSvg(): JSX.Element {
  const uid = useId()
  const woodGrad = `${uid}-wood`
  const screenGrad = `${uid}-screen`

  return (
    <div className="sls-office-desk" aria-hidden="true">
      <svg
        className="sls-office-desk-svg"
        width="120"
        height="112"
        viewBox="0 0 120 112"
        fill="none"
      >
        <defs>
          <linearGradient id={woodGrad} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#A9703E" />
            <stop offset="100%" stopColor="#724622" />
          </linearGradient>
          <linearGradient id={screenGrad} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#13223D" />
            <stop offset="100%" stopColor="#091122" />
          </linearGradient>
        </defs>

        {/* Rising coffee steam wisps (animated with transform + opacity) */}
        <path
          className="sls-steam sls-steam-1"
          d="M90 50 C88 45 92 42 90 36"
          stroke="#FFFAF0"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          className="sls-steam sls-steam-2"
          d="M96 49 C98 44 94 40 96 34"
          stroke="#F3CD6A"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          className="sls-steam sls-steam-3"
          d="M102 51 C100 46 103 43 101 38"
          stroke="#FFFAF0"
          strokeWidth="1.6"
          strokeLinecap="round"
        />

        {/* Monitor on desk */}
        <rect
          x="18"
          y="28"
          width="54"
          height="36"
          rx="6"
          fill="#1B2A48"
          stroke="rgba(243, 205, 106, 0.48)"
          strokeWidth="1.5"
        />
        <rect
          x="22"
          y="32"
          width="46"
          height="27"
          rx="3"
          fill={`url(#${screenGrad})`}
        />
        {/* Stylized green chart curve on monitor */}
        <path
          d="M26 52 L35 46 L42 49 L52 40 L63 36"
          stroke="#4ADE80"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="63" cy="36" r="2.4" fill="#F3CD6A" />
        {/* Monitor stand */}
        <rect x="41" y="64" width="8" height="7" rx="1.5" fill="#1F2D4A" />
        <rect x="33" y="69" width="24" height="3.5" rx="1.75" fill="#2A3B60" />

        {/* Cream ceramic coffee mug */}
        <path
          d="M104 59 C110 59 110 68 104 68"
          stroke="#FFFAF0"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <rect x="86" y="55" width="19" height="17" rx="4" fill="#FFFAF0" />
        <rect x="86" y="59" width="19" height="3.2" fill="#D9A03A" />
        <ellipse cx="95.5" cy="56" rx="7.5" ry="2" fill="#6F4222" />

        {/* Walnut desk top & front apron */}
        <rect
          x="8"
          y="71"
          width="104"
          height="9"
          rx="4"
          fill="#B9804D"
          stroke="rgba(255, 240, 190, 0.25)"
          strokeWidth="1"
        />
        <rect
          x="14"
          y="80"
          width="92"
          height="24"
          rx="4"
          fill={`url(#${woodGrad})`}
        />
        {/* Desk gold nameplate matching office-saco screenshot */}
        <rect
          x="38"
          y="87"
          width="44"
          height="11"
          rx="3"
          fill="#0E1830"
          stroke="#F3CD6A"
          strokeWidth="1.2"
        />
        <rect x="46" y="91.5" width="28" height="2.2" rx="1.1" fill="#F3CD6A" />
      </svg>
    </div>
  )
}

interface ProgressRunnerSvgProps {
  room: SpaceRoom
}

/**
 * Chunky golden runner coin riding the leading edge of the progress bar.
 */
export function ProgressRunnerSvg({
  room,
}: ProgressRunnerSvgProps): JSX.Element {
  const uid = useId()
  const gradId = `${uid}-runner`

  return (
    <svg
      className="sls-runner-svg"
      width="28"
      height="28"
      viewBox="0 0 28 28"
      fill="none"
    >
      <defs>
        <linearGradient id={gradId} x1="10%" y1="10%" x2="90%" y2="90%">
          <stop offset="0%" stopColor="#FFF5C2" />
          <stop offset="50%" stopColor="#F3CD6A" />
          <stop offset="100%" stopColor="#C9881E" />
        </linearGradient>
      </defs>
      <circle
        cx="14"
        cy="14"
        r="12"
        fill={`url(#${gradId})`}
        stroke="#0E1830"
        strokeWidth="2"
      />
      <circle
        cx="14"
        cy="14"
        r="8.5"
        fill="none"
        stroke="#FFF8DA"
        strokeWidth="1.1"
        opacity="0.85"
      />
      {room === "floor" ? (
        <rect
          x="10.5"
          y="10.5"
          width="7"
          height="7"
          rx="1.2"
          fill="#0E1830"
          stroke="#B57A1A"
          strokeWidth="1"
        />
      ) : (
        <path
          d="M14 8.5 L18 14 L14 19.5 L10 14 Z"
          fill="#0E1830"
          opacity="0.82"
        />
      )}
    </svg>
  )
}

/**
 * Compact spinning gold coin shown while waiting in door mode.
 */
export function DoorSpinnerCoinSvg(): JSX.Element {
  const uid = useId()
  const gradId = `${uid}-door-coin`

  return (
    <svg
      className="sls-door-coin-svg"
      width="32"
      height="32"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="10%" y1="10%" x2="90%" y2="90%">
          <stop offset="0%" stopColor="#FFF4BE" />
          <stop offset="52%" stopColor="#F3CD6A" />
          <stop offset="100%" stopColor="#C9881E" />
        </linearGradient>
      </defs>
      <circle
        cx="16"
        cy="16"
        r="13.5"
        fill={`url(#${gradId})`}
        stroke="#8C540B"
        strokeWidth="1.8"
      />
      <circle
        cx="16"
        cy="16"
        r="9.8"
        fill="none"
        stroke="#FFF8D8"
        strokeWidth="1.1"
        opacity="0.85"
      />
      <rect
        x="12.2"
        y="12.2"
        width="7.6"
        height="7.6"
        rx="1.2"
        fill="#0E1830"
        stroke="#B57A1A"
        strokeWidth="1"
      />
    </svg>
  )
}
