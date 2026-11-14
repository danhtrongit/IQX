/** REST client of the trading floor: `/api/v2/trading-floor/*`, through the shared authenticated `api`. */
import { api as http } from "@/lib/api"

import type { Direction, Que } from "../ritual.ts"
import type {
  ChatMessage,
  ConvDetail,
  ConvSummary,
  Inbox,
  Leaderboard,
  MeResponse,
  MyRitual,
  Profile,
  RitualStats,
  RitualToday,
  SacoSelf,
} from "./types.ts"

const BASE = "/trading-floor"

const read = <T>(path: string): Promise<T> => http<T>(`${BASE}${path}`)

const send = <T>(
  method: "POST" | "PUT",
  path: string,
  body?: unknown
): Promise<T> =>
  http<T>(`${BASE}${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

const id = encodeURIComponent

export const floorApi = {
  me: () => read<MeResponse>("/me"),
  saveProfile: (profile: Profile) => send<Profile>("PUT", "/profile", profile),
  today: () => read<RitualToday>("/ritual/today"),
  draw: () => send<{ que: Que; ritual: MyRitual }>("POST", "/ritual/draw"),
  submit: (body: { direction: Direction; level: number; tickers: string[] }) =>
    send<{ mine: MyRitual; stats: RitualStats; que: Que }>(
      "POST",
      "/ritual/submit",
      body
    ),
  leaderboard: (month?: string) =>
    read<Leaderboard>(
      `/leaderboard${month ? `?month=${encodeURIComponent(month)}` : ""}`
    ),
  inbox: () => read<Inbox>("/chat/inbox"),
  match: () =>
    send<{ convId: string } | { running: true }>("POST", "/chat/match"),
  cancelMatch: () => send<{ ok: true }>("POST", "/chat/match/cancel"),
  openDirect: (sacoId: string) =>
    send<ConvSummary>("POST", "/chat/open", { sacoId }),
  conversation: (convId: string) =>
    read<ConvDetail>(`/chat/convs/${id(convId)}`),
  send: (convId: string, text: string) =>
    send<ChatMessage>("POST", `/chat/convs/${id(convId)}/send`, { text }),
  read: (convId: string) =>
    send<{ ok: true }>("POST", `/chat/convs/${id(convId)}/read`),
  answerInvite: (inviteId: number, accept: boolean) =>
    send<{ ok: true }>("POST", `/chat/invites/${inviteId}`, { accept }),
  duty: (on: boolean) => send<SacoSelf>("POST", "/saco/duty", { on }),
}
