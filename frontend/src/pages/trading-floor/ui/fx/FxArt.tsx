/**
 * Procedural inline SVG chibi illustrations for the Gáy, Khấn and Tán lộc cards.
 * Zero external assets, zero emoji, unique gradient IDs per mount via `useId`.
 */
import { useId } from "react"

import { cx } from "../utils.ts"

/** Playful chibi rooster holding a sunrise megaphone inside a sunlit medallion. */
export function ChibiRoosterArt({ cheering }: { cheering: boolean }) {
  const uid = useId().replace(/:/g, "")
  const sunBg = `fx-r-sun-${uid}`
  const bodyFill = `fx-r-body-${uid}`
  const combFill = `fx-r-comb-${uid}`
  const hornFill = `fx-r-horn-${uid}`
  const goldTrim = `fx-r-gold-${uid}`

  return (
    <div
      className={cx("fx-art-badge fx-art-badge--gay", cheering && "is-active")}
      aria-hidden="true"
    >
      <svg
        className="fx-art-svg fx-rooster-svg"
        viewBox="0 0 88 88"
        width="64"
        height="64"
        fill="none"
      >
        <defs>
          <radialGradient id={sunBg} cx="46%" cy="38%" r="62%">
            <stop offset="0%" stopColor="#FFF7CC" />
            <stop offset="58%" stopColor="#FFD25A" />
            <stop offset="100%" stopColor="#F58220" />
          </radialGradient>
          <linearGradient id={bodyFill} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="68%" stopColor="#FFF6DF" />
            <stop offset="100%" stopColor="#F2D7A4" />
          </linearGradient>
          <linearGradient id={combFill} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FF5A47" />
            <stop offset="100%" stopColor="#C81E1E" />
          </linearGradient>
          <linearGradient id={hornFill} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FF6B2B" />
            <stop offset="65%" stopColor="#E0311D" />
            <stop offset="100%" stopColor="#9E1912" />
          </linearGradient>
          <linearGradient id={goldTrim} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFF3B0" />
            <stop offset="55%" stopColor="#FFC745" />
            <stop offset="100%" stopColor="#D47E12" />
          </linearGradient>
        </defs>

        {/* Sunlit medallion base + soft sunrise rays */}
        <circle cx="44" cy="44" r="41" fill={`url(#${sunBg})`} />
        <g className="fx-rooster-rays" opacity="0.32" stroke="#FFF9E0" strokeWidth="2.4" strokeLinecap="round">
          <line x1="44" y1="6" x2="44" y2="12" />
          <line x1="69" y1="15" x2="65" y2="19" />
          <line x1="19" y1="15" x2="23" y2="19" />
          <line x1="79" y1="40" x2="73" y2="41" />
          <line x1="9" y1="40" x2="15" y2="41" />
        </g>

        {/* Soft ground shadow */}
        <ellipse cx="38" cy="75.5" rx="22" ry="4.5" fill="rgba(128, 36, 8, 0.24)" />

        {/* Fluffy tail feathers peeking behind */}
        <path
          d="M19 52 C10 47 10 37 18 36 C13 40 16 45 23 47 Z"
          fill="#F97316"
          stroke="#9E2A0E"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <path
          d="M21 57 C11 56 10 48 16 45 C14 50 18 52 24 53 Z"
          fill="#EF4444"
          stroke="#9E2A0E"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />

        {/* Chibi rooster feet */}
        <path
          d="M32 70 L30 75 M32 70 L34 75.5 M44 70 L42 75.5 M44 70 L46 75"
          stroke="#D96B12"
          strokeWidth="2.4"
          strokeLinecap="round"
        />

        {/* Plump chibi body + oversized head */}
        <ellipse
          cx="38"
          cy="58"
          rx="18.5"
          ry="15.5"
          fill={`url(#${bodyFill})`}
          stroke="#8C3D12"
          strokeWidth="1.8"
        />
        <circle
          cx="38"
          cy="40"
          r="19.5"
          fill={`url(#${bodyFill})`}
          stroke="#8C3D12"
          strokeWidth="1.8"
        />

        {/* Cute golden collar feather tuft */}
        <path
          d="M25 51 Q31 56 38 54 Q45 56 51 51"
          stroke="#F4C16B"
          strokeWidth="2.2"
          strokeLinecap="round"
          fill="none"
        />

        {/* Bouncy 3-lobed crimson rooster comb */}
        <path
          d="M28 24 C25 14 33 11 36 18 C38 9 47 10 46 19 C51 14 56 20 50 26 C44 23 34 23 28 24 Z"
          fill={`url(#${combFill})`}
          stroke="#8C1814"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <ellipse cx="40.5" cy="15.5" rx="2.3" ry="1.3" fill="#FFA494" opacity="0.8" />

        {/* Little left wing tucked cheerfully */}
        <path
          d="M21 53 C17 58 20 66 28 65 C30 61 28 54 21 53 Z"
          fill="#FDE8BE"
          stroke="#8C3D12"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />

        {/* Chibi sparkling eyes & rosy cheeks */}
        <circle cx="31.5" cy="39" r="3.1" fill="#23100A" />
        <circle cx="30.5" cy="37.8" r="1.15" fill="#FFFFFF" />
        <path
          d="M42.5 39.2 Q46 35.8 49.5 39.2"
          stroke="#23100A"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />
        <ellipse cx="26.5" cy="44" rx="3.8" ry="2.2" fill="#FF8C7A" opacity="0.62" />
        <ellipse cx="48.5" cy="44" rx="3.4" ry="2" fill="#FF8C7A" opacity="0.62" />

        {/* Open crowing golden beak + tiny wattle */}
        <path
          d="M46 41 L55.5 39.5 L48.5 44.5 Z"
          fill="#FFB02E"
          stroke="#8C3D12"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
        <path
          d="M47 44.5 L53.5 46.5 L46.2 47.5 Z"
          fill="#F97316"
          stroke="#8C3D12"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <path
          d="M45 48 C43.5 52 46.5 54 48.5 52 C49.5 50.8 48.5 48.8 47.5 48 Z"
          fill="#E52D27"
          stroke="#8C1814"
          strokeWidth="1.1"
        />

        {/* Chunky sunrise megaphone held to the right */}
        <g className="fx-rooster-horn">
          {/* Handle */}
          <rect
            x="52"
            y="53"
            width="5"
            height="10"
            rx="2.5"
            transform="rotate(-14 52 53)"
            fill="#6B1D0F"
            stroke="#3B0D06"
            strokeWidth="1.1"
          />
          {/* Cone */}
          <path
            d="M49 48 L69 37 L73 56 L51 54 Z"
            fill={`url(#${hornFill})`}
            stroke="#7A180D"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          {/* Bright highlight stripe on cone */}
          <path d="M53 48.2 L66.5 41.2" stroke="#FFA56B" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
          {/* Golden bell rim */}
          <ellipse
            cx="71"
            cy="46.5"
            rx="3.8"
            ry="10.2"
            transform="rotate(-11 71 46.5)"
            fill={`url(#${goldTrim})`}
            stroke="#7A2D0C"
            strokeWidth="1.4"
          />
          <ellipse
            cx="71.2"
            cy="46.5"
            rx="1.6"
            ry="6.6"
            transform="rotate(-11 71.2 46.5)"
            fill="#7C1B0C"
          />
        </g>

        {/* Curved golden sound waves (gently animated in CSS) */}
        <g className="fx-sound-waves" stroke="#FFF8D6" strokeLinecap="round" fill="none">
          <path className="fx-sound-wave fx-sound-wave--1" d="M76 41.5 Q79.5 45.5 77 50.5" strokeWidth="2.1" />
          <path className="fx-sound-wave fx-sound-wave--2" d="M79.5 37.5 Q84.5 44.5 81 53.5" strokeWidth="2" />
        </g>

        {/* Outer crisp gold ring */}
        <circle cx="44" cy="44" r="41" stroke="#FFE285" strokeWidth="2.4" />
      </svg>
    </div>
  )
}

/** Calm chibi temple incense burner with 3 glowing sticks, CSS-animated smoke, lotus & cloud motifs. */
export function ChibiIncenseAltarArt() {
  const uid = useId().replace(/:/g, "")
  const haloBg = `fx-k-halo-${uid}`
  const brassFill = `fx-k-brass-${uid}`
  const brassRim = `fx-k-rim-${uid}`
  const petalFill = `fx-k-petal-${uid}`

  return (
    <div className="fx-art-badge fx-art-badge--khan" aria-hidden="true">
      {/* Gentle CSS-animated incense smoke wisps rising from the 3 sticks */}
      <div className="fx-incense-smoke-layer">
        <span className="fx-smoke-wisp fx-smoke-wisp--1" />
        <span className="fx-smoke-wisp fx-smoke-wisp--2" />
        <span className="fx-smoke-wisp fx-smoke-wisp--3" />
      </div>

      <svg
        className="fx-art-svg fx-incense-svg"
        viewBox="0 0 88 88"
        width="64"
        height="64"
        fill="none"
      >
        <defs>
          <radialGradient id={haloBg} cx="50%" cy="46%" r="58%">
            <stop offset="0%" stopColor="#9B1B1B" />
            <stop offset="68%" stopColor="#5C0D0E" />
            <stop offset="100%" stopColor="#350608" />
          </radialGradient>
          <linearGradient id={brassFill} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFF2B8" />
            <stop offset="45%" stopColor="#F0BC44" />
            <stop offset="100%" stopColor="#9B630E" />
          </linearGradient>
          <linearGradient id={brassRim} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFF7CE" />
            <stop offset="100%" stopColor="#C98A1B" />
          </linearGradient>
          <linearGradient id={petalFill} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFE0D6" />
            <stop offset="55%" stopColor="#F6A29B" />
            <stop offset="100%" stopColor="#B83B3B" />
          </linearGradient>
        </defs>

        {/* Temple medallion */}
        <circle cx="44" cy="44" r="41" fill={`url(#${haloBg})`} />
        <circle
          cx="44"
          cy="44"
          r="35.5"
          stroke="rgba(246, 210, 122, 0.34)"
          strokeWidth="1.2"
          strokeDasharray="4 4"
        />

        {/* Soft warm halo behind incense embers */}
        <circle cx="44" cy="30" r="16" fill="rgba(255, 208, 102, 0.16)" />

        {/* Subtle golden cloud curls flanking the altar */}
        <path
          d="M11 63 Q14 58 19 60 Q22 57 25 61"
          stroke="#F2C14E"
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity="0.65"
        />
        <path
          d="M63 61 Q66 57 69 60 Q74 58 77 63"
          stroke="#F2C14E"
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity="0.65"
        />

        {/* Three incense sticks fanned gently */}
        <line x1="39" y1="49" x2="34.5" y2="23" stroke="#7A1A14" strokeWidth="2.4" strokeLinecap="round" />
        <line x1="44" y1="49" x2="44" y2="19.5" stroke="#8C1D16" strokeWidth="2.4" strokeLinecap="round" />
        <line x1="49" y1="49" x2="53.5" y2="23" stroke="#7A1A14" strokeWidth="2.4" strokeLinecap="round" />

        {/* Incense stick golden bases */}
        <line x1="39" y1="49" x2="37.5" y2="41" stroke="#EAB308" strokeWidth="2.2" strokeLinecap="round" />
        <line x1="44" y1="49" x2="44" y2="40" stroke="#EAB308" strokeWidth="2.2" strokeLinecap="round" />
        <line x1="49" y1="49" x2="50.5" y2="41" stroke="#EAB308" strokeWidth="2.2" strokeLinecap="round" />

        {/* Glowing embers */}
        <g className="fx-incense-embers">
          <circle cx="34.5" cy="22.4" r="3.4" fill="rgba(255, 138, 43, 0.36)" />
          <circle cx="34.5" cy="22.4" r="1.8" fill="#FFE699" />
          <circle cx="44" cy="19" r="3.8" fill="rgba(255, 138, 43, 0.42)" />
          <circle cx="44" cy="19" r="2" fill="#FFF1B8" />
          <circle cx="53.5" cy="22.4" r="3.4" fill="rgba(255, 138, 43, 0.36)" />
          <circle cx="53.5" cy="22.4" r="1.8" fill="#FFE699" />
        </g>

        {/* Stylized chibi lotus petal cushion beneath the burner */}
        <path
          d="M20 71 Q26 60 36 67 Q30 74 20 71 Z"
          fill={`url(#${petalFill})`}
          stroke="#F6D27A"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <path
          d="M68 71 Q62 60 52 67 Q58 74 68 71 Z"
          fill={`url(#${petalFill})`}
          stroke="#F6D27A"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <path
          d="M28 74 Q36 64 44 68 Q52 64 60 74 Q44 79 28 74 Z"
          fill={`url(#${petalFill})`}
          stroke="#F6D27A"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />

        {/* Chibi incense burner curved handles */}
        <path
          d="M26 52 C19 52 19 61 27 61"
          stroke="#F2C14E"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M62 52 C69 52 69 61 61 61"
          stroke="#F2C14E"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />

        {/* Plump brass chibi cauldron (lư hương) */}
        <path
          d="M26 49 H62 C63 63 56 71 44 71 C32 71 25 63 26 49 Z"
          fill={`url(#${brassFill})`}
          stroke="#6E3F07"
          strokeWidth="1.6"
        />
        {/* Rim & ash bed */}
        <ellipse cx="44" cy="48.5" rx="18.5" ry="4.4" fill="#D8C3A0" stroke="#7A4808" strokeWidth="1.4" />
        <rect
          x="24.5"
          y="46.5"
          width="39"
          height="5.2"
          rx="2.6"
          fill={`url(#${brassRim})`}
          stroke="#6E3F07"
          strokeWidth="1.3"
        />

        {/* Center auspicious coin emblem on the burner */}
        <circle cx="44" cy="60.5" r="5.5" fill="#7A1313" stroke="#FFF0B3" strokeWidth="1.2" />
        <rect x="42.1" y="58.6" width="3.8" height="3.8" rx="0.6" fill="#F6D27A" />
        {/* Specular shine on burner */}
        <ellipse cx="33" cy="57" rx="2.5" ry="4.5" transform="rotate(-12 33 57)" fill="#FFF9DE" opacity="0.45" />

        {/* Outer antique gold border */}
        <circle cx="44" cy="44" r="41" stroke="#F2C14E" strokeWidth="2.4" />
      </svg>
    </div>
  )
}

/** Cute chibi lucky gold ingot & coins badge for the lightly aligned Tán lộc card. */
export function ChibiCoinPouchArt() {
  const uid = useId().replace(/:/g, "")
  const bg = `fx-p-bg-${uid}`
  const gold = `fx-p-gold-${uid}`

  return (
    <div className="fx-art-badge fx-art-badge--rain" aria-hidden="true">
      <svg
        className="fx-art-svg"
        viewBox="0 0 64 64"
        width="48"
        height="48"
        fill="none"
      >
        <defs>
          <radialGradient id={bg} cx="45%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#263B59" />
            <stop offset="100%" stopColor="#101A2B" />
          </radialGradient>
          <linearGradient id={gold} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFF4BE" />
            <stop offset="50%" stopColor="#F3C14B" />
            <stop offset="100%" stopColor="#B87A14" />
          </linearGradient>
        </defs>
        <circle cx="32" cy="32" r="30" fill={`url(#${bg})`} stroke="#E9B949" strokeWidth="2" />
        {/* Back coin */}
        <circle cx="42" cy="24" r="9.5" fill={`url(#${gold})`} stroke="#7D4C08" strokeWidth="1.4" />
        <rect x="39.5" y="21.5" width="5" height="5" rx="0.8" fill="#7D4C08" />
        {/* Front chibi gold ingot (thỏi vàng) */}
        <path
          d="M12 36 Q15 28 24 29 Q28 21 34 21 Q40 21 44 29 Q53 28 56 36 Q52 48 34 49 Q16 48 12 36 Z"
          fill={`url(#${gold})`}
          stroke="#7D4C08"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <ellipse cx="34" cy="29.5" rx="7.5" ry="4" fill="#FFF7D4" opacity="0.8" />
        <path d="M23 39 Q34 43 45 39" stroke="#9C620C" strokeWidth="1.6" strokeLinecap="round" opacity="0.65" />
      </svg>
    </div>
  )
}

/** Faint lotus flower watermark for the Khấn parchment scroll. */
export function LotusWatermarkSvg() {
  return (
    <svg
      className="fx-scroll-watermark"
      viewBox="0 0 80 46"
      width="72"
      height="41"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M40 6 C35 16 35 28 40 38 C45 28 45 16 40 6 Z"
        fill="currentColor"
      />
      <path
        d="M40 38 C31 32 25 22 24 13 C33 17 38 26 40 38 Z"
        fill="currentColor"
        opacity="0.8"
      />
      <path
        d="M40 38 C49 32 55 22 56 13 C47 17 42 26 40 38 Z"
        fill="currentColor"
        opacity="0.8"
      />
      <path
        d="M40 39 C26 39 16 33 11 25 C22 24 32 29 40 39 Z"
        fill="currentColor"
        opacity="0.58"
      />
      <path
        d="M40 39 C54 39 64 33 69 25 C58 24 48 29 40 39 Z"
        fill="currentColor"
        opacity="0.58"
      />
    </svg>
  )
}
