# Khu giao dịch · Xả xui, Gáy, Tán lộc

Owner request 2026-11-17: three floor actions everyone on `/khu-giao-dich` sees live.

| Action | What everyone sees | Who may use it | Cost |
| --- | --- | --- | --- |
| **Xả xui** | the figure stomps a white egg, the shell cracks, grey "bad luck" smoke rises | everyone (guests too) | free, cooldown 8 s |
| **Gáy** | fireworks around the figure + a big banner with the sentence the user typed | accounts only | free, cooldown 20 s |
| **Tán lộc** | a rain of gold coins falls around the figure; others walk over (or tap) a coin to pick it up | giving and picking: accounts only | the giver pays the amount from their xu wallet |

## Decisions (main agent calls, owner can change)

- One coin is worth **10 xu**. Giving `A` xu drops `A / 10` coins (owner example: 200 xu → coins of 10 xu each).
  `A` must be a multiple of 10, from **50 to 1000** (5 to 100 coins).
- The giver cannot pick up their own coins. Guests see the rain but must log in to pick (no wallet).
- A rain lives **45 s**. Coins nobody picked are **refunded to the giver** when it ends.
- At most **one live rain per giver** and **3 live rains on the floor**.
- Picking needs the picker's figure (last reported position) within **96 world units** of the coin.
- Gáy text: same cleaning as an emote (strip control chars and `<>`), 1..80 chars.
- No emoji in the UI (owner rule), lucide icons only.

## Storage (migration `0054_floor_coin_rain.sql`)

```
tf_coin_rains (id uuid pk default gen_random_uuid(), giver_user_id uuid not null references users(id) on delete cascade,
               amount integer not null check (amount between 50 and 1000 and amount % 10 = 0),
               coin_value smallint not null default 10, coins smallint not null,
               created_at timestamptz not null default now(), expires_at timestamptz not null,
               settled_at timestamptz, refunded integer not null default 0)
  index on (expires_at) where settled_at is null
tf_coin_grabs (rain_id uuid references tf_coin_rains(id) on delete cascade, coin smallint not null,
               user_id uuid not null references users(id) on delete cascade, created_at timestamptz not null default now(),
               primary key (rain_id, coin))
```

`coin_ledger.kind` gains `floor_rain_give` (delta < 0), `floor_rain_catch` (delta > 0), `floor_rain_refund` (delta > 0),
added the same way as `backend/migrations/0045_candle_dojo.sql` (rebuild `ck_coin_ledger_kind` from the existing list, plus a
sign CHECK `ck_coin_ledger_floor_rain_sign`). Ledger unique keys: `floor_rain_give:<rainId>`,
`floor_rain_catch:<rainId>:<coin>`, `floor_rain_refund:<rainId>`; `policy_version` `iqx-floor-rain-v1`.
Wallet writes follow `FlashbackRepository.lockWallet/saveWallet/appendLedger` (`coin_wallets` row `FOR UPDATE`,
`seq = last_seq + 1`).

Settlement is idempotent: `update tf_coin_rains set settled_at = now(), refunded = $2 where id = $1 and settled_at is null
returning ...` in the same transaction as the refund ledger row. A grab is refused in SQL once `expires_at <= now()` or
`settled_at is not null`. On API boot (and every 60 s) rains with `settled_at is null and expires_at < now()` are settled
(refund = (coins - grabs) * coin_value), so a restart never loses the giver's xu.

## WebSocket protocol (`/api/v2/trading-floor/ws`, after `auth` + `hello`)

Client → server:

```
{ type: 'fx', kind: 'xaxui' }
{ type: 'fx', kind: 'gay', text: string }
{ type: 'rain:give', amount: number, coins?: { x: number, y: number }[] }   // coins: spots picked by the giver's client on walkable floor
{ type: 'rain:grab', rainId: string, coin: number }
```

Server → client:

```
{ type: 'peer:fx', id: peerId, kind: 'xaxui' }                         // to the floor except the sender (sender plays it locally)
{ type: 'peer:fx', id: peerId, kind: 'gay', name, text }                // same
{ type: 'rain:start', rain: Rain }                                      // to the whole floor including the giver
{ type: 'rain:given', rainId, amount, balance }                         // only to the giver's sockets
{ type: 'rain:taken', rainId, coin, by: peerId, name }                  // whole floor
{ type: 'rain:caught', rainId, coin, value, balance }                   // only to the picker's sockets
{ type: 'rain:end', rainId }                                            // whole floor
{ type: 'rain:refund', rainId, amount, balance }                        // only to the giver's sockets, when amount > 0
{ type: 'error', code, message }                                        // codes below
welcome gains `rains: Rain[]` (live rains, taken coins left out)

Rain = { id, by: peerId | null (giver not on the floor any more), giverName, value: 10, endsAt: epoch ms,
         coins: { i: number, x: number, y: number }[] }
```

Error codes: `LOGIN_REQUIRED` (guest tried gáy / give / grab), `FX_COOLDOWN`, `BAD_TEXT`, `BAD_AMOUNT`,
`XU_INSUFFICIENT`, `RAIN_BUSY` (giver already has a live rain), `RAIN_FULL` (3 live rains), `NOT_ON_FLOOR`.
Grab failures (taken, too far, own coin, ended) are silent: no error frame.

Coin spots: when the client sends `coins`, the server keeps them only if the count equals `amount / 10` and every spot is a
finite number inside the world (x 40..2008, y 260..1368) and within 360 units of the giver; otherwise the server scatters
the coins itself in a ring 60..300 units around the giver, clamped to the same box.
