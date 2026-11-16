/** The Kinh Dịch card: back 卦, front with day line, rank seal, hexagram and the luận. */
import { Compass } from "lucide-react"
import type { CSSProperties } from "react"

import type { HanhGroup, ThanTaiDay, ThanTaiLa } from "../../net/types.ts"
import { HANG_META, HANH_COLOR, hexLines } from "../../than-tai.ts"
import { cx } from "../utils.ts"

interface Props {
  la: ThanTaiLa
  day: ThanTaiDay
  /** Just drawn: flip, press the seal, and Đại cát shines. Off with reduced motion. */
  animate: boolean
}

export function QueCard({ la, day, animate }: Props) {
  const hang = HANG_META[la.hang]
  const dai = la.hang === "dai_cat"
  const style = { "--hc": hang.color } as CSSProperties
  return (
    <div className="tt-qwrap">
      <div className={cx("tt-qcard", animate && "tt-qcard-anim")}>
        <div className="tt-qf" aria-hidden="true">
          <span>卦</span>
        </div>
        <article
          className={cx(
            "tt-qb",
            dai && "tt-qb-dai",
            dai && animate && "tt-qb-shine"
          )}
          style={style}
          aria-label={`Quẻ ${la.que.ten}, ${hang.label}`}
        >
          <div className={cx("tt-stamp", animate && "tt-stamp-press")}>
            {hang.seal[0]}
            <br />
            {hang.seal[1]}
          </div>
          <div className="tt-dline">
            <span
              className="tt-hd"
              style={{ background: HANH_COLOR[day.hanh] }}
            >
              {day.hanhLabel}
            </span>
            <span className="tt-nw">
              Ngày <b>{day.canChi}</b>
            </span>
            <span className="tt-nw">· {day.napAm}</span>
          </div>
          <div className="tt-lb">QUẺ CHỦ</div>
          <div className="tt-han" lang="zh">
            {la.que.chuHan}
          </div>
          <div className="tt-ten">{la.que.ten}</div>
          <div className="tt-hexrow">
            <Hexagram hao={la.que.hao} moving={la.haoDong.so} />
            <div className="tt-tg">
              <span>
                {la.que.tren.symbol} {la.que.tren.ten} trên
              </span>
              <span>
                {la.que.duoi.symbol} {la.que.duoi.ten} dưới
              </span>
            </div>
          </div>
          <div className="tt-tuong">{la.que.tuong}</div>
          <Luan la={la} day={day} />
        </article>
      </div>
    </div>
  )
}

function Luan({ la, day }: { la: ThanTaiLa; day: ThanTaiDay }) {
  return (
    <div className="tt-lun">
      <div className="tt-orn">❖</div>
      <div className="tt-sec">
        <div className="tt-k">Thầy luận</div>
        <p className="tt-luan">{la.luan}</p>
      </div>
      <NganhBox kind="hop" title="Ngành hợp" groups={day.hop} />
      <NganhBox kind="kieng" title="Ngành kiêng" groups={day.kieng} />
      <div className="tt-tk">Luận theo ngũ hành, mang tính tham khảo vui.</div>
      <div className="tt-mh">
        {day.mau.length > 0 && (
          <span className="tt-mau">
            {day.mau.map((m) => (
              <i key={m.ten} style={{ background: m.hex }} />
            ))}
            Màu hợp: <b>{day.mau.map((m) => m.ten).join(", ")}</b>
          </span>
        )}
        {day.huong && (
          <span className="tt-mau">
            <Compass size={14} aria-hidden="true" /> Hướng: <b>{day.huong}</b>
          </span>
        )}
      </div>
      <div className="tt-chot">
        <small>LỜI THẦY CHỐT</small>
        {la.chot}
      </div>
    </div>
  )
}

function NganhBox({
  kind,
  title,
  groups,
}: {
  kind: "hop" | "kieng"
  title: string
  groups: HanhGroup[]
}) {
  return (
    <div
      className={cx(
        "tt-ngbox",
        kind === "hop" ? "tt-ngbox-hop" : "tt-ngbox-kieng"
      )}
    >
      <div className="tt-k">
        {title} · {groups.map((g) => g.label).join(", ")}
      </div>
      {groups.map((g) => (
        <div className="tt-ng" key={g.hanh}>
          <b>{g.label}</b>
          <span>{g.nganh.slice(0, 4).join(", ")}</span>
        </div>
      ))}
    </div>
  )
}

/** Six lines drawn bottom → top; the moving line is red with a ring. */
export function Hexagram({ hao, moving }: { hao: string; moving: number }) {
  const lines = hexLines(hao)
  return (
    <svg
      className="tt-hex"
      viewBox="0 0 160 112"
      width="150"
      height="105"
      role="img"
      aria-label={`Quẻ sáu hào, hào ${moving} động`}
    >
      {lines.map((yang, i) => {
        const y = 8 + (5 - i) * 17
        const isMoving = i + 1 === moving
        const fill = isMoving ? "#c81e1e" : "#3d240a"
        return (
          <g key={i}>
            {yang ? (
              <rect x="10" y={y} width="120" height="10" rx="2" fill={fill} />
            ) : (
              <>
                <rect x="10" y={y} width="52" height="10" rx="2" fill={fill} />
                <rect x="78" y={y} width="52" height="10" rx="2" fill={fill} />
              </>
            )}
            {isMoving && (
              <circle
                cx="146"
                cy={y + 5}
                r="6"
                fill="none"
                stroke="#c81e1e"
                strokeWidth="2.5"
              />
            )}
          </g>
        )
      })}
    </svg>
  )
}

/** Small card at the top of the results; opens the full card. */
export function MiniQue({ la, onOpen }: { la: ThanTaiLa; onOpen: () => void }) {
  const hang = HANG_META[la.hang]
  return (
    <button
      type="button"
      className="tt-miniq"
      style={{ "--hc": hang.color } as CSSProperties}
      onClick={onOpen}
    >
      <span className="tt-miniq-st">
        {hang.seal[0]}
        <br />
        {hang.seal[1]}
      </span>
      <span>
        <b>{la.que.ten}</b>
        <small>Quẻ hôm nay của bạn · bấm để xem lại</small>
      </span>
    </button>
  )
}
