/** REST client of the trading floor: `/api/v2/trading-floor/*`, through the shared authenticated `api`. */
import { api as http, apiUpload } from "@/lib/api"

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
  StartResult,
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
  /** Chat SACO, message first: into the matched conversation, or queued while a SACO is found (`chat:match`). */
  start: (text: string) => send<StartResult>("POST", "/chat/start", { text }),
  openDirect: (sacoId: string) =>
    send<ConvSummary>("POST", "/chat/open", { sacoId }),
  conversation: (convId: string) =>
    read<ConvDetail>(`/chat/convs/${id(convId)}`),
  send: (convId: string, text: string) =>
    send<ChatMessage>("POST", `/chat/convs/${id(convId)}/send`, { text }),
  read: (convId: string) =>
    send<{ ok: true }>("POST", `/chat/convs/${id(convId)}/read`),
  /** One image (JPG, PNG, WebP up to 5 MB) into a conversation, with upload progress in percent. */
  sendImage: async (
    convId: string,
    file: File,
    onProgress: (percent: number) => void
  ): Promise<ChatMessage> => {
    const response = await apiUpload(
      `${BASE}/chat/convs/${id(convId)}/images`,
      file,
      onProgress,
      undefined,
      guestHeaders()
    )
    return (await response.json()) as ChatMessage
  },
  recall: (convId: string, messageId: number) =>
    send<{ ok: true }>(
      "POST",
      `/chat/convs/${id(convId)}/messages/${messageId}/recall`
    ),
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
