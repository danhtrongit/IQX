/** REST client of the trading floor: `/api/v2/trading-floor/*`, through the shared authenticated `api`. */
import { api as http } from "@/lib/api"

import { guestHeaders } from "./guest.ts"
import type {
  ChatMessage,
  ConvDetail,
  ConvSummary,
  Direction,
  GuestCreated,
  Inbox,
  MeResponse,
  Profile,
  SacoSelf,
  ThanTaiResults,
  ThanTaiToday,
} from "./types.ts"

const BASE = "/trading-floor"

const read = <T>(path: string): Promise<T> =>
  http<T>(`${BASE}${path}`, { headers: guestHeaders() })

const send = <T>(
  method: "POST" | "PUT",
  path: string,
  body?: unknown
): Promise<T> =>
  http<T>(`${BASE}${path}`, {
    method,
    headers: guestHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body),
  })

const id = encodeURIComponent

export const floorApi = {
  me: () => read<MeResponse>("/me"),
  saveProfile: (profile: Profile) => send<Profile>("PUT", "/profile", profile),
  /** A visitor who is not signed in creates a character; the answer carries the guest token. */
  createGuest: (profile: Profile) =>
    http<GuestCreated>(`${BASE}/guest`, {
      method: "POST",
      body: JSON.stringify(profile),
    }),
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
  /** Thần Tài v2: one ritual a day before 11:30 (backend/docs/than-tai/CONTRACT.md). */
  thanTai: {
    today: () => read<ThanTaiToday>("/than-tai/today"),
    draw: () => send<ThanTaiToday>("POST", "/than-tai/draw"),
    predict: (direction: Direction) =>
      send<ThanTaiToday>("POST", "/than-tai/predict", { direction }),
    /** `[]` skips the step. */
    cau: (tickers: string[]) =>
      send<ThanTaiToday>("POST", "/than-tai/cau", { tickers }),
    results: () => read<ThanTaiResults>("/than-tai/results"),
  },
}
