/** Drawn pieces of the altar (from the MAU mockup): lanterns, the Thần Tài statue, the altar table. */
import { cx } from "../utils.ts"

export function Lantern({ side, glyph }: { side: "l" | "r"; glyph: string }) {
  return (
    <svg
      className={cx(
        "tt-lantern",
        side === "l" ? "tt-lantern-l" : "tt-lantern-r"
      )}
      viewBox="0 0 54 110"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={`tt-lg-${side}`} cx=".35" cy=".35" r=".7">
          <stop offset="0" stopColor="#fff" stopOpacity=".35" />
          <stop offset="1" stopColor="#000" stopOpacity=".15" />
        </radialGradient>
      </defs>
      <line x1="27" y1="0" x2="27" y2="18" stroke="#b8860b" strokeWidth="2" />
      <rect x="17" y="16" width="20" height="6" rx="2" fill="#d4a017" />
      <ellipse cx="27" cy="50" rx="25" ry="29" fill="#c81e1e" />
      <ellipse cx="27" cy="50" rx="25" ry="29" fill={`url(#tt-lg-${side})`} />
      <path
        d="M14 26v48M27 21v58M40 26v48"
        stroke="#8b1010"
        strokeWidth="1.5"
        opacity=".6"
      />
      <rect x="17" y="77" width="20" height="6" rx="2" fill="#d4a017" />
      <path
        d="M22 83v22M27 83v26M32 83v22"
        stroke="#f2c14e"
        strokeWidth="1.5"
      />
      <text
        x="27"
        y="56"
        textAnchor="middle"
        fontFamily="serif"
        fontSize="16"
        fontWeight="800"
        fill="#f2c14e"
      >
        {glyph}
      </text>
    </svg>
  )
}

/** Thần Tài with the breathing halo; `blessed` makes the halo brighter (ritual finished today). */
export function Statue({ blessed }: { blessed: boolean }) {
  return (
    <div className={cx("tt-god", blessed && "tt-blessed")}>
      <div className="tt-halo" aria-hidden="true" />
      <svg
        viewBox="0 0 240 250"
        width="100%"
        role="img"
        aria-label="Tượng Thần Tài"
      >
        <defs>
          <linearGradient id="tt-robe" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#e11d1d" />
            <stop offset="1" stopColor="#8b0f0f" />
          </linearGradient>
          <linearGradient id="tt-gold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff0a8" />
            <stop offset=".5" stopColor="#f2c14e" />
            <stop offset="1" stopColor="#a8770f" />
          </linearGradient>
          <radialGradient id="tt-skin" cx=".45" cy=".4" r=".7">
            <stop offset="0" stopColor="#ffe7c7" />
            <stop offset="1" stopColor="#f0bf8f" />
          </radialGradient>
        </defs>
        <ellipse cx="120" cy="240" rx="92" ry="9" fill="rgba(0,0,0,.35)" />
        <path
          d="M40 238 Q44 150 120 132 Q196 150 200 238 Z"
          fill="url(#tt-robe)"
        />
        <path
          d="M120 132 L104 238 L136 238 Z"
          fill="url(#tt-gold)"
          opacity=".9"
        />
        <path
          d="M62 238 Q70 186 96 160"
          stroke="url(#tt-gold)"
          strokeWidth="5"
          fill="none"
        />
        <path
          d="M178 238 Q170 186 144 160"
          stroke="url(#tt-gold)"
          strokeWidth="5"
          fill="none"
        />
        <circle cx="120" cy="196" r="15" fill="url(#tt-gold)" />
        <text
          x="120"
          y="202"
          textAnchor="middle"
          fontFamily="serif"
          fontSize="16"
          fontWeight="800"
          fill="#8b0f0f"
        >
          財
        </text>
        <path
          d="M70 168 Q60 196 82 206 L102 200 Q90 186 94 168 Z"
          fill="url(#tt-robe)"
        />
        <path
          d="M170 168 Q180 196 158 206 L138 200 Q150 186 146 168 Z"
          fill="url(#tt-robe)"
        />
        <g transform="translate(120 206)">
          <path
            d="M-34 -6 Q-30 -18 -18 -16 Q-12 -32 0 -32 Q12 -32 18 -16 Q30 -18 34 -6 Q30 10 0 12 Q-30 10 -34 -6 Z"
            fill="url(#tt-gold)"
            stroke="#a8770f"
          />
          <ellipse
            cx="0"
            cy="-20"
            rx="10"
            ry="7"
            fill="#fff3b0"
            opacity=".85"
          />
        </g>
        <ellipse cx="88" cy="206" rx="11" ry="9" fill="url(#tt-skin)" />
        <ellipse cx="152" cy="206" rx="11" ry="9" fill="url(#tt-skin)" />
        <ellipse cx="120" cy="98" rx="36" ry="38" fill="url(#tt-skin)" />
        <ellipse cx="86" cy="100" rx="6" ry="9" fill="#f0bf8f" />
        <ellipse cx="154" cy="100" rx="6" ry="9" fill="#f0bf8f" />
        <path
          d="M102 92 Q108 86 114 92"
          stroke="#3b1d06"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M126 92 Q132 86 138 92"
          stroke="#3b1d06"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
        <ellipse cx="104" cy="106" rx="7" ry="4" fill="#fb7185" opacity=".45" />
        <ellipse cx="136" cy="106" rx="7" ry="4" fill="#fb7185" opacity=".45" />
        <path
          d="M108 112 Q120 124 132 112"
          stroke="#7c2d12"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M100 116 Q108 120 120 117 Q132 120 140 116 Q138 150 120 160 Q102 150 100 116 Z"
          fill="#2b1a10"
        />
        <path
          d="M104 114 Q112 110 120 114 Q128 110 136 114"
          stroke="#2b1a10"
          strokeWidth="5"
          fill="none"
          strokeLinecap="round"
        />
        <path d="M80 70 Q120 30 160 70 L160 78 L80 78 Z" fill="#1f1209" />
        <path d="M84 62 Q120 22 156 62" fill="url(#tt-gold)" />
        <rect
          x="80"
          y="70"
          width="80"
          height="12"
          rx="4"
          fill="url(#tt-gold)"
        />
        <circle
          cx="120"
          cy="58"
          r="7"
          fill="#e11d48"
          stroke="#fff0a8"
          strokeWidth="2"
        />
        <path
          d="M80 72 Q52 56 34 70 Q52 74 80 80 Z"
          fill="#1f1209"
          stroke="url(#tt-gold)"
          strokeWidth="2"
        />
        <path
          d="M160 72 Q188 56 206 70 Q188 74 160 80 Z"
          fill="#1f1209"
          stroke="url(#tt-gold)"
          strokeWidth="2"
        />
      </svg>
    </div>
  )
}

/** The altar table carved 福 祿 壽 with candles, the incense burner and gold ingots. */
export function AltarTable() {
  return (
    <div className="tt-table" aria-hidden="true">
      <div className="tt-props">
        <div className="tt-candle" />
        <div className="tt-ingots">
          <div className="tt-ingot" />
          <div className="tt-ingot tt-ingot-up" />
        </div>
        <div className="tt-burner">
          <i />
          <i />
          <i />
          <span className="tt-smoke" />
          <span className="tt-smoke" />
          <span className="tt-smoke" />
        </div>
        <div className="tt-ingots">
          <div className="tt-ingot tt-ingot-up" />
          <div className="tt-ingot" />
        </div>
        <div className="tt-candle" />
      </div>
      <div className="tt-table-top" />
      <div className="tt-table-front" />
    </div>
  )
}

/** Gold ingot slot of the cầu mã step: dashed and empty, or filled gold. */
export function IngotSlotArt({ full }: { full: boolean }) {
  return (
    <svg viewBox="0 0 118 80" aria-hidden="true">
      {full && (
        <defs>
          <linearGradient id="tt-ingot-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff0a8" />
            <stop offset=".55" stopColor="#f2c14e" />
            <stop offset="1" stopColor="#a8770f" />
          </linearGradient>
        </defs>
      )}
      <path
        d="M6 34 Q10 22 24 24 Q34 4 59 4 Q84 4 94 24 Q108 22 112 34 Q108 66 59 72 Q10 66 6 34 Z"
        fill={full ? "url(#tt-ingot-fill)" : "rgba(0,0,0,.25)"}
        stroke={full ? "#a8770f" : "#8a5a1a"}
        strokeWidth="2"
        strokeDasharray={full ? undefined : "5 4"}
      />
      {full && (
        <ellipse cx="59" cy="22" rx="20" ry="9" fill="#fff6c8" opacity=".75" />
      )}
    </svg>
  )
}

/** The bamboo cup with 8 red-tipped sticks and the word XĂM. */
export function TubeArt() {
  return (
    <svg
      className="tt-tube"
      width="150"
      height="230"
      viewBox="0 0 150 230"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="tt-bam" x1="0" x2="1">
          <stop offset="0" stopColor="#8a5a1a" />
          <stop offset=".35" stopColor="#e6c27a" />
          <stop offset=".65" stopColor="#c99a4a" />
          <stop offset="1" stopColor="#6b4210" />
        </linearGradient>
        <linearGradient id="tt-stk" x1="0" x2="1">
          <stop offset="0" stopColor="#c79a45" />
          <stop offset=".5" stopColor="#f6e2a8" />
          <stop offset="1" stopColor="#b8893a" />
        </linearGradient>
      </defs>
      {[26, 38, 50, 62, 74, 86, 98, 110].map((x, i) => (
        <g key={x}>
          <rect
            x={x}
            y={12 + (i % 3) * 9}
            width="9"
            height="100"
            rx="2"
            fill="url(#tt-stk)"
            stroke="#8a6a2a"
          />
          <rect
            x={x + 1}
            y={16 + (i % 3) * 9}
            width="7"
            height="16"
            rx="1"
            fill="#b91c1c"
          />
        </g>
      ))}
      <path
        d="M18 74 H132 L124 214 Q75 228 26 214 Z"
        fill="url(#tt-bam)"
        stroke="#5a3a10"
        strokeWidth="2"
      />
      <path
        d="M22 118 H128 M24 170 H126"
        stroke="#6b4210"
        strokeWidth="3"
        opacity=".7"
      />
      <rect
        x="18"
        y="68"
        width="114"
        height="12"
        rx="4"
        fill="#c81e1e"
        stroke="#f2c14e"
        strokeWidth="2"
      />
      <rect
        x="44"
        y="128"
        width="62"
        height="34"
        rx="5"
        fill="#c81e1e"
        stroke="#f2c14e"
        strokeWidth="2"
      />
      <text
        x="75"
        y="151"
        textAnchor="middle"
        fontFamily="'Noto Serif', serif"
        fontSize="17"
        fontWeight="800"
        fill="#f2c14e"
      >
        XĂM
      </text>
    </svg>
  )
}

/** Coins falling over the whole floor for about 3 s. Positions are fixed per index (no random in render). */
export function CoinRain({ count }: { count: number }) {
  return (
    <div className="tt-fx" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => {
        const left = (i * 61.8 + 7) % 100
        const duration = 2 + ((i * 0.37) % 1) * 1.6
        const delay = ((i * 0.53) % 1) * 0.9
        return (
          <span
            key={i}
            className="tt-coin"
            style={{
              left: `${left}%`,
              animationDuration: `${duration}s`,
              animationDelay: `${delay}s`,
            }}
          />
        )
      })}
    </div>
  )
}
