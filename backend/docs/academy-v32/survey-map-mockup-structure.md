# Mockup structure map: IQX-Hoc-Vien-MAU.html (area: mockup-a)

Source: `/private/tmp/claude-501/-Users-danhtrongit-Projects-IQX/69fde74c-0919-4b80-9945-df302fa28d2d/scratchpad/src/IQX-Hoc-Vien-MAU.html` (566,586 bytes, 5,827 lines).
Helper outputs (in the same scratchpad): `it.json` (IT array, pretty-printed), `h2.txt` (section titles per lesson), `ids.json`.

File layout (line numbers):

| Lines | Content |
|---|---|
| 7–402 | `<style>`: one dark-only stylesheet. About a third is legacy v1 classes not used by any article (`.sc .guide .bubble .ctrls .opts .opt .reveal .sum .rule72 .stat .big .lhead .prog .qhead .qz .qi .qbar .qres`) |
| 404–412 | App shell: topbar (`.brand`, `.nav`, `.xu` with `#xu`, initially 500), `.body` grid = `main#main` + `aside.side` + `nav.rail` |
| 413 | `.crumb`: "← Về linh thú" plus `#crumbN` (the location line) |
| 414–3678 | 49 `<article class="card art lesson[ sale]" id="lessonN">`, N = 0..48 = index in `IT`. Ch2/Ch3/practice articles also have class `sale` |
| 3679 | `<section class="card qpanel" id="qpanel" hidden>`: the quiz screen, rendered by JS |
| 3682–3685 | `aside.side`: `<h3>Học viện</h3><p>43 bài học</p>` (the 43 is hard-coded) and `#side` (rendered by JS) |
| 3697–3738 | Script: shared helpers `NS`, `C` palette, `fmtN`, `el(tag,attrs,parent,text)`, `$`, data `YRS/VNI/CPI` |
| 3709–5738 | One IIFE per lesson that draws its SVGs (details in §4) |
| 5739–5755 | Practice-state logic ("thực chiến"): scenarios, todo, audit, pad, calculator, roleplay score |
| 5756–5823 | App logic: `LOCK`, `IT` (line 5757, 60 KB single line), `CH`, `UNL`, unlock, sidebar, quiz, result |

---

## 1. Item list (`IT`, line 5757)

Item shape (identical for all 49 items):

```ts
type MockItem = {
  c: number;        // chapter 1..5
  k: number;        // 0-based position in chapter (exams and practice included)
  n: number;        // number of required lessons in chapter (for crumb "Bài k+1 / n")
  t: string;        // title; exams use "Bài thi Chương c"
  ex: boolean;      // chapter exam
  opt: boolean;     // optional (only Phòng tập)
  q: [string, string[], number][]; // [question, options (always 3), correctIndex]
  p: number;        // pass threshold == q.length for every item (all-correct)
};
```

Bank: 280 questions, all with exactly 3 options. The correct index is 0 for 271 of them, 1 for 6 and 2 for 3, so options **must** be shuffled; the mockup's `shuf` does this. No exam question repeats a lesson question (exam banks are disjoint from lesson banks for all 5 chapters).

| article id | c | k | n | type | p / q | title |
|---|---|---|---|---|---|---|
| lesson0 | 1 | 0 | 10 | lesson | 3/3 | Đầu tư chứng khoán |
| lesson1 | 1 | 1 | 10 | lesson | 3/3 | Thị trường và các sàn |
| lesson2 | 1 | 2 | 10 | lesson | 3/3 | Cơ chế giao dịch |
| lesson3 | 1 | 3 | 10 | lesson | 3/3 | T+2, phí, thuế và margin |
| lesson4 | 1 | 4 | 10 | lesson | 3/3 | Cổ phiếu và trái phiếu |
| lesson5 | 1 | 5 | 10 | lesson | 3/3 | Quỹ, ETF, chứng quyền và phái sinh |
| lesson6 | 1 | 6 | 10 | lesson | 3/3 | Quyền cổ đông và sự kiện doanh nghiệp |
| lesson7 | 1 | 7 | 10 | lesson | 3/3 | Chu kỳ kinh tế và lãi suất |
| lesson8 | 1 | 8 | 10 | lesson | 3/3 | Bốn pha của thị trường |
| lesson9 | 1 | 9 | 10 | lesson | 3/3 | Quản trị rủi ro và tâm lý đầu tư |
| lesson10 | 1 | 10 | 10 | **EX** | 20/20 | Bài thi Chương 1 |
| lesson11 | 2 | 0 | 10 | lesson | 3/3 | SACO là ai và làm gì |
| lesson12 | 2 | 1 | 10 | lesson | 3/3 | Hiểu khách hàng |
| lesson13 | 2 | 2 | 10 | lesson | 3/3 | Tìm khách hàng |
| lesson14 | 2 | 3 | 10 | lesson | 3/3 | Mở lời tiếp cận |
| lesson15 | 2 | 4 | 10 | lesson | 3/3 | Tư vấn: hỏi đúng, nghe nhiều |
| lesson16 | 2 | 5 | 10 | lesson | 3/3 | Bán giá trị bạn đồng hành |
| lesson17 | 2 | 6 | 10 | lesson | 3/3 | Xử lý từ chối |
| lesson18 | 2 | 7 | 10 | lesson | 3/3 | Chốt và kích hoạt khách |
| lesson19 | 2 | 8 | 10 | lesson | 3/3 | Chăm sóc và giới thiệu |
| lesson20 | 2 | 9 | 10 | lesson | 3/3 | Nguyên tắc nghề và lịch làm việc mỗi ngày |
| lesson21 | 2 | 10 | 10 | **EX** | 20/20 | Bài thi Chương 2 |
| lesson22 | 3 | 0 | 9 | lesson | 3/3 | Vì sao SACO cần thương hiệu cá nhân |
| lesson23 | 3 | 1 | 9 | lesson | 3/3 | Định vị và hình ảnh |
| lesson24 | 3 | 2 | 9 | lesson | 3/3 | Thương hiệu offline |
| lesson25 | 3 | 3 | 9 | lesson | 3/3 | Hệ sinh thái online |
| lesson26 | 3 | 4 | 9 | lesson | 3/3 | Thương hiệu trên Facebook cá nhân |
| lesson27 | 3 | 5 | 9 | lesson | 3/3 | Thương hiệu trên Zalo |
| lesson28 | 3 | 6 | 9 | lesson | 3/3 | Thương hiệu trên TikTok và Reels |
| lesson29 | 3 | 7 | 9 | lesson | 3/3 | Livestream và hội nhóm |
| lesson30 | 3 | 8 | 9 | lesson | 3/3 | Tám sai lầm và kế hoạch 100 ngày |
| lesson31 | 3 | 9 | 9 | **EX** | 20/20 | Bài thi Chương 3 |
| lesson32 | 3 | 10 | 9 | **OPT** | 3/3 | Phòng tập thực chiến |
| lesson33 | 4 | 0 | 10 | lesson | 5/5 | Biểu đồ nến |
| lesson34 | 4 | 1 | 10 | lesson | 5/5 | Xu hướng |
| lesson35 | 4 | 2 | 10 | lesson | 5/5 | Hỗ trợ và kháng cự |
| lesson36 | 4 | 3 | 10 | lesson | 5/5 | Khối lượng (unlocks "Khối lượng") |
| lesson37 | 4 | 4 | 10 | lesson | 5/5 | MA · đường trung bình (unlocks "MA") |
| lesson38 | 4 | 5 | 10 | lesson | 5/5 | RSI (unlocks "RSI") |
| lesson39 | 4 | 6 | 10 | lesson | 5/5 | MACD (unlocks "MACD") |
| lesson40 | 4 | 7 | 10 | lesson | 5/5 | Bollinger Bands (unlocks "Bollinger Bands") |
| lesson41 | 4 | 8 | 10 | lesson | 5/5 | Fibonacci |
| lesson42 | 4 | 9 | 10 | lesson | 5/5 | Sóng Elliott |
| lesson43 | 4 | 10 | 10 | **EX** | 30/30 | Bài thi Chương 4 |
| lesson44 | 5 | 0 | 4 | lesson | 5/5 | Đầu tư định kỳ (DCA) |
| lesson45 | 5 | 1 | 4 | lesson | 5/5 | Đầu tư giá trị |
| lesson46 | 5 | 2 | 4 | lesson | 5/5 | Phương pháp 4M |
| lesson47 | 5 | 3 | 4 | lesson | 5/5 | CANSLIM |
| lesson48 | 5 | 4 | 4 | **EX** | 30/30 | Bài thi Chương 5 |

Totals: N = 49 items, NL = 43 required lessons (49 − 5 exams − 1 opt). Lessons by chapter: 10/10/9/10/4. Lesson quizzes: 43×(3 or 5) = 30+30+27+50+20 = 157 questions, plus the practice room's 3 = 160. Exams: 20+20+20+30+30 = 120.

Other constants:
- `CH = {1:"Nền tảng",2:"Kỹ năng Sale SACO",3:"Thương hiệu cá nhân",4:"Phương pháp kỹ thuật",5:"Phương pháp cơ bản"}`
- `UNL = {'4-3':'Khối lượng','4-4':'MA','4-5':'RSI','4-6':'MACD','4-7':'Bollinger Bands'}`, keyed by `c-k`.
- `LOCK` = `<span class="lk"><svg lock/>Chưa mở</span>`.

Section titles for every lesson are in `h2.txt`. Every lesson ends with "Tóm tắt". In Ch2/Ch3 the next-to-last section is always "Thực chiến", which holds the scenario plus the todo/pad blocks.

---

## 2. App JS logic (lines 5739–5823)

### 2.1 Storage
- `localStorage['iqx_hv7']` = `{"done": number[] /* IT indices */, "cur": number}`. Loaded with a filter `0<=i<N` and `cur` clamped. If `!open_(cur)`, `cur` is set to 0. Saved by `save()` on every `show()` and on a pass.
- `localStorage['iqx_hv7t']` = `PR`, a flat map holding all practice state:
  - `PR['cz_lessonN'] = chosenOptionIndex` (number, the button index **in DOM order**; scenario options are not shuffled). N is the article index, e.g. `cz_lesson11`.
  - `PR[<data-k>] = boolean` for every todo/audit checkbox, with **no prefix**. Keys: `l1-0..2, l3-0..2, l4-0..2, l8-0..2, l9-0..2, l10-0..2` (Ch2); `br2a-0..7` (audit, Ch3 L2), `br3a-0..3, fb1a-0..4, zl1a-0..4, tt1a-0..4, lv1a-0..3, br5-0..7` (audit, Ch3 L9).
  - `PR['t_'+<data-k>] = string` for every textarea. Keys: `l2 l3 l4 l5 l6 l7` (Ch2), `br1 br1b br2 br3 br4b fb1 zl1 tt1 tt2 lv1 lv2 br5b` (Ch3), `case1..case4` (practice). There are 79 `data-k` keys in total.
  - The calculator and roleplay sliders are **not persisted**.
- Neither key is versioned per account. The spec asks for per-account storage of scenario choices (required) and of pads/todos (DECISION).

### 2.2 Unlock rules
```js
const REQ = IT.map((x,g)=>{let r=g-1; while(r>=0 && IT[r].opt) r--; return r});
const open_ = g => REQ[g] < 0 || DONE.has(REQ[g]);
```
- Strictly linear across all chapters. An item opens when the nearest **non-optional** previous item is done. Optional items are skipped as prerequisites.
- Consequences: lesson32 (practice) has REQ=31 (Ch3 exam), and lesson33 (Ch4 L1) also has REQ=31, so passing the Ch3 exam opens both at once. Exams open after the chapter's last lesson. A chapter opens after the previous chapter's exam.
- There is no separate "chapter unlocked" state. Everything comes from `DONE`.
- Ch2/3 extra gate: `czOk(k) = !document.querySelector('#lesson'+k+' .cz[data-a]') || PR['cz_lesson'+k]!=null`. Only the quiz **button** is gated, not access to the lesson. Practice (lesson32) has no `.cz[data-a]` (its cz blocks have no `data-a`), so it is never gated.

### 2.3 Sidebar `renderSide()`
- Progress box: `lessonsDone()/NL` where `lessonsDone = IT.filter((x,g)=>!x.ex && !x.opt && DONE.has(g)).length`. Fill width is `--p:%`.
- For each item: when the chapter changes, it emits `<div class="part">Chương c · CH[c]</div>`. Then the row `<div class="box"><div class="ls one c2 [on] [lock]" data-i=g><span>{ex ? 'Bài thi Chương c' : t}</span>{state}</div></div>`.
- State: done gives `<button>Xem lại</button>`; open gives `<button>Làm bài</button>` (exam) or `<button>Học bài</button>`; otherwise `LOCK`. The `.lock` class is added when the row is locked.
- Clicking a row calls `show(i)` only when `open_(i)`. Locked rows do nothing.
- Topbar coins: `$('xu').textContent = 500 + 100*xuDone()`, where `xuDone = IT.filter((x,g)=>!x.ex && DONE.has(g)).length`. **Lessons and the optional practice room give coins, exams do not.** The 500 is a mock starting balance.
- `show()` scrolls the active row into view (`offsetTop - 160`).

### 2.4 `show(i)`
Sets `cur`, calls `save()`, hides `#qpanel`, gives the article class `.cur` (only that one displays) and clears `hidden` on all of them. Crumb text:
- exam: `Bài thi Chương c`
- opt: `Chương c · {t}`, which gives "Chương 3 · Phòng tập thực chiến"
- lesson: `Chương c · Bài {k+1} / {n}`

It then calls `syncBtns()`, scrolls main to the top and calls `renderSide()`.

### 2.5 Quiz button `syncBtns()`
Every `.startQ[data-i]` (one per article, inside `.done`):
- label: done gives `✓ Đã hoàn thành`; exam gives `Bắt đầu làm bài`; czOk gives `Làm bài kiểm tra`; otherwise `Chọn cách xử lý ở phần Tình huống để làm bài kiểm tra`
- `.ok` class when done; `disabled = done || !open_(k) || !czOk`
- CSS: `.done button:disabled:not(.ok)` gets a dashed border with light text (line 401).

### 2.6 Quiz flow
- `startQuiz(k)`: `qs = shuf(IT[k].q.map(q=>({q:q[0], o: shuf(q[1].map((x,j)=>({x, ok:j===q[2]})))})))`. **Both question order and option order** are Fisher–Yates shuffled (`shuf`, line 5795) on each attempt. `ans = Array(n).fill(-1)`. All `.lesson` articles get `hidden` and `#qpanel` is shown.
- `drawQ()` renders one question per screen:
  - `.qtop`: label (`Bài thi Chương c` or `Bài kiểm tra`) and `<b>Câu i/N</b>`
  - `.qdots`: one `<i>` per question, class `d` for done and `c` for current
  - `<h2 class="qq">`
  - `.qo` buttons; the selected one gets `.sel`
  - `.qnav #qnext`: disabled until an option is chosen; label `Câu tiếp theo`, or `Nộp bài` on the last question
  - **There is no Back button.** An answer can be changed only before pressing next.
- `result()`:
  - score `n = count(o[ans].ok)`; `pass = n >= x.p`
  - on pass: `DONE.add`, `save`, `renderSide`, `syncBtns`
  - screen: `.qres2.pass|fail > .qscore "n/N" + .qlab "Đạt"|"Chưa đạt" + pill`. The pill is one of:
    - exam: `<div class="qunl">Đã hoàn thành Chương c</div>`
    - lesson with an UNL entry: `Đã mở chỉ báo X`
    - otherwise none
  - **No answers or explanations are shown.**
  - buttons on pass: `✓ Đã hoàn thành` (disabled, `.ok`) plus ghost `#qback`; on fail: `#qretry "Làm lại"` plus ghost `#qback`
  - `#qback` label is `Xem lại Chương c` (exam) or `Xem lại bài`. Exam back goes to `IT.findIndex(y=>y.c===x.c)` (Ch first lesson); lesson back goes to `show(qk)`
  - retry calls `startQuiz(qk)`, which reshuffles
- Re-passing an item already done does nothing new (it is a Set). Coins are computed, not credited, so they cannot be granted twice.

### 2.7 Exam intro (articles lesson10/21/31/43/48)
```html
<div class="col"><h1>Bài thi Chương c</h1>
<p class="lead">Bài thi gồm N câu hỏi về toàn bộ kiến thức Chương c. Cần trả lời đúng tất cả câu hỏi để hoàn thành.</p>
<div class="done"><button class="startQ" data-i="g">Bắt đầu làm bài</button></div></div>
```
Wording variants:
- Ch2: "…về toàn bộ kỹ năng sale của SACO trong Chương 2…"
- Ch3: "…về toàn bộ kiến thức thương hiệu cá nhân trong Chương 3…"

N = 20 for Ch1–3 and 30 for Ch4–5. Exam articles have no `.sec`.

### 2.8 Practice widgets (lines 5739–5755)
- **Scenario** `.cz[data-a=correctIdx]` (19 blocks, one per Ch2/3 lesson). If `PR['cz_'+lessonId]` exists, `czMark` runs on load. Clicking button j calls `czMark(c,j)`: every button is disabled, `.ok` goes on `data-a`, `.no` goes on j if j≠a, and `.cz-x` (explanation) is unhidden. It then saves `PR[key]=j` and calls `syncBtns()`. There is a single attempt with no reset. A correct or wrong choice both unlock the quiz. No score is kept.
- **Reveal toggle** `.rv button`: toggles `hidden` on `parentNode.nextElementSibling` (the `.cz-x`). Labels: `Xem gợi ý phân tích` / `Ẩn gợi ý`. Not persisted.
- **Todo** `.todo input[data-k]`: checked is restored from `PR[k]`; `label.on` turns the text green; saved on change.
- **Self-check (audit)** `.todo.audit`: like todo, plus live `.aud-n` text `checked/total` (e.g. `0/8`, `0/4`... ). There are 2: lesson23 (`br2a-*`, 8 items) and lesson30 (`br5-*`, 8 items).
- **Pad** `.pad textarea[data-k]`: value from `PR['t_'+k]`, saved on every `oninput`. Ch2 pads have the note `<em>Phần bạn viết được lưu trên trình duyệt này.</em>` (6×).
- **Calculator** (lesson11 only, ids `cN`, `cV`, `cOut`): `income = max(0,N) * max(0,V) * 1e6 * 0.0015 * 0.7`, shown as `Math.round(r).toLocaleString('vi-VN')+' đ'`. Defaults: N=20, V=200 (million VND per month per client), result 4.200.000 đ.
- **Roleplay score** (lesson32, `#sc6`): six `input[type=range] 0..10 value=5`; each `output` mirrors its value. Total `T` is shown as `t/60`. Verdict: `t>=48` gives class `g` "Sẵn sàng gặp khách thật"; `t>=36` gives `m` "Cần luyện thêm"; otherwise `r` "Cần học lại". Not persisted. The six criteria are: Tạo thiện cảm, Khai thác nhu cầu, Xử lý từ chối, Kiến thức, EQ và thái độ, Chốt hành động (each has a `<small>` subtitle).

### 2.9 Reveal animation
An `IntersectionObserver` (root `#main`, threshold 0.15) adds `.in` to `.blk` sections, which fade and slide in. It also calls `svg.__go()` if present (used twice, for stroke-dash line drawing). The CSS animation classes `.grow`, `.g5`, `.growx` and `.fade` are applied to SVG elements by the chart code. `prefers-reduced-motion` disables all of them.

---

## 3. Lesson block catalogue (for the typed-block schema)

### 3.0 Article skeleton (every non-exam lesson)
```html
<article class="card art lesson [sale]" id="lessonN">
  <div class="col"><h1>Title</h1><p class="lead">Intro…</p></div>      <!-- header -->
  <div class="col sec blk [first]" [style="border-top:0;margin-top:8px;padding-top:28px"]>  <!-- section -->
    <h2>Section title</h2><p>…<b>bold</b>…</p> …blocks…
  </div>
  … more sections …
  <div class="col sec blk"><h2>Tóm tắt</h2><div class="take">…</div>
    <div class="done"><button class="startQ" data-i="N">Làm bài kiểm tra</button></div></div>
</article>
```
- `.col` and `.wide` both mean `max-width:800px; padding:0 32px` (CSS line 130). `.wide` is used only in lesson0 (3×), for the p3 cards, the chart and the table.
- `.sec` (line 137) draws a top divider plus 44px spacing. `.first`, or the inline style `border-top:0;margin-top:8px;padding-top:28px` (23×), marks the first section with no divider. 20 `.first` on `sale` lessons; the inline style on Ch1/4/5 lessons.
- `.blk` (line 138) is the reveal-on-scroll wrapper. 298 occurrences, roughly one per section.
- Free elements inside sections: `h2` (297), `p` (415; 22 with `style="margin-top:Npx"`), `p b` emphasis, `b.hl` (accent blue), `h2 style="margin-top:28px"` (a second heading inside one section, once in lesson11), `br` (12). The schema needs `heading`, `paragraph` (rich inline: bold, accent colour) and a section with an optional `noDivider` flag.
- Inline `style="color:#…"` on `<b>` (31×) and on `<td>` (11×) carries semantic tones: green `#7fe0bd`, blue `#7fb8ff`, gold `#e8c77d`, red `#f2a0a0`, white `#dbe7f3`. Map these to a `tone: 'up'|'info'|'warn'|'down'|'neutral'` enum.
- Line 399 overrides every secondary text colour to `#dbe7f3 !important` (spec rule "no grey text").

### 3.1 Occurrence matrix (block roots, per chapter; Ch3 is split into lessons and practice)

| Block (root selector) | C1 | C2 | C3 (L22–30) | Practice L32 | C4 | C5 | Total |
|---|---|---|---|---|---|---|---|
| section `.col.sec.blk` | 64 | 59 | 56 | 7 | 73 | 37 | 296 |
| `.fig.tl` with `<svg>` (chart) | 41 | 7 | 0 | 0 | 46 | 17 | 108+ |
| `.fig.tl` with `<table>` | 5 | 11 | 13 | 0 | 0 | 0 | 29 |
| `table.cmp` (plain grid) | 1 | 1 | 0 | – | – | – | 2 |
| `table.cmp.two` (row-label × columns) | 3 | 9 | 10 | – | – | – | 22 (1 `.bad`) |
| `table.cmp.step` (rowspan group) | 1 | 1 | 3 | – | – | – | 5 |
| `table.cmp` with `span.r` rating dots | 1 (lesson0) | – | – | – | – | – | 1 |
| `.take` summary | 10 | 10 | 9 | 1 | 10 | 4 | 44 |
| `.roles` (term → description list) | 4 | 7 | 9 | 4 (inside cz-x) | 7 | 10 | 41 |
| `.ex2` cards 2-col (base) | 8 | 4 | 0 | – | 8 | 5 | 25 |
| `.ex2.r4` (title+text, no small) | 3 | 4 | 1 | – | – | – | 8 |
| `.ex2.r3` (3-col) | – | – | – | – | 1 | – | 1 |
| `.ex2` with `.good/.no` lists | – | 3 (inside 1–2 ex2) | – | – | – | – | 3+3 cards |
| `.ex2` with `.up/.dn` tones | – | – | – | – | 9 | 5 | 14+14 cards |
| `.ex3` cards 3-col | 1 | 2 | 5 | – | – | – | 8 |
| `.three` (3 tips: b + span) | – | – | – | – | 15 | 10 | 25 |
| `.flow4` (4-step arrows) | 1 | 3 | 3 | 1 | – | – | 8 |
| `.mis` (mistakes, red) | 1 | 2 | 3 | – | – | – | 6 |
| `.adv` (svg icon + h3 + p rows) | 5 rows (lesson0) | – | – | – | – | – | 5 |
| `.three3 > .p3` (big stat cards with icons) | 1 (3 cards) | – | – | – | – | – | 1 |
| `.mini3` (3 label/value chips) | 1 | – | – | – | – | – | 1 |
| `.st3` (3 gauge cards ok/warn/bad) | 1 | – | – | – | – | – | 1 |
| `.st4` (2×2 svg mini-charts + caption) | – | – | – | – | 1 | 2 | 3 |
| `.pat` (5 svg candle patterns) | – | – | – | – | 1 | – | 1 |
| `.big3` (3 big numbers) | – | 3 | – | – | – | – | 3 |
| `.say` quote (`.g` good / `.r` bad / plain) | – | 6 | 11 | – | – | – | 17 |
| `.obj` objection card | – | 6 (lesson17) | – | – | – | – | 6 |
| `.vvca` (4 cards V-V-C-A) | – | – | 1 | – | – | – | 1 |
| `.fun` (funnel bars) | – | – | 1 | – | – | – | 1 |
| `.post` (social post mockup) | – | – | 5 | – | – | – | 5 |
| `.legend` (HTML legend under a chart) | 4 | 1 | – | – | – | – | 5 |
| `.ftitle` (chart title) | 1 | 1 | – | – | – | – | 2 |
| `span.assume` (disclaimer label) | – | 5 | – | – | – | – | 5 |
| `.cz[data-a]` scenario | – | 10 | 9 | – | – | – | 19 |
| `.cz` calculator ("TỰ TÍNH") | – | 1 | – | – | – | – | 1 |
| `.cz` case (prof+pad+rv+cz-x) | – | – | – | 4 | – | – | 4 |
| `.todo` (do-now checklist) | – | 6 | 5 | – | – | – | 11 |
| `.todo.audit` (self-check with x/N) | – | – | 2 | – | – | – | 2 |
| `.pad` (textarea, standalone) | – | 6 | 16 | – | – | – | 22 total incl. 4 in cases |
| `.sc6` + `.verdict` roleplay score | – | – | – | 1 | – | – | 1 |
| `.done > .startQ` | 10+1 ex | 10+1 | 9+1 | 1 | 10+1 | 4+1 | 49 |

Per-lesson inventory (svg = SVG charts, sec = sections):
```
L0  c1 svg10 sec4  three3/p3×3 fig3(2 svg,1 table) ftitle legend cmp(span.r) take adv×5
L1  c1 svg4  sec6  fig4 take roles ex3
L2  c1 svg4  sec7  fig5(4 svg,1 table) cmp.step take roles ex2 mini3
L3  c1 svg4  sec6  fig4 legend take ex2×2 st3
L4  c1 svg3  sec6  fig4(3+cmp.two) take ex2×2
L5  c1 svg5  sec6  fig6(5+cmp.two) take ex2
L6  c1 svg4  sec7  fig4 take ex2 r4
L7  c1 svg4  sec8  fig4 legend take roles ex2×3 (one r4)
L8  c1 svg3  sec7  fig4(3+cmp.two) take roles ex2 r4 flow4
L9  c1 svg5  sec7  fig5 legend take ex2 mis
L11 c2 svg2  sec6  fig3 ftitle legend cmp take ex2.r4 ex3 flow4 cz(calc) cz[data-a] todo big3 assume×3
L12 c2 svg0  sec5  fig1 cmp.two take roles ex2×2(r4×2) cz pad
L13 c2 svg1  sec6  fig2 cmp.two take roles ex2×2(good/no) cz todo pad big3
L14 c2 svg0  sec6  fig1 cmp.step take roles cz say×2 todo pad
L15 c2 svg1  sec6  fig4 cmp.two×3 take roles cz pad
L16 c2 svg1  sec5  fig2 cmp.two take roles ex3 cz say pad assume
L17 c2 svg0  sec5  take flow4 mis cz pad obj×6
L18 c2 svg0  sec7  take roles ex2×2(r4) flow4 cz say×2 todo
L19 c2 svg1  sec6  fig2 cmp.two take roles ex2 cz say todo
L20 c2 svg1  sec7  fig3 cmp.two×2(one .bad) take mis cz todo big3 assume
L22 c3 svg0  sec6  fig1 cmp.two take ex2.r4 cz say pad×2 vvca
L23 c3 svg0  sec5  fig1 cmp.two take roles ex3 cz say todo.audit pad
L24 c3 svg0  sec7  fig1 cmp.step take roles ex3 flow4 cz say todo pad
L25 c3 svg0  sec7  fig2 cmp.two×2 take roles flow4 mis cz pad fun
L26 c3 svg0  sec7  fig1 cmp.two take roles×2 flow4 mis cz todo pad post×3
L27 c3 svg0  sec6  fig1 cmp.two take roles ex3 cz say×4 todo pad post×2
L28 c3 svg0  sec8  fig4 cmp.two×3 cmp.step take roles×2 ex3 cz todo pad×2
L29 c3 svg0  sec5  fig1 cmp.step take roles cz say×4 todo pad×2
L30 c3 svg0  sec5  fig1 cmp.two take ex3 mis cz todo.audit pad
L32 opt svg0 sec7  take roles×4(in cz-x) flow4 cz(case)×4 pad×4 prof×4 rv×4 sc6
L33 c4 svg9  sec7  fig4 take roles ex2 pat(5 svg)
L34 c4 svg5  sec7  fig5 take roles ex2.r3
L35 c4 svg4  sec8  fig4 take roles ex2 three
L36 c4 svg7  sec6  fig3 take ex2 st4(4 svg)
L37 c4 svg6  sec8  fig6 take roles three
L38 c4 svg6  sec8  fig6 take ex2×2 three×2
L39 c4 svg6  sec9  fig6 take roles ex2 three×3
L40 c4 svg4  sec6  fig4 take ex2×2 three×3
L41 c4 svg4  sec7  fig4 take roles three×2
L42 c4 svg4  sec7  fig4 take roles three×3
L44 c5 svg3  sec7  fig3 take roles ex2 three×3
L45 c5 svg7  sec8  fig3 take roles ex2 three×2 st4(4 metric svg m1..m4)
L46 c5 svg4  sec10 fig4 take roles×4 ex2×2 three×2
L47 c5 svg7  sec12 fig7 take roles×4 ex2 three×3 st4
```
Note: the per-lesson counts come from scripted class counting; "fig" counts are the number of `.fig` wrappers.

### 3.2 Blocks: HTML example, CSS, proposed type

Each entry gives the root markup, the CSS lines it uses and a TS shape. `Rich` = inline rich text (bold, accent tone); a minimal option is a string with `**bold**` markup.

**heading / paragraph / lead**
```html
<h1>Đầu tư chứng khoán</h1><p class="lead">…</p>   <h2>…</h2>   <p>… <b>…</b> …</p>
```
CSS: `.art h1` (line 131), `.lead` (132), `.art h2` (134), `.art p` (135–136).
`{type:'paragraph', text: Rich, spaceBefore?: number}`; lead becomes `lesson.intro`.

**chart figure** (`.fig.tl` + optional `.ftitle`, `<svg id>`, `.legend`, `span.assume`)
```html
<div class="fig tl">
  <div class="ftitle">Giá trị 100 triệu đồng sau 10 năm (2015–2025)</div>
  <svg viewBox="0 0 760 280" id="C1L1-g1"></svg>
  <div class="legend"><span><i class="dot" style="background:var(--c1)"></i>Đầu tư theo VN-Index</span>…</div>
  <span class="assume">Số liệu giả định để minh họa</span>
</div>
```
CSS: `.fig` (140), `.fig svg` (141), `.ftitle` (142), `.tl` (293: `background:#0d1520;border:1px solid #1f2b3a;border-radius:12px;padding:16px 16px 12px`), `.legend` (77), `.dot` (68), `.assume` (57).
`{type:'chart', chart: ChartId, title?: string, legend?: {label:string, color:string}[], note?: string, aspect?: [w,h]}`. viewBox is usually 760×(140–330). Ch1 lessons use 720×150; adv icons 200×120; p3 icons 44×44.

**table figure: `table.cmp`** (lesson0, rating cells; lesson11, plain numbers)
```html
<div class="fig tl" style="padding:14px 10px"><table class="cmp">
<tr><th></th><th>Tiết kiệm</th>…<th class="ck">Chứng khoán</th></tr>
<tr><td>Vốn để bắt đầu</td><td><span class="r g">Ít</span></td>…<td class="ck"><span class="r g">Ít</span></td></tr></table></div>
```
CSS: `.cmp` (152–159; `.ck` is the highlighted column with a blue border), `.r.g/.r.m/.r.b` (160–163, coloured dot plus label: good/medium/bad).
**`table.cmp.two`**: first column is the row label, `th.ck` / `td.ck` mark the highlighted column; `.bad` colours column 2 red (lines 223–227, 297–299). Lesson20 example: "Không nói" / "Nên nói".
**`table.cmp.step`**: first column `td.sx` with `rowspan` (group label, e.g. HOSE vs HNX/UPCoM); last column muted (201–203, 304–305).
```ts
{type:'table', variant:'grid'|'rows'|'grouped', columns: {label:string, highlight?:boolean}[],
 rows: {label?:string, group?:{label:string, span:number}, cells:(Rich|{rating:'g'|'m'|'b', text:string})[], tone?:Tone}[]}
```

**summary `.take`** (44; one per lesson, always under the "Tóm tắt" h2)
```html
<div class="take"><div><span>Lạm phát làm <b>giảm sức mua</b> của tiền nhàn rỗi.</span></div>…</div>
```
CSS 170–173 (blue bullet dot). `{type:'summary', items: Rich[]}`, 4 items typically. It could also be modelled as the lesson's `summary` field instead of a block.

**term list `.roles`** (41)
```html
<div class="roles"><div><b>Ủy ban Chứng khoán Nhà nước</b><span>Quản lý, cấp phép…</span></div>…</div>
```
CSS 183–187 (two-column grid 220px | 1fr; stacks at ≤900px). `{type:'definitions', items:{term:string, text:Rich}[]}`. It is also reused inside the case reveal (`.cz-x .roles`).

**cards 2-col `.ex2`** (35 roots; variants)
```html
<div class="ex2"><div class="on"><b>LO</b><small>Lệnh giới hạn</small><p>Mua hoặc bán…</p></div>…</div>
<div class="ex2 r4"><div><b style="color:#f2a0a0">Không hiểu khách hàng</b><p>…</p></div>…</div>
<div class="ex2"><div class="dn"><b>Quá mua · trên 70</b><p>…</p></div><div class="up"><b>Quá bán · dưới 30</b><p>…</p></div></div>
<div class="ex2"><div class="good"><b>Nên đăng</b><ul><li>…</li></ul></div><div class="no"><b>Không đăng</b><ul>…</ul></div></div>
<div class="ex2 r3"><div class="up">…</div><div class="dn">…</div><div>…</div></div>
```
CSS: base 204–210; `.r4` 229–230; `.up/.dn` 260–262; `.r3` 285–286; `.sale .good/.no` + `ul/li` 305–310.
**cards 3-col `.ex3`** (8): `<div class="on"><b>HOSE</b><small>Sở GDCK TP.HCM</small><dl><dt>Biên độ giá</dt><dd>±7%</dd>…</dl></div>`, or the sale variant with `<p>` / `<ul>`. CSS 188–197, 300–302, 394–397.
**tips 3-col `.three`** (25, Ch4/5 only: "Cách sử dụng", "Sai lầm thường gặp", "Độ mạnh"): `<div class="three"><div><b>Chạm nhiều lần</b><span>…</span></div>…</div>`. CSS 287, 291.
All of these can be one card-grid type:
```ts
{type:'cards', columns: 2|3|4, items: {title:string, subtitle?:string, text?:Rich, bullets?:string[],
  facts?:{label:string,value:string}[], tone?:'highlight'|'up'|'down'|'good'|'bad'|'warn'|'neutral', titleTone?:Tone}[],
 style?: 'card'|'tip'}   // tip = .three (panel bg, smaller)
```

**flow `.flow4`** (8): `<div class="flow4"><div><small>Bước 1</small><b>Traffic</b><span>…</span></div>×4</div>`. CSS 231–238 (→ arrows between cards; title colours by position, differing in `.sale` at 311). `{type:'steps', items:{label:string,title:string,text:string}[]}` (always 4).

**mistakes `.mis`** (6): `<div class="mis"><div><b>Gồng lỗ</b><span>…</span></div>…</div>`. CSS 239–243 (red left border, 2-col). `{type:'mistakes', items:{title,text}[]}`. Ch4/5 "Sai lầm thường gặp" uses `.three` instead; the spec makes "Sai lầm thường gặp" required from Ch6.

**stat cards `.three3 > .p3`** (lesson0 only)
```html
<div class="three3"><div class="p3"><svg viewBox="0 0 44 44" id="C1L1-ic-ket"></svg><span>Giữ tiền mặt</span><b style="color:#dbe7f3">74 triệu</b><small>sức mua còn lại</small></div>…<div class="p3 on">…<b class="hl">308 triệu</b>…</div></div>
```
CSS 145–151. **`.mini3`** (lesson2): `<div><span>HOSE</span><b>±7%</b></div>×3`, CSS 198–199. **`.big3`** (Ch2 ×3): `<div><b>100</b><span>người tiếp cận mỗi tháng</span></div>×3`, CSS 320–323.
`{type:'stats', variant:'hero'|'chip'|'big', items:{label:string, value:string, note?:string, icon?:IconId, highlight?:boolean, tone?:Tone}[]}`.

**gauge cards `.st3`** (lesson3, margin ratio)
```html
<div class="st3"><div class="ok"><small>Khi mua</small><b>50%</b><i style="--w:50%"></i><span>Tài sản 200 · Nợ 100</span><em>An toàn</em></div> .warn… .bad…</div>
```
CSS 211–222 (bar width is `calc(var(--w)*2)`). `{type:'gauges', items:{label,value:string,pct:number,caption,badge,tone:'ok'|'warn'|'bad'}[]}`.

**icon rows `.adv`** (lesson0): `<div class="adv"><svg viewBox="0 0 200 120" id="C1L1-a1"></svg><div><h3>Vốn đầu tư linh hoạt</h3><p>…</p></div></div>`. CSS 165–169. `{type:'featureRows', items:{icon:ChartId,title,text:Rich}[]}`.

**mini-chart grids**: `.st4` (2×2: `<div><svg id="C4L4-s1"/><b>Giá tăng, khối lượng tăng</b><span>…</span></div>`; CSS 289, 292) and `.pat` (5-col candle patterns, CSS 263–268). `{type:'chartGrid', columns:2|5, items:{chart:ChartId,title,text}[]}`.

**quote `.say`** (Ch2/3 only)
```html
<div class="say r"><small>Không nên</small>“Chào anh, em đang làm chứng khoán…”</div>   <!-- .g = Nên, plain = Câu tóm gọn / Mẫu -->
```
CSS 313–316. `{type:'quote', label:string, text:string, tone:'good'|'bad'|'neutral'}`.

**objection `.obj`** (lesson17 ×6): `<div class="obj"><h3>“Chứng khoán là cờ bạc.”</h3><p>“Em hiểu…”</p></div>`. CSS 317–319. `{type:'objection', objection:string, response:Rich}`.

**`.vvca`** (lesson22): 4 cards, `<div><small>VISIBILITY</small><b>Xuất hiện</b><span>…</span></div>`; per-position title colours (381–386). Fold into `cards` with `columns:4` and an `eyebrow` field.

**funnel `.fun`** (lesson25): `<div style="width:100%;background:#2bb886"><span>10.000 người xem</span><small>Thu hút…</small></div>…` (6 bars, decreasing width). CSS 376–378. `{type:'funnel', items:{label,note?,widthPct:number,color:string}[]}`. It could also be rendered as a React chart.

**post mockup `.post`** (Ch3 L26 ×3, L27 ×2)
```html
<div class="post"><div class="post-t">Bài mẫu · Câu chuyện</div>
<div class="post-h"><i></i><div><b>Lan Nguyễn · SACO tại DNSE</b><small>Công khai</small></div></div>
<div class="post-b">multi-line text (white-space:pre-line)</div>
<div class="post-w"><b>Vì sao hiệu quả:</b> …</div></div>
```
CSS 387–393. `{type:'samplePost', kicker:string, author:string, audience:string, body:string /* newlines preserved */, why:Rich}`.

**scenario `.cz[data-a]`** (19, required per spec §2.3)
```html
<div class="cz" data-a="1"><div class="cz-h"><span>TÌNH HUỐNG</span><b>Mở nhiều tài khoản nhưng không có thu nhập</b></div>
<p>Tháng đầu, Hùng mở được 8 tài khoản…</p><div class="cz-q">Bạn sẽ chọn cách nào?</div>
<div class="cz-o"><button>…</button><button>…</button><button>…</button></div>
<div class="cz-x" hidden><b>Cách tốt nhất: …</b> explanation…</div></div>
```
CSS 325–340. Always 3 options; `data-a` ∈ {0,1,2}. The answer is allowed client-side.
`{type:'scenario', id:string /* stable, e.g. 'c2l1' */, title:string, story:Rich[], question:string /* 'Bạn sẽ chọn cách nào?' */, options:[string,string,string], answer:0|1|2, explanation:Rich}`. It is one per lesson and always sits in the "Thực chiến" section. The server needs `scenarioId → answer` only to validate the choice index (0..2); the gate is "has any choice".

**calculator** (lesson11): `.cz[style=border-color:#2a6b57]` with `cz-h` "TỰ TÍNH", `.calc` (2 number inputs `cN`, `cV`) and `.calc-out #cOut`. CSS 352–356. `{type:'incomeCalculator', feeRate:0.0015, share:0.7, defaults:{clients:20, monthlyValueMillion:200}}`.

**todo `.todo`** (11) and **self-check `.todo.audit`** (2)
```html
<div class="todo"><h3>Việc làm ngay</h3><label><input type="checkbox" data-k="l1-0"><span>Viết mục tiêu…</span></label>…</div>
<div class="todo audit"><h3>Tự kiểm tra hồ sơ của bạn</h3>…<div class="audit-out"><span>Số mục đã đạt</span><b class="aud-n">0/8</b></div></div>
```
CSS 341–345, 379–380. `{type:'checklist', id:string, title:string, items:{id:string,text:string}[], mode:'todo'|'selfCheck'}`. For selfCheck the UI shows `x/N`.

**pad `.pad`** (22)
```html
<div class="pad"><b>Bài tự làm: phân loại 3 người thật</b><small>Chọn 3 người…</small>
<textarea data-k="l2" placeholder="Viết câu trả lời của bạn ở đây…"></textarea><em>Phần bạn viết được lưu trên trình duyệt này.</em></div>
```
CSS 346–351, plus the line 400 override (`small` 15px / 1.75). In cases the `<small>` has 4 prompts split by `<br>`. Spec §2.4: one per line, 15px, white. `{type:'workpad', id:string, title:string, prompt?:string, prompts?:string[], placeholder?:string}`. The saved-note text should change to "saved to account".

**practice case** (lesson32 ×4): `.cz` without `data-a`, `cz-h` "CASE n", `.prof` (3 columns: Thông tin khách `ul`, Tâm lý `ul`, Câu thường nói `p.q`), then `.pad` (4 prompts), `.rv button`, and `.cz-x[hidden] > .roles` (Mấu chốt, Trả lời câu khách hay nói, Hướng gợi ý, Câu chốt, Tránh). CSS 357–364.
```ts
{type:'practiceCase', id:'case1', title:string, profile:{info:string[], mindset:string[], quote:string},
 pad:{id:'case1', prompts:string[4]}, hints:{term:string,text:string}[]}
```

**roleplay score** (lesson32): `.sc6#sc6` with 6 rows (`span` + `small`, range, `output`) and `.verdict` (`#scT`, `#scV`). CSS 365–375. `{type:'roleplayScore', criteria:{title,hint}[6], max:10, bands:[{min:48,label:'Sẵn sàng gặp khách thật',tone:'g'},{min:36,label:'Cần luyện thêm',tone:'m'},{min:0,label:'Cần học lại',tone:'r'}]}`. It is local-only (not persisted in the mockup).

**quiz CTA `.done > button.startQ[data-i]`**: implicit, rendered by the lesson shell. CSS 174–177, 228, 401.

### 3.3 Proposed discriminated union (summary)
```ts
type Tone = 'neutral'|'highlight'|'up'|'down'|'good'|'bad'|'warn'|'info';
type Rich = string; // inline **bold** and [tone]{text} for coloured spans
type Block =
 | {type:'paragraph'; text:Rich}
 | {type:'heading'; text:string}                        // 2nd h2 within a section (rare)
 | {type:'chart'; chart:string; title?:string; legend?:{label:string;color:string}[]; note?:string}
 | {type:'table'; variant:'grid'|'rows'|'grouped'; columns:{label:string;highlight?:boolean}[]; rows:TableRow[]; note?:string}
 | {type:'cards'; columns:2|3|4; style?:'card'|'tip'; items:Card[]}
 | {type:'definitions'; items:{term:string;text:Rich}[]}
 | {type:'steps'; items:{label:string;title:string;text:string}[]}
 | {type:'mistakes'; items:{title:string;text:string}[]}
 | {type:'stats'; variant:'hero'|'chip'|'big'; items:Stat[]}
 | {type:'gauges'; items:Gauge[]}
 | {type:'featureRows'; items:{icon:string;title:string;text:Rich}[]}
 | {type:'chartGrid'; columns:2|5; items:{chart:string;title:string;text:string}[]}
 | {type:'quote'; label:string; text:string; tone:'good'|'bad'|'neutral'}
 | {type:'objection'; objection:string; response:Rich}
 | {type:'funnel'; items:{label:string;note?:string;widthPct:number;color:string}[]}
 | {type:'samplePost'; kicker:string; author:string; audience:string; body:string; why:Rich}
 | {type:'note'; text:string}                           // span.assume
 // interactive (Ch2/Ch3/practice only)
 | {type:'scenario'; id:string; title:string; story:Rich[]; question:string; options:[string,string,string]; answer:0|1|2; explanation:Rich}
 | {type:'checklist'; id:string; title:string; mode:'todo'|'selfCheck'; items:{id:string;text:string}[]}
 | {type:'workpad'; id:string; title:string; prompt?:string; prompts?:string[]}
 | {type:'incomeCalculator'; feeRate:number; share:number; defaults:{clients:number;monthlyValueMillion:number}}
 | {type:'practiceCase'; id:string; title:string; profile:{info:string[];mindset:string[];quote:string}; prompts:string[]; hints:{term:string;text:string}[]}
 | {type:'roleplayScore'; criteria:{title:string;hint:string}[]; max:number; bands:{min:number;label:string;tone:'g'|'m'|'r'}[]};
type Section = {title:string; noDivider?:boolean; blocks:Block[]};
type LessonContent = {title:string; intro:string; sections:Section[]; summary:Rich[]};
```

---

## 4. Chart inventory (drawn by JS, to be rebuilt as React components)

Each lesson IIFE defines local helpers (`$=id=>getElementById('C4L5-'+id)`, `candle`, `poly`, `zone`, `vbar`, `rng` (mulberry32-style seeded PRNG), `sma`, `ema`, `rsi` (Wilder), `macdOf`, `bands`, `fib`, `wave`, `series`, `plot`, `legend`, `panel`, `crosses`, `frame`). Charts use the palette `C` and colours UP `#2bb886` / DN `#e66767` / MA `#249bec,#dfb969,#d95926`. The same helper block is copy-pasted per lesson, so it is a candidate for shared React chart primitives.

| Lesson | SVG ids (comment label) |
|---|---|
| L0 | C1L1-ic-ket/tk/ck (3 icons), -g1 growth (3 lines, VNI/6%/CPI), -g2 banknotes, -a1..a5 advantage icons |
| L1 | C1L2-g1 primary vs secondary, -g2 IPO path, -g3 participants, -g4 VN-Index vs VN30 |
| L2 | C1L3-g1 order ticket, -g2 price band, -g3 sessions, -g4 order book |
| L3 | C1L4-g1 calendar (T+2), -g2 receipts, -g3 margin stack, -g4 leverage |
| L4 | C1L5-g1 owner vs creditor, -g2 bond cashflow, -g3 risk-return |
| L5 | C1L6-g1 fund, -g2 ETF basket, -g3 CW payoff, -g4 futures, -g5 risk scale |
| L6 | C1L7-g1 timeline, -g2/g3/g4 before/after bars (`ba()`) |
| L7 | C1L8-g1 cycle wave, -g2 lead/lag, -g3 interest rate effects, -g4 inflation loop |
| L8 | C1L9-g1 four phases, -g2 emotions, -g3 VN-Index 2020–2022 |
| L9 | C1L10-g1 diversification, -g2 loss math, -g3 allocation, -g4 position sizing, -g5 plan checklist |
| L11 | L1-g1 retained clients 12 months, L1-g2 funnel |
| L13 | L3-g1 relationship circles |
| L15 | L5-g1 70/30 |
| L16 | L6-g1 fee vs mistake |
| L19 | L9-g1 care timeline |
| L20 | L10-g1 one-day schedule |
| L33 | C4L1-g1 anatomy, -g2 body/shadow, -g3 timeframe, -p1..p5 patterns, -g4 full chart |
| L34 | C4L2-g1 three trends, -g2 peaks/troughs, -g3 trend lines, -g4 timeframes, -g5 trend end |
| L35 | C4L3-g1 range, -g2 zone with wicks, -g3 role reversal, -g4 true vs false breakout |
| L36 | C4L4-g1 price+volume, -g2 healthy vs weakening, -s1..s4 four states, -g3 spike on breakout |
| L37 | C4L5-g1 price vs MA20, -g2 MA20/50/200, -g3 trend up/down, -g4 dynamic support, -g5 golden/death cross, -g6 sideways whipsaw |
| L38 | C4L6-g1, -g0 how RSI works, -g2 zones, -g3 strong uptrend, -g4 divergence, -g5 worked example |
| L39 | C4L7-g1, -g2 EMA12/26, -g3 crossovers, -g4 histogram, -g5 divergence, -g6 worked example |
| L40 | C4L8-g1, -g2 squeeze/expansion, -g3 ranging vs riding, -g4 worked example |
| L41 | C4L9-g1 sequence, -g2 retracement levels, -g3 up vs down, -g4 worked example |
| L42 | C4L10-g1 impulse/corrective, -g2 rules, -g3 fib zones, -g4 how to use |
| L44 | C5L1-g1 monthly buys, -g2 six-month example, -g3 lump sum vs DCA |
| L45 | C5L2-g1 price vs value, -g2 margin of safety, -m1..m4 metric charts, -g3 ratios example |
| L46 | C5L3-g1 four M, -g2 big five, -g3 sticker price flow, -g4 buy-zone scale |
| L47 | C5L4-g1 letters, -g2 C and A, -g3 cup with handle, -g0 process, -g5 worked example, -g6 market direction, -g4 leaders |

Ch3 lessons (L22–L30) and practice have **no SVG**. All their figures are tables.

---

## 5. Implementation notes and gaps found in the mockup
1. The mockup keys progress by **array index** (`done:[0..48]`, `cz_lessonN`). The real system must key by stable lesson ids or slugs, because the 94-lesson catalogue would shift indices. Map the mockup's `cz_lessonN` and `data-k` keys to stable block ids (`scenario.id`, `checklist.items[].id`, `workpad.id`).
2. Coins in the mockup are derived (`500 + 100 × lessons done incl. practice`), not ledgered. The real system must credit +100 once on the first pass of a lesson or the practice room and 0 for exams (spec §4.3).
3. The quiz options in the bank are mostly answer-index 0. The server must shuffle (or the client must, after receiving options without answers), and grading must be server-side by option id or text, not by position.
4. There is no Back button in the quiz. The result screen shows only the score, the pass/fail label and the pill (unlock indicator or chapter complete). This matches spec §3.2.
5. Scenario choice is single-shot and persists. The quiz gate is a client check in the mockup; the spec adds server 403 `ACADEMY_SCENARIO_REQUIRED`.
6. The sidebar header "43 bài học" is hard-coded. The progress denominator is `NL` (computed). The practice room is shown as a row after "Bài thi Chương 3" with title "Phòng tập thực chiến", and its crumb is "Chương 3 · Phòng tập thực chiến".
7. Calculator and roleplay sliders are not persisted. Pads, todos and audits persist only to localStorage, all under one key.
8. About 130 lines of legacy CSS are unused by any article (`.sc`, `.guide`, `.ctrls`, `.opts`, `.sum`, `.rule72`, `.stat`, `.qhead/.qz/.qi/.qbar`). Do not port them.
