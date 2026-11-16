# Thần Tài v2 (update 15-11) — implementation contract

Product spec: `SPEC.md` (Vietnamese). Visual mockup: `MAU.html`. This file fixes the names every
part of the code must agree on. It replaces the old ritual (`floor-ritual.*`, leaderboard, scoring job).

## Identity

Every endpoint works for a signed-in account **or a guest** (`backend/src/modules/trading-floor/floor-actor.ts`).
Controllers are `@Public()` and call `FloorActors.require(req)` (Fastify request via `@Req()`), which
returns `FloorActor { key: 'u:<uuid>' | 'g:<uuid>', kind, id, userId }`. All Thần Tài tables key on
`actor_key text` (no FK to users). Frontend sends `x-floor-guest` automatically (`net/api.ts`).

## Time rules (server clock, Vietnam UTC+7)

- Day = VN calendar date. A ritual is allowed every day (weekends too), only before 11:30 VN.
- Every write after 11:30 → `409 { code: 'HET_GIO' }`.
- `status`: `chua_khan` (nothing drawn, before 11:30) · `dang_do` (drawn, not finished, before 11:30)
  · `da_xong` (step 3 done or skipped) · `het_gio` (after 11:30 and not `da_xong`).
- `step` = the next step to do: 1 draw, 2 predict, 3 cầu mã, 4 = finished (results).

## Tables (migration `0049_than_tai.sql`; library rows seeded in `0050_than_tai_library.sql`)

```sql
tf_kd_que (id smallint PK 1..64 (King Wen order), ten text, chu_han text, hao char(6) /* '0'/'1', index 0 = bottom line */,
           que_tren text, que_duoi text /* trigram key: can|khon|chan|kham|can_son|ton|ly|doai */,
           tuong text, thoan text, thoan_nghia text, updated_at timestamptz)
tf_kd_la  (id serial PK, que_id smallint FK tf_kd_que, hao_dong smallint 1..6, ten_hao text /* 'Sơ Cửu' */,
           hao_van text, hao_nghia text, hang text CHECK in ('dai_cat','thuong_cat','trung_cat','tieu_cat','than_trong'),
           luan text, chot text, active boolean default true, updated_at timestamptz, UNIQUE(que_id, hao_dong))
tf_hanh_config (hanh text PK CHECK in ('kim','moc','thuy','hoa','tho'), nganh text[], mau jsonb /* [{ten,hex}] */,
                huong text, updated_at timestamptz)          -- 5 rows seeded in 0049 from SPEC tables
tf_khan_daily (actor_key text, ngay date, la_id int FK tf_kd_la, hang text, du_doan text NULL CHECK in ('up','flat','down'),
               ma_cau text[] NULL /* NULL = not yet, '{}' = skipped */, step smallint, created_at, updated_at,
               PRIMARY KEY (actor_key, ngay))           -- index on (ngay)
tf_la_seen (actor_key text, hang text, la_id int, PRIMARY KEY (actor_key, la_id))
```

Trigram keys and display: can ☰ Càn, khon ☷ Khôn, chan ☳ Chấn, kham ☵ Khảm, can_son ☶ Cấn, ton ☴ Tốn,
ly ☲ Ly, doai ☱ Đoài.

Draw: weighted rank (35/30/20/10/5); if the rank has no active lá, redraw a rank by the same weights
among ranks that have active lá; pick a random active lá of that rank not in `tf_la_seen` for this actor;
if all seen, delete the actor's seen rows of that rank and pick again. Atomic: `insert … on conflict do nothing`
on `tf_khan_daily`, second call returns the same lá.

## Endpoints (prefix `api/v2/trading-floor`)

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| GET | `/than-tai/today` | – | `ThanTaiToday` |
| POST | `/than-tai/draw` | – | `ThanTaiToday` (with `la`) |
| POST | `/than-tai/predict` | `{ direction: 'up'|'flat'|'down' }` | `ThanTaiToday` · errors `CHUA_GIEO_QUE`, `DA_DU_DOAN`, `HET_GIO` |
| POST | `/than-tai/cau` | `{ tickers: string[] }` (0–3, `[]` = skip) | `ThanTaiToday` · errors `CHUA_DU_DOAN`, `DA_CAU`, `MA_KHONG_HOP_LE`, `QUA_3_MA`, `HET_GIO` |
| GET | `/than-tai/results` | – | `ThanTaiResults` · `403 KET_QUA_CHUA_MO` when the caller is not `da_xong` and it is before 11:30. Anonymous allowed after 11:30. |
| GET | `/than-tai/leaderboard?month=YYYY-MM` | – | `ThanTaiLeaderboard` `{ month, scoredDays, rows: LeaderRow[≤10], me: LeaderRow \| null, asOf }` with `LeaderRow = { rank, name, avatar, color, correct, total }`. Public (guests can read, `me` is null for them). Month defaults to the current VN month; a bad month is 422. |

Leaderboard rules (hall of fame, no stored scores, computed at read time and cached ~60 s per month): accounts only
(`u:`), floor profile required; a day is scored only when `market_index_bars` holds its VNINDEX close and the previous
bar (today only from 15:00 VN); outcome `up` if close - previous close > 0, `down` if < 0, `flat` if 0 (the "tham chiếu"
shown in step 2 is that previous close); order: correct desc, accuracy desc, earliest date reaching that count, actor key.

Admin (role admin only, under `api/v2/trading-floor/manage/than-tai`):
`GET /la` → `{ items: AdminLa[] }` (all 64 quẻ joined with their lá, active or not);
`PUT /la/:id` body `{ tenHao?, haoVan?, haoNghia?, hang?, luan?, chot?, active? }` → `AdminLa`;
`PUT /que/:id` body `{ ten?, chuHan?, tuong?, thoan?, thoanNghia? }` → que;
`GET /hanh` → `{ items: HanhConfig[] }`; `PUT /hanh/:hanh` body `{ nganh?: string[], mau?: {ten,hex}[], huong? }`.

Tickers: uppercase, 3 chars `[A-Z0-9]`, must be a listed HOSE/HNX/UPCOM symbol (`FloorMarketPort.listedSymbols`,
when the list is unavailable accept the regex), unique.

## Types (JSON)

```ts
type Hang = 'dai_cat' | 'thuong_cat' | 'trung_cat' | 'tieu_cat' | 'than_trong'
type Hanh = 'kim' | 'moc' | 'thuy' | 'hoa' | 'tho'
interface ThanTaiDay {
  date: string            // 'YYYY-MM-DD' VN
  canChi: string          // 'Bính Ngọ' (day stem+branch, computed from Julian day number)
  napAm: string           // 'Thiên Hà Thủy'
  hanh: Hanh; hanhLabel: string   // 'Thủy'
  hop: { hanh: Hanh; label: string; nganh: string[] /* max 4 */ }[]    // 2 entries
  kieng: { hanh: Hanh; label: string; nganh: string[] }[]              // 2 entries
  mau: { ten: string; hex: string }[]
  huong: string
}
interface ThanTaiLa {
  id: number; hang: Hang; hangLabel: string   // 'Đại cát'
  que: { id: number; ten: string; chuHan: string; hao: string /* 6 chars bottom→top */,
         tren: { key: string; ten: string; symbol: string }; duoi: { key: string; ten: string; symbol: string };
         tuong: string; thoan: string; thoanNghia: string }
  haoDong: { so: number; ten: string; van: string; nghia: string }
  luan: string; chot: string
}
interface ThanTaiToday {
  status: 'chua_khan' | 'dang_do' | 'da_xong' | 'het_gio'
  step: 1 | 2 | 3 | 4
  serverTime: number      // epoch ms
  deadline: number        // epoch ms of 11:30 VN today
  day: ThanTaiDay
  vnindexRef: number | null   // reference (previous close) of VNINDEX for the session
  la: ThanTaiLa | null
  prediction: 'up' | 'flat' | 'down' | null
  tickers: string[] | null    // null = not yet, [] = skipped
}
interface ThanTaiResults {
  total: number; up: number; flat: number; down: number
  top5: { ticker: string; count: number }[]
  asOf: number
}
```

Nạp âm: the standard 60 Giáp Tý cycle (pairs: Hải Trung Kim, Lô Trung Hỏa, Đại Lâm Mộc, Lộ Bàng Thổ, Kiếm Phong Kim,
Sơn Đầu Hỏa, Giản Hạ Thủy, Thành Đầu Thổ, Bạch Lạp Kim, Dương Liễu Mộc, Tuyền Trung Thủy, Ốc Thượng Thổ,
Tích Lịch Hỏa, Tùng Bách Mộc, Trường Lưu Thủy, Sa Trung Kim, Sơn Hạ Hỏa, Bình Địa Mộc, Bích Thượng Thổ,
Kim Bạch Kim, Phú Đăng Hỏa, Thiên Hà Thủy, Đại Trạch Thổ, Thoa Xuyến Kim, Tang Đố Mộc, Đại Khê Thủy,
Sa Trung Thổ, Thiên Thượng Hỏa, Thạch Lựu Mộc, Đại Hải Thủy). Day can-chi: index = (JDN + 49) mod 60 with
stem = (JDN + 9) mod 10 (Giáp=0), branch = (JDN + 1) mod 12 (Tý=0). Check: 2026-11-14 must be verified by a unit test
against a known calendar value.

Hợp = same element + element generated by the day; kiêng = element the day overcomes + element that overcomes the day.
Sinh: Mộc→Hỏa→Thổ→Kim→Thủy→Mộc. Khắc: Mộc→Thổ→Thủy→Hỏa→Kim→Mộc.
