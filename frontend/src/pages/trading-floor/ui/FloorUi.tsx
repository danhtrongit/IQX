import { useState } from "react"

import { ui } from "../bridge.ts"
import { PostsLayer } from "../posts/posts-layer.tsx"
import { useStore } from "../use-store.ts"
import { InviteCard, MatchOverlay } from "./ChatOverlays.tsx"
import { Hud } from "./Hud.tsx"
import { JoinScreen } from "./JoinScreen.tsx"
import { PanelHost } from "./PanelHost.tsx"
import { QuickChat } from "./QuickChat.tsx"
import { Toasts } from "./Toasts.tsx"

const noop = (): void => undefined

/** Everything HTML that sits over the Phaser canvas: HUD, sheets, overlays, toasts. */
export function FloorUi({ suggestedName }: { suggestedName: string }) {
  const profile = useStore(ui.profile)
  const panel = useStore(ui.panel)
  const ready = useStore(ui.ready)
  const queue = useStore(ui.queue)
  const [editing, setEditing] = useState(false)

  return (
    <>
      {!ready && (
        <div className="loading" role="status">
          <div className="loading-coin" aria-hidden="true" />
          <p>Đang mở cửa Khu Giao Dịch…</p>
        </div>
      )}
      {!profile && (
        <JoinScreen
          initial={null}
          suggestedName={suggestedName}
          onDone={noop}
        />
      )}
      {ready && profile && editing && (
        <JoinScreen
          initial={profile}
          onDone={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      )}
      {ready && profile && !editing && (
        <Hud onEditProfile={() => setEditing(true)} />
      )}
      {ready && profile && !editing && <QuickChat />}
      {ready && profile && !editing && <PostsLayer />}
      {panel && <PanelHost panel={panel} />}
      {ready && profile && queue && (
        <div className="hall-queue" role="status" aria-live="polite">
          <div className="loading-coin" aria-hidden="true" />
          <p>
            Sảnh đang kín chỗ ({queue.capacity} người).
            <br />
            Bạn đang xếp hàng thứ <b>{queue.position}</b>, sẽ tự vào khi có chỗ
            trống.
          </p>
        </div>
      )}
      {ready && profile && <MatchOverlay />}
      {ready && profile && <InviteCard />}
      <Toasts />
    </>
  )
}
