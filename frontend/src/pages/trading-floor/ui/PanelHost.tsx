import { useCallback } from "react"

import { ui, type Panel } from "../bridge.ts"
import { ChatPanel } from "./panels/ChatPanel.tsx"
import { LeaderboardPanel } from "./panels/LeaderboardPanel.tsx"
import { MarketPanel } from "./panels/MarketPanel.tsx"
import { ReceptionPanel } from "./panels/ReceptionPanel.tsx"
import { ThanTaiPanel } from "./panels/ThanTaiPanel.tsx"
import { Sheet } from "./Sheet.tsx"

const TITLES: Record<Panel["kind"], [string, string]> = {
  thantai: ["🙏", "Thần Tài"],
  leaderboard: ["🏆", "Vinh danh Top dự đoán"],
  market: ["📊", "Thị trường"],
  reception: ["🛎️", "Lễ tân · Hướng dẫn"],
  chat: ["💬", "Chat SACO"],
}

export function PanelHost({ panel }: { panel: Panel }) {
  const close = useCallback(() => ui.panel.set(null), [])
  const sacoInbox = panel.kind === "chat" && panel.data?.side === "saco"
  const [icon, title] = sacoInbox ? ["💼", "Hộp thư SACO"] : TITLES[panel.kind]
  const isChat = panel.kind === "chat"
  return (
    <Sheet
      title={title}
      icon={icon}
      onClose={close}
      wide={panel.kind === "market" || isChat}
      bodyClass={isChat ? "sheet-chat" : undefined}
    >
      {panel.kind === "thantai" && <ThanTaiPanel />}
      {panel.kind === "leaderboard" && <LeaderboardPanel />}
      {panel.kind === "market" && <MarketPanel />}
      {panel.kind === "reception" && <ReceptionPanel />}
      {isChat && (
        <ChatPanel
          side={sacoInbox ? "saco" : "user"}
          convId={
            typeof panel.data?.convId === "string"
              ? panel.data.convId
              : undefined
          }
        />
      )}
    </Sheet>
  )
}
