# Flashback v2 (Phòng chơi): decisions

Spec: `IQX-Flashback-SPEC.md` (v2, 29/10/2026). Sample: `IQX-Flashback-Phong-MAU.html` (content/behaviour standard; follow the existing web design system, do not copy its CSS).

## [DECISION] points: all spec proposals accepted (2026-10-30)

1. One account in at most one room at a time (waiting or playing); must leave first (`ALREADY_IN_ROOM`).
2. Owner leaves the waiting room → ownership passes to the earliest-joined member; no one left → room closed.
3. Waiting room auto-closes after 30 minutes without starting.
4. Kick is NOT implemented.
5. Other players' % shown at `min(their step, my step)` (server returns per-step NAV history; never future data).
6. Disconnect mid-match: kept as a player, position held, valued at the last session; stake not refunded; rejoin within time continues from the saved step.
7. Everyone ties at 0% (nobody traded) → result row shows "Hoàn xu cược" instead of "+n xu" (ledger reason `flashback_refund`).
8. Players not replaying press Rời phòng in the waiting room.

## Implementation choices

- Realtime: lobby list and waiting room / player bar refresh by polling (2–3 s), which the spec allows ("realtime hoặc làm mới mỗi vài giây"). The match clock is server-authoritative (`ends_at`); the client counts down locally from server time.
- Old v1.x Flashback (rounds, global leaderboard, 2-day job, entry fee): stop using, keep historical data/tables; disable the round job.
- Xu ledger reasons: `flashback_stake`, `flashback_win`, `flashback_refund`; unique `(match_id, user_id, reason)`.
- Mobile is paused: no mobile changes.

## v2.4 additions (spec `IQX-Flashback-SPEC-v2.4-BoSung.md`, mockup `IQX-Flashback-v2.4-MAU.html`)

- Room chat uses REST + polling every 2 s instead of the spec's `fb.chat.send` socket, because the whole game already polls. The client refetches immediately on Phiên tiếp and at match end, so the anti-spoiler gate does not feel late.
- Anti-spoiler gating is server-side only (`chatVisibleTo`). Waiting-room messages and your own messages are always delivered; messages from a match that is no longer live go to everyone; otherwise only when `viewer.step >= phien`, a finished viewer counting as `play_bars`. Report and mute use the same gate, so a report cannot probe for a hidden message (404).
- Order (`compareChat`): anchor = match `started_at` or the message `created_at`, then phien, created_at, id. This keeps one thread correct across Chơi lại, where `phien` restarts at 0.
- After Chơi lại the room is `waiting` with `currentMatchId` still set, so "is this a waiting-room message" reads `room.status`, not the match id.
- The 2-second limit is enforced under a per-sender advisory lock; the system spec sends two parallel messages and expects 200 + 429.
- Banned words start empty: filtering only takes effect after an admin adds words. Stored normalized; sorted in Vietnamese order in the service because database order depends on collation.
- Reports copy the message text and the 10 previous messages, so they stay readable after the 7-day purge removes the messages (`message_id` becomes null).
- Added beyond the mockup: "Đã tắt tiếng X · Bỏ tắt tiếng" row, because a muted person's messages disappear and the mockup has no way to unmute.
- Kept despite spec §7.1 ("chưa làm"): kick, already live since migration 0042. This supersedes "Kick is NOT implemented" above.
- Server message stays "Còn n người chơi chưa sẵn sàng" rather than the spec's generic wording.
- The result-window 5-second lock is client-side only, shown once per match.
- A message sent at step 0 inside a match is labelled "Phiên 0"; the mockup labels it "Phòng chờ".
- Layout breakpoint for the chat is `(max-width: 900px)`, the same as the match mobile bar: above it the chat overlays the tool panel, below it a bottom sheet at 72dvh.
