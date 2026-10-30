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
