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

---

# v2 (owner request 2026-11-18)

Changes to the table above:

| Action | Cost (paid from the xu wallet) | Who | Cooldown |
| --- | --- | --- | --- |
| **Xả xui** | **50 xu** each time | accounts only (guests: `LOGIN_REQUIRED`) | **5 s** |
| **Gáy** | **100 xu** each time | accounts only | 20 s |
| **Khấn Thần Tài** (new) | **50 xu** each time | accounts only | 10 s |
| Tán lộc | unchanged | unchanged | unchanged |

**Khấn Thần Tài**: the figure turns to face the shrine (north), bows three times, three incense sticks smoke in front
of it, a warm gold aura rises, the shrine glows, and the user's prayer (1..80 chars, same cleaning as Gáy) shows above
the head in red/gold. Everyone on the floor sees it.

**Bad words**: Gáy and Khấn texts are refused with error `BAD_WORDS` ("Câu có từ ngữ không phù hợp") and nothing is
charged when they contain basic Vietnamese/English profanity. The check is the same on server and client
(`floor-fx.logic.ts` `hasBadWords`, mirrored in `frontend/src/pages/trading-floor/net/bad-words.ts`): lower-case,
NFC, then
- match these words with their diacritics as whole words (`đụ` but not `đụng`, `đĩ` but not `đĩa`): `địt`, `đụ`, `lồn`, `cặc`, `buồi`, `đéo`, `đĩ`, `cứt`, `đcm`, `đkm`, `đmm`;
- after removing diacritics (`đ`→`d`) and treating every character that is not a letter or digit as a separator, match
  these whole tokens: `dm dmm dcm dkm dit djt dmcs vcl vkl vcc clm cmm loz fuck fucking shit bitch dick pussy`
  (never plain `cac`, `lon`, `du`, `vl`: they are ordinary Vietnamese words without diacritics); the same tokens are
  also matched against each whitespace-separated chunk with its punctuation removed (`Đ.M`, `v.c.l`);
- with every separator removed, match these substrings: `ditme`, `dume`, `duma`, `concac`, `conlon`, `occho`.

**Charging** (backend): `coin_ledger.kind` gains `floor_fx_fee` (delta < 0), migration
`0055_floor_fx_fees.sql` (same rebuild pattern as 0054 + sign CHECK `ck_coin_ledger_floor_fx_sign`). Unique key
`floor_fx_fee:<random uuid>`, `ref {kind, text?}`, policy `iqx-floor-fx-v1`. Order in the hub: on the floor → account →
cooldown → text valid → no bad words → charge → broadcast. Insufficient balance → `XU_INSUFFICIENT`, cooldown not
consumed.

**Messages**:
- client → server: `{type:'fx', kind:'xaxui'}`, `{type:'fx', kind:'gay', text}`, `{type:'fx', kind:'khan', text}`
- server → others on the floor: `{type:'peer:fx', id, kind, name?, text?}` (kind `khan` carries name + text like `gay`)
- server → the sender's sockets (new): `{type:'fx:done', kind, text?, cost, balance}`. **The sender plays its own effect
  when `fx:done` arrives** (no longer before the server answers), so a refused action shows nothing.

**Sound** (frontend only): short clips in `frontend/public/sounds/khu-giao-dich/` (`xaxui.mp3` egg crack,
`rooster.mp3`, `firework.mp3`, `coins.mp3` coin rain, `coin.mp3` own pickup, `bell.mp3` khấn). A speaker toggle on the
action bar (remembered in localStorage `iqx.floor.sound`, default on). Other people's actions play quieter the farther
they stand from the player.
