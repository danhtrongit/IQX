import { Sparkles } from "lucide-react"
import { useMemo, useState, type FormEvent } from "react"

import { useAuth } from "@/hooks/use-auth"
import { ChibiAvatar3DPreview } from "@/lib/chibi-3d/ChibiAvatar3DPreview.tsx"
import { renderChibiPortraitDataUrl } from "@/lib/chibi-3d/portrait-renderer.ts"
import { resolveOutfitHex } from "@/lib/chibi-3d/types.ts"

import { ui } from "../bridge.ts"
import { floorApi } from "../net/api.ts"
import { getGuestToken, setGuestToken } from "../net/guest.ts"
import { floorSocket } from "../net/socket.ts"
import {
  AVATARS,
  OUTFIT_COLORS,
  avatarAllowedFor,
  type AvatarGender,
  type AvatarId,
  type OutfitColorId,
  type Profile,
} from "../net/types.ts"
import { useStore } from "../use-store.ts"
import { cx } from "./utils.ts"
import "./login-prompt.css"

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

/**
 * Name, character and outfit colour. First visit: one click enters with the suggested name. Later: edits
 * the profile. A visitor who is not signed in creates a guest character here (no account needed).
 */
export function JoinScreen({
  initial,
  suggestedName,
  onDone,
  onCancel,
}: Props) {
  const images = useStore(ui.avatarImages)
  const guest = useStore(ui.guest)
  const { openAuth, user } = useAuth()
  const [name, setName] = useState(initial?.name ?? suggestedName ?? "")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const initAvatar = initial?.avatar ?? "male01"
  const initGender: AvatarGender =
    AVATARS.find((a) => a.id === initAvatar)?.gender ?? "male"
  const [gender, setGender] = useState<AvatarGender>(initGender)
  const [picked, setAvatar] = useState<AvatarId>(initAvatar)
  const [color, setColor] = useState<OutfitColorId>(initial?.color ?? "default")

  // Owner-only avatars appear only for their account (the server checks it too).
  const choices = AVATARS.filter((a) => avatarAllowedFor(a.id, user?.username))
  const genderList = choices.filter((a) => a.gender === gender)
  const shownList = genderList.length ? genderList : choices
  const selected =
    shownList.find((a) => a.id === picked) ?? shownList[0] ?? AVATARS[0]
  const avatar = selected.id

  const cardPortraits = useMemo(() => {
    const out: Record<string, string> = {}
    for (const a of AVATARS) {
      out[a.id] = images[a.id] ?? renderChibiPortraitDataUrl(a.id)
    }
    return out
  }, [images])

  const clean = name.trim().replace(/\s+/g, " ")
  const valid = clean.length >= NAME_MIN && clean.length <= NAME_MAX
  const activeSwatch =
    OUTFIT_COLORS.find((c) => c.id === color) ?? OUTFIT_COLORS[0]
  const activeColorHex = resolveOutfitHex(color)

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
      if (guest && !getGuestToken()) {
        // First visit of a guest: the server hands back the token that identifies them from now on.
        const created = await floorApi.createGuest({
          name: clean,
          avatar,
          color,
        })
        setGuestToken(created.token)
        ui.profile.set(created.profile)
        // The socket could not connect without a token: connect now that there is one.
        floorSocket.restart()
      } else {
        ui.profile.set(
          await floorApi.saveProfile({ name: clean, avatar, color })
        )
      }
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
        {guest ? (
          <p className="muted">
            Văn phòng ảo của IQX: đi dạo, trò chuyện và đọc nhận định SACO ngay,
            không cần tài khoản. Chỉ cần một cái tên và một nhân vật.
          </p>
        ) : (
          <p className="muted">
            Văn phòng ảo của IQX: đọc nhận định SACO, chat với SACO và khấn Thần
            Tài gieo quẻ mỗi sáng.
          </p>
        )}

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
          <div className="preview-stage preview-stage-3d">
            <ChibiAvatar3DPreview
              avatarId={avatar}
              colorHex={activeColorHex}
              size={184}
              interactive
              label={`${selected.label} · ${activeSwatch.label}`}
            />
          </div>
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
                  {c.hex === null && <Sparkles size={12} aria-hidden="true" />}
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
                <img src={cardPortraits[a.id]} alt="" />
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
        {guest && !initial && (
          <p className="fineprint">
            Đã có tài khoản?{" "}
            <button
              type="button"
              className="join-login"
              onClick={() => openAuth("login")}
            >
              Đăng nhập
            </button>{" "}
            để thả tim và bình luận nhận định.
          </p>
        )}
      </form>
    </div>
  )
}
