import { useEffect, useRef, useState, type FormEvent } from "react"

import { ui } from "../bridge.ts"
import { recolorRgbaBuffer } from "../engine/recolor.ts"
import { floorApi } from "../net/api.ts"
import {
  AVATARS,
  OUTFIT_COLORS,
  type AvatarGender,
  type AvatarId,
  type OutfitColorId,
  type Profile,
} from "../net/types.ts"
import { useStore } from "../use-store.ts"
import { cx } from "./utils.ts"

/** Display names are 2 to 20 characters, as the server checks. */
const NAME_MIN = 2
const NAME_MAX = 20

interface Props {
  /** The saved profile when editing, null on the first visit. */
  initial: Profile | null
  /** Name offered on the first visit (from the account). */
  suggestedName?: string
  onDone: () => void
  onCancel?: () => void
}

const previewImgCache = new Map<string, Promise<HTMLImageElement | null>>()
function loadImg(src: string): Promise<HTMLImageElement | null> {
  const cached = previewImgCache.get(src)
  if (cached) return cached
  const p = new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
  previewImgCache.set(src, p)
  return p
}

function AvatarPreview({
  imageSrc,
  maskInfo,
  color,
  label,
}: {
  imageSrc?: string
  maskInfo?: { mask: string; luma: number }
  color: OutfitColorId
  label: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const swatchHex = OUTFIT_COLORS.find((c) => c.id === color)?.hex ?? null
  const maskSrc = maskInfo?.mask
  const luma = maskInfo?.luma

  useEffect(() => {
    let cancelled = false
    const canvas = canvasRef.current
    if (!canvas || !imageSrc) return

    void (async () => {
      const baseImg = await loadImg(imageSrc)
      if (cancelled || !baseImg) return
      const w = baseImg.naturalWidth || baseImg.width
      const h = baseImg.naturalHeight || baseImg.height
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext("2d", { willReadFrequently: true })
      if (!ctx) return
      ctx.clearRect(0, 0, w, h)
      ctx.drawImage(baseImg, 0, 0, w, h)

      if (swatchHex && maskSrc) {
        const maskImg = await loadImg(maskSrc)
        if (cancelled || !maskImg) return
        const srcData = ctx.getImageData(0, 0, w, h)
        const mc = document.createElement("canvas")
        mc.width = w
        mc.height = h
        const mctx = mc.getContext("2d", { willReadFrequently: true })
        if (!mctx) return
        mctx.drawImage(maskImg, 0, 0, w, h)
        const maskData = mctx.getImageData(0, 0, w, h)
        srcData.data.set(
          recolorRgbaBuffer(srcData.data, maskData.data, swatchHex, luma)
        )
        ctx.putImageData(srcData, 0, 0)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [imageSrc, maskSrc, luma, swatchHex])

  if (!imageSrc) {
    return (
      <div className="preview-stage">
        <div className="avatar-ph" aria-hidden="true">
          👤
        </div>
      </div>
    )
  }
  return (
    <div className="preview-stage">
      <canvas ref={canvasRef} className="preview-canvas" aria-label={label} />
    </div>
  )
}

/** Name, character and outfit colour. First visit: one click enters with the suggested name. Later: edits the profile. */
export function JoinScreen({
  initial,
  suggestedName,
  onDone,
  onCancel,
}: Props) {
  const images = useStore(ui.avatarImages)
  const masks = useStore(ui.avatarMasks)
  const [name, setName] = useState(initial?.name ?? suggestedName ?? "")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const initAvatar = initial?.avatar ?? "male01"
  const initGender: AvatarGender =
    AVATARS.find((a) => a.id === initAvatar)?.gender ?? "male"
  const [gender, setGender] = useState<AvatarGender>(initGender)
  const [picked, setAvatar] = useState<AvatarId>(initAvatar)
  const [color, setColor] = useState<OutfitColorId>(initial?.color ?? "default")

  // Presets without art (before the manifest loads) are filtered out once any character art exists.
  const hasPlayableArt = AVATARS.some((a) => Boolean(images[a.id]))
  const choices = AVATARS.filter((a) => !hasPlayableArt || images[a.id])
  const genderList = choices.filter((a) => a.gender === gender)
  const shownList = genderList.length ? genderList : choices
  const selected =
    shownList.find((a) => a.id === picked) ?? shownList[0] ?? AVATARS[0]
  const avatar = selected.id

  const clean = name.trim().replace(/\s+/g, " ")
  const valid = clean.length >= NAME_MIN && clean.length <= NAME_MAX
  const activeSwatch =
    OUTFIT_COLORS.find((c) => c.id === color) ?? OUTFIT_COLORS[0]

  const switchGender = (next: AvatarGender): void => {
    setGender(next)
    const first = choices.find((a) => a.gender === next)
    if (first) setAvatar(first.id)
  }

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setError("")
    try {
      ui.profile.set(await floorApi.saveProfile({ name: clean, avatar, color }))
      onDone()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không lưu được. Thử lại sau ít phút."
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="join-backdrop">
      <form className="join" onSubmit={submit}>
        <p className="eyebrow">IQX</p>
        <h1>Khu Giao Dịch</h1>
        <p className="muted">
          Văn phòng ảo của IQX: đọc nhận định SACO, chat với SACO, xin quẻ Thần
          Tài và đua top dự đoán VNINDEX.
        </p>

        <label className="field">
          <span>Tên hiển thị</span>
          <input
            value={name}
            maxLength={NAME_MAX}
            autoComplete="nickname"
            placeholder="Ví dụ: Minh Anh"
            aria-invalid={name.length > 0 && !valid}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <div className="join-preview">
          <AvatarPreview
            imageSrc={images[avatar]}
            maskInfo={masks[avatar]}
            color={color}
            label={`${selected.label} · ${activeSwatch.label}`}
          />
          <div className="color-picker">
            <div className="color-head">
              <span>Màu trang phục</span>
              <b>{activeSwatch.label}</b>
            </div>
            <div
              className="swatches"
              role="radiogroup"
              aria-label="Màu trang phục"
            >
              {OUTFIT_COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={color === c.id}
                  aria-label={c.label}
                  title={c.label}
                  className={cx(
                    "swatch",
                    color === c.id && "on",
                    c.hex === null && "orig"
                  )}
                  style={c.hex ? { backgroundColor: c.hex } : undefined}
                  onClick={() => setColor(c.id)}
                >
                  {c.hex === null ? "✦" : ""}
                </button>
              ))}
            </div>
          </div>
        </div>

        <fieldset className="avatars-section">
          <div className="avatars-top">
            <legend>Chọn nhân vật</legend>
            <div className="seg" role="tablist" aria-label="Giới tính nhân vật">
              <button
                type="button"
                role="tab"
                aria-selected={gender === "male"}
                className={gender === "male" ? "on" : ""}
                onClick={() => switchGender("male")}
              >
                Nam ({choices.filter((a) => a.gender === "male").length || 5})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={gender === "female"}
                className={gender === "female" ? "on" : ""}
                onClick={() => switchGender("female")}
              >
                Nữ ({choices.filter((a) => a.gender === "female").length || 5})
              </button>
            </div>
          </div>

          <div className="avatars">
            {shownList.map((a) => (
              <label
                key={a.id}
                className={cx("avatar-card", avatar === a.id && "selected")}
              >
                <input
                  type="radio"
                  name="avatar"
                  value={a.id}
                  checked={avatar === a.id}
                  onChange={() => setAvatar(a.id)}
                />
                {images[a.id] ? (
                  <img src={images[a.id]} alt="" />
                ) : (
                  <div className="avatar-ph" aria-hidden="true">
                    👤
                  </div>
                )}
                <span>{a.label.replace(/^(Nam|Nữ)\s*·\s*/, "")}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="row-end">
          {onCancel && (
            <button type="button" className="btn ghost" onClick={onCancel}>
              Huỷ
            </button>
          )}
          <button type="submit" className="btn gold" disabled={!valid || busy}>
            {busy ? "Đang lưu…" : initial ? "Lưu" : "Vào khu giao dịch"}
          </button>
        </div>
        <p className="fineprint">
          Tên, nhân vật và màu trang phục hiện với mọi người trong khu giao
          dịch. Bạn đổi lại được bất cứ lúc nào bằng nút tên ở góc trên.
        </p>
      </form>
    </div>
  )
}
