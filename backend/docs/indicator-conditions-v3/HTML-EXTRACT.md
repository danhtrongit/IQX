# Report: IQX_CHI_BAO_MAU.html (authoritative content standard for SPEC V3)

Source files read in full:
- /Users/danhtrongit/Projects/IQX/backend/docs/indicator-conditions-v3/IQX_CHI_BAO_MAU.html (212 lines, 33,789 B)
- /Users/danhtrongit/Projects/IQX/backend/docs/indicator-conditions-v3/IQX_CHI_BAO_SPEC.md (460 lines), used only for the §3/§4 cross-check.

No repo file was modified.

I extracted the data by running the HTML's own `RULES` and `META` block (lines 50-116) in node, not by hand-copying. Outputs are in the scratchpad and are outside the repo:
- /private/tmp/claude-501/-Users-danhtrongit-Projects-IQX/89c43590-ef86-452e-9491-b1ad7fd6562a/scratchpad/out.json is the raw extraction.
- /private/tmp/claude-501/-Users-danhtrongit-Projects-IQX/89c43590-ef86-452e-9491-b1ad7fd6562a/scratchpad/reg.js regenerates the registry table below.

**Headline:** I compared all 27 rows per tab and every default (buy, sell, enabled), op set and range against spec §3. I found no content-level conflict between the HTML and the spec: sentences, operators, ranges and defaults all match. The only differences are secondary (section C). The HTML contains no signal-evaluation logic. §2 operator semantics, the Bollinger action definitions, the Donchian and OBV "exclude bar T" rules and `NO_SIGNAL` come only from the spec.

---

## A. Where things are in the HTML

| What | Lines |
|---|---|
| File comment ("v2: mọi chu kỳ và ngưỡng nằm trong từng dòng điều kiện; RSI dòng 2 là xu hướng lên/xuống") | 2 |
| `PRESETS=[5,10,20,50,100,200]` | 50 |
| `META` (15 indicators: id, name, group) | 51-67 |
| Part builders `T`, `S`, `P`, `N`, `per`, and op sets `CROSS`, `UPDN`, `CMP`, `ALL` | 69-77 |
| `RULES` (all rows, defaults, `on`, `pairs`) | 79-116 |
| `makeSide` / `defaults()` | 118-119 |
| localStorage key `iqx_bot_indicator_panels_v2` | 120 |
| `shapeOk` (old-format rejection) | 122 |
| `makeRule` (row rendering) | 128-135 |
| `showEditor` (rule-count text at 146) | 137-148 |
| `isNum` | 166 |
| `validateSides` (all validation messages) | 167-181 |
| `editorInput` (value coercion) | 192-198 |
| Save / Cancel / Reset handlers | 201-203 |
| Export JSON (`version:'2.0'`) | 205-206 |

### Part and op set definitions (lines 69-77)
```js
PRESETS=[5,10,20,50,100,200]
T(s)           -> {t:s}                      // fixed text
S(k,opts,a)    -> {k, sel:opts, a}           // <select>; option item = value, or [value,label]
P(k,a)         -> {k, sel:PRESETS, a, preset:1}   // standard SMA period select
N(k,min,max,step,a,w) -> {k,min,max,step,a,w}     // <input type=number>; w=1 -> class "wide" (CCI and ROC thresholds)
per(k,a,min=2,max=200) = N(k,min,max,1,a)          // integer period
CROSS=[['cắt lên','cắt lên'],['cắt xuống','cắt xuống']]
UPDN =[['cắt lên','lên'],['cắt xuống','xuống']]    // value "cắt lên"/"cắt xuống", label "lên"/"xuống"
CMP  =['>','<']
ALL  =['cắt lên','cắt xuống','>','<']
```
Here `a` is the aria-label and title of the field. It is also the label used in validation messages.

### Stored shape (exact; lines 118-119, 145, 206)
```js
// per indicator
{ active: boolean,                              // defaults(): true only for 'rsi' and 'sma' (demo)
  buy:  { enabled: true, rules: [ { enabled: !!row.on, ...row.buy  }, ... ] },
  sell: { enabled: true, rules: [ { enabled: !!row.on, ...row.sell }, ... ] } }
// export file: { version:'2.0', source:'IQX HTML demo', note:'...', indicators:{ rsi:{...}, macd:{...}, ... } }
```
- Row DOM path is `rules.${i}.${key}`. Rows have no ids and are addressed by index.
- Number inputs are stored with `Number(input.value)`, or `''` when empty.
- A preset select value is coerced to Number only when the field name matches `/(period|fast|slow)$/` and the value is in PRESETS (line 194).
- All other select values are stored as the Vietnamese string value.
- The same key `dir` has three value domains:
  - `lên`/`xuống`: SMA, EMA and RSI trend.
  - `tăng`/`giảm`: `macd.hist` and `bb.price_dir`.
  - `mở rộng`/`thu hẹp`: `bb.width`.
- The key `action` has two domains: the 6 Bollinger values and `vượt đỉnh`/`phá đáy` for OBV.

### Order
- Sidebar and `META` order in the HTML (lines 52-66): rsi, macd, sma, bb, ema, cross, dmi, donchian, stoch, cci, mfi, roc, willr, obv, cmf.
  - Row counts in that order: 2·3·3·3·3·1·2·1·2·1·1·1·1·2·1.
- Spec §3 order: sma, ema, cross, rsi, macd, stoch, cci, mfi, roc, willr, bb, donchian, dmi, obv, cmf.
  - Row counts in that order: 3·3·1·2·3·2·1·1·1·1·3·1·2·2·1, total 27 rows per tab.
  - Per-indicator counts are identical between the HTML and the spec.
- `META` names and groups:

| id | name | group |
|---|---|---|
| rsi | RSI | Động lượng |
| macd | MACD | Động lượng |
| sma | MA / SMA | Đường trung bình |
| bb | Bollinger Bands | Biến động |
| ema | EMA | Đường trung bình |
| cross | MA Cross | Đường trung bình |
| dmi | DMI + ADX | Xu hướng |
| donchian | Donchian Channel | Kênh giá |
| stoch | Stochastic | Động lượng |
| cci | CCI | Động lượng |
| mfi | MFI | Dòng tiền |
| roc | ROC | Động lượng |
| willr | Williams %R | Động lượng |
| obv | OBV | Khối lượng |
| cmf | Chaikin Money Flow | Dòng tiền |

- The sidebar also shows a disabled "Khối lượng / Chưa chốt" card after bb (line 158). It is not one of the 15 and is unchanged.

---

## B. Machine-usable registry table (spec §3 order)

Notation:
- `sentence`: `{key}` is an input and the rest is fixed text, tokens space-separated exactly as the HTML renders them.
- `int:[min,max]`: integer number input, step 1.
- `num:[min,max]` with `step`: decimal input.
- `preset`: select of `5,10,20,50,100,200`.
- `sel`: select options in order. A `[value,label]` pair means the stored value differs from the displayed label.
- `label`: the aria-label and title, also used in error messages.
- `on`: the row's default enabled state, the same for buy and sell.
- `fast_lt_slow`: save is rejected when fast >= slow.
- `wide`: cosmetic input width.
- The `id` values are NOT in the HTML. The HTML has no row ids. I proposed them, and only `rsi.level` and `rsi.trend` come from spec §1.4.

```
// sma  specOrder=1 htmlOrder=3 name="MA / SMA" group="Đường trung bình"
{"id":"sma.price_cross","n":1,"sentence":"Giá cắt {op} SMA {period}","on":true,"fields":{"op":{"sel":[["cắt lên","lên"],["cắt xuống","xuống"]],"label":"Hướng cắt"},"period":{"preset":[5,10,20,50,100,200],"label":"Chu kỳ SMA"}},"buy":{"op":"cắt lên","period":20},"sell":{"op":"cắt xuống","period":20}}
{"id":"sma.ma_cross","n":2,"sentence":"SMA {fast} cắt {op} SMA {slow}","on":false,"fast_lt_slow":true,"fields":{"fast":{"preset":[5,10,20,50,100,200],"label":"Chu kỳ SMA nhanh"},"op":{"sel":[["cắt lên","lên"],["cắt xuống","xuống"]],"label":"Hướng giao cắt"},"slow":{"preset":[5,10,20,50,100,200],"label":"Chu kỳ SMA chậm"}},"buy":{"fast":10,"slow":20,"op":"cắt lên"},"sell":{"fast":10,"slow":20,"op":"cắt xuống"}}
{"id":"sma.trend","n":3,"sentence":"SMA {period} xu hướng {dir}","on":false,"fields":{"period":{"preset":[5,10,20,50,100,200],"label":"Chu kỳ SMA"},"dir":{"sel":["lên","xuống"],"label":"Xu hướng SMA"}},"buy":{"period":20,"dir":"lên"},"sell":{"period":20,"dir":"xuống"}}
// ema  specOrder=2 htmlOrder=5 name="EMA" group="Đường trung bình"
{"id":"ema.price_cross","n":1,"sentence":"Giá cắt {op} EMA {period}","on":true,"fields":{"op":{"sel":[["cắt lên","lên"],["cắt xuống","xuống"]],"label":"Hướng cắt"},"period":{"int":[2,200],"label":"Chu kỳ EMA"}},"buy":{"op":"cắt lên","period":20},"sell":{"op":"cắt xuống","period":20}}
{"id":"ema.ma_cross","n":2,"sentence":"EMA {fast} cắt {op} EMA {slow}","on":false,"fast_lt_slow":true,"fields":{"fast":{"int":[2,200],"label":"Chu kỳ EMA nhanh"},"op":{"sel":[["cắt lên","lên"],["cắt xuống","xuống"]],"label":"Hướng giao cắt"},"slow":{"int":[2,200],"label":"Chu kỳ EMA chậm"}},"buy":{"fast":10,"slow":20,"op":"cắt lên"},"sell":{"fast":10,"slow":20,"op":"cắt xuống"}}
{"id":"ema.trend","n":3,"sentence":"EMA {period} xu hướng {dir}","on":false,"fields":{"period":{"int":[2,200],"label":"Chu kỳ EMA"},"dir":{"sel":["lên","xuống"],"label":"Xu hướng EMA"}},"buy":{"period":20,"dir":"lên"},"sell":{"period":20,"dir":"xuống"}}
// cross  specOrder=3 htmlOrder=6 name="MA Cross" group="Đường trung bình"
{"id":"cross.ma_cross","n":1,"sentence":"SMA {fast} cắt {op} SMA {slow}","on":true,"fast_lt_slow":true,"fields":{"fast":{"preset":[5,10,20,50,100,200],"label":"Chu kỳ SMA nhanh"},"op":{"sel":[["cắt lên","lên"],["cắt xuống","xuống"]],"label":"Hướng giao cắt"},"slow":{"preset":[5,10,20,50,100,200],"label":"Chu kỳ SMA chậm"}},"buy":{"fast":20,"slow":50,"op":"cắt lên"},"sell":{"fast":20,"slow":50,"op":"cắt xuống"}}
// rsi  specOrder=4 htmlOrder=1 name="RSI" group="Động lượng"
{"id":"rsi.level","n":1,"sentence":"RSI {period} {op} {threshold}","on":true,"fields":{"period":{"int":[2,200],"label":"Chu kỳ RSI"},"op":{"sel":[">","<"],"label":"Dấu so sánh"},"threshold":{"int":[0,100],"label":"Ngưỡng RSI"}},"buy":{"period":14,"op":"<","threshold":30},"sell":{"period":14,"op":">","threshold":70}}
{"id":"rsi.trend","n":2,"sentence":"RSI {period} xu hướng {dir}","on":true,"fields":{"period":{"int":[2,200],"label":"Chu kỳ RSI"},"dir":{"sel":["lên","xuống"],"label":"Xu hướng RSI"}},"buy":{"period":14,"dir":"lên"},"sell":{"period":14,"dir":"xuống"}}
// macd  specOrder=5 htmlOrder=2 name="MACD" group="Động lượng"
{"id":"macd.signal","n":1,"sentence":"MACD {fast} / {slow} {op} Signal {signal}","on":true,"fast_lt_slow":true,"fields":{"fast":{"int":[2,200],"label":"Chu kỳ EMA nhanh"},"slow":{"int":[2,200],"label":"Chu kỳ EMA chậm"},"op":{"sel":["cắt lên","cắt xuống",">","<"],"label":"Quan hệ MACD với Signal"},"signal":{"int":[2,200],"label":"Chu kỳ Signal"}},"buy":{"fast":12,"slow":26,"signal":9,"op":"cắt lên"},"sell":{"fast":12,"slow":26,"signal":9,"op":"cắt xuống"}}
{"id":"macd.zero","n":2,"sentence":"MACD {fast} / {slow} {op} 0","on":false,"fast_lt_slow":true,"fields":{"fast":{"int":[2,200],"label":"Chu kỳ EMA nhanh"},"slow":{"int":[2,200],"label":"Chu kỳ EMA chậm"},"op":{"sel":[">","<"],"label":"Quan hệ với 0"}},"buy":{"fast":12,"slow":26,"op":">"},"sell":{"fast":12,"slow":26,"op":"<"}}
{"id":"macd.hist","n":3,"sentence":"Histogram MACD {fast} / {slow} / {signal} {dir} so với phiên trước","on":false,"fast_lt_slow":true,"fields":{"fast":{"int":[2,200],"label":"Chu kỳ EMA nhanh"},"slow":{"int":[2,200],"label":"Chu kỳ EMA chậm"},"signal":{"int":[2,200],"label":"Chu kỳ Signal"},"dir":{"sel":["tăng","giảm"],"label":"Biến động Histogram"}},"buy":{"fast":12,"slow":26,"signal":9,"dir":"tăng"},"sell":{"fast":12,"slow":26,"signal":9,"dir":"giảm"}}
// stoch  specOrder=6 htmlOrder=9 name="Stochastic" group="Động lượng"
{"id":"stoch.level","n":1,"sentence":"%K {k} làm mượt {smooth} {op} {threshold}","on":true,"fields":{"k":{"int":[2,200],"label":"Chu kỳ %K"},"smooth":{"int":[1,10],"label":"Làm mượt %K"},"op":{"sel":[">","<"],"label":"Dấu so sánh"},"threshold":{"int":[0,100],"label":"Ngưỡng Stochastic"}},"buy":{"k":14,"smooth":3,"op":"<","threshold":20},"sell":{"k":14,"smooth":3,"op":">","threshold":80}}
{"id":"stoch.kd_cross","n":2,"sentence":"%K {k} làm mượt {smooth} {op} %D {d}","on":true,"fields":{"k":{"int":[2,200],"label":"Chu kỳ %K"},"smooth":{"int":[1,10],"label":"Làm mượt %K"},"op":{"sel":["cắt lên","cắt xuống"],"label":"Giao cắt Stochastic"},"d":{"int":[1,20],"label":"Chu kỳ %D"}},"buy":{"k":14,"smooth":3,"d":3,"op":"cắt lên"},"sell":{"k":14,"smooth":3,"d":3,"op":"cắt xuống"}}
// cci  specOrder=7 htmlOrder=10 name="CCI" group="Động lượng"
{"id":"cci.cross","n":1,"sentence":"CCI {period} {op} {threshold}","on":true,"fields":{"period":{"int":[2,200],"label":"Chu kỳ CCI"},"op":{"sel":["cắt lên","cắt xuống"],"label":"Hướng giao cắt CCI"},"threshold":{"int":[-300,300],"label":"Ngưỡng CCI","wide":1}},"buy":{"period":20,"op":"cắt lên","threshold":-100},"sell":{"period":20,"op":"cắt xuống","threshold":100}}
// mfi  specOrder=8 htmlOrder=11 name="MFI" group="Dòng tiền"
{"id":"mfi.cross","n":1,"sentence":"MFI {period} {op} {threshold}","on":true,"fields":{"period":{"int":[2,200],"label":"Chu kỳ MFI"},"op":{"sel":["cắt lên","cắt xuống"],"label":"Hướng giao cắt MFI"},"threshold":{"int":[0,100],"label":"Ngưỡng MFI"}},"buy":{"period":14,"op":"cắt lên","threshold":20},"sell":{"period":14,"op":"cắt xuống","threshold":80}}
// roc  specOrder=9 htmlOrder=12 name="ROC" group="Động lượng"
{"id":"roc.cross","n":1,"sentence":"ROC {period} {op} {threshold} %","on":true,"fields":{"period":{"int":[2,252],"label":"Chu kỳ ROC"},"op":{"sel":["cắt lên","cắt xuống"],"label":"Hướng giao cắt ROC"},"threshold":{"num":[-100,10000],"step":0.1,"label":"Ngưỡng ROC (%)","wide":1}},"buy":{"period":20,"op":"cắt lên","threshold":5},"sell":{"period":20,"op":"cắt xuống","threshold":-5}}
// willr  specOrder=10 htmlOrder=13 name="Williams %R" group="Động lượng"
{"id":"willr.cross","n":1,"sentence":"Williams %R {period} {op} {threshold}","on":true,"fields":{"period":{"int":[2,200],"label":"Chu kỳ Williams %R"},"op":{"sel":["cắt lên","cắt xuống"],"label":"Hướng giao cắt Williams"},"threshold":{"int":[-100,0],"label":"Ngưỡng Williams %R"}},"buy":{"period":14,"op":"cắt lên","threshold":-80},"sell":{"period":14,"op":"cắt xuống","threshold":-20}}
// bb  specOrder=11 htmlOrder=4 name="Bollinger Bands" group="Biến động"
{"id":"bb.price_action","n":1,"sentence":"Giá đóng cửa {action} Bollinger {period} hệ số {mult}","on":true,"fields":{"action":{"sel":["quay vào dải từ dưới","quay vào dải từ trên","vượt dải trên","phá dải dưới","cắt lên dải giữa","cắt xuống dải giữa"],"label":"Hành động giá với Bollinger"},"period":{"int":[2,200],"label":"Chu kỳ Bollinger"},"mult":{"num":[1,3.5],"step":0.1,"label":"Hệ số độ lệch chuẩn"}},"buy":{"action":"quay vào dải từ dưới","period":20,"mult":2},"sell":{"action":"quay vào dải từ trên","period":20,"mult":2}}
{"id":"bb.price_dir","n":2,"sentence":"Giá đóng cửa {dir} so với phiên trước","on":true,"fields":{"dir":{"sel":["tăng","giảm"],"label":"Biến động giá"}},"buy":{"dir":"tăng"},"sell":{"dir":"giảm"}}
{"id":"bb.width","n":3,"sentence":"Độ rộng Bollinger {period} hệ số {mult} {dir}","on":true,"fields":{"period":{"int":[2,200],"label":"Chu kỳ Bollinger"},"mult":{"num":[1,3.5],"step":0.1,"label":"Hệ số độ lệch chuẩn"},"dir":{"sel":["mở rộng","thu hẹp"],"label":"Biến động độ rộng dải"}},"buy":{"period":20,"mult":2,"dir":"thu hẹp"},"sell":{"period":20,"mult":2,"dir":"mở rộng"}}
// donchian  specOrder=12 htmlOrder=8 name="Donchian Channel" group="Kênh giá"
{"id":"donchian.break","n":1,"sentence":"Giá đóng cửa {op} dải {band} Donchian {period}","on":true,"fields":{"op":{"sel":[">","<"],"label":"Dấu so sánh"},"band":{"sel":["trên","dưới"],"label":"Dải Donchian"},"period":{"int":[2,252],"label":"Chu kỳ Donchian"}},"buy":{"op":">","band":"trên","period":20},"sell":{"op":"<","band":"dưới","period":20}}
// dmi  specOrder=13 htmlOrder=7 name="DMI + ADX" group="Xu hướng"
{"id":"dmi.di","n":1,"sentence":"DMI {period} : +DI {op} −DI","on":true,"fields":{"period":{"int":[2,200],"label":"Chu kỳ DMI"},"op":{"sel":["cắt lên","cắt xuống",">","<"],"label":"Quan hệ +DI với −DI"}},"buy":{"op":"cắt lên","period":14},"sell":{"op":"cắt xuống","period":14}}
{"id":"dmi.adx","n":2,"sentence":"ADX {period} {op} {threshold}","on":false,"fields":{"period":{"int":[2,200],"label":"Chu kỳ ADX"},"op":{"sel":[">","<"],"label":"Dấu ADX"},"threshold":{"num":[0,100],"step":0.1,"label":"Ngưỡng ADX"}},"buy":{"period":14,"op":">","threshold":25},"sell":{"period":14,"op":">","threshold":25}}
// obv  specOrder=14 htmlOrder=14 name="OBV" group="Khối lượng"
{"id":"obv.sma","n":1,"sentence":"OBV {op} SMA {period} của OBV","on":true,"fields":{"op":{"sel":["cắt lên","cắt xuống",">","<"],"label":"Quan hệ OBV"},"period":{"int":[2,200],"label":"Chu kỳ SMA của OBV"}},"buy":{"op":"cắt lên","period":20},"sell":{"op":"cắt xuống","period":20}}
{"id":"obv.breakout","n":2,"sentence":"OBV {action} {period} phiên","on":false,"fields":{"action":{"sel":["vượt đỉnh","phá đáy"],"label":"Hướng phá vỡ OBV"},"period":{"int":[2,252],"label":"Số phiên OBV"}},"buy":{"action":"vượt đỉnh","period":20},"sell":{"action":"phá đáy","period":20}}
// cmf  specOrder=15 htmlOrder=15 name="Chaikin Money Flow" group="Dòng tiền"
{"id":"cmf.cross","n":1,"sentence":"CMF {period} {op} {threshold}","on":true,"fields":{"period":{"int":[2,200],"label":"Chu kỳ CMF"},"op":{"sel":["cắt lên","cắt xuống"],"label":"Hướng giao cắt CMF"},"threshold":{"num":[-1,1],"step":0.01,"label":"Ngưỡng CMF"}},"buy":{"period":20,"op":"cắt lên","threshold":0},"sell":{"period":20,"op":"cắt xuống","threshold":0}}
```

### Default sentences as rendered (usable as golden strings)

Each cell is BUY / SELL. Rows with `on:false` are marked `[off]`. All other rows are on by default.

| Row | BUY / SELL |
|---|---|
| sma.price_cross | `Giá cắt lên SMA 20` / `Giá cắt xuống SMA 20` |
| sma.ma_cross [off] | `SMA 10 cắt lên SMA 20` / `SMA 10 cắt xuống SMA 20` |
| sma.trend [off] | `SMA 20 xu hướng lên` / `SMA 20 xu hướng xuống` |
| ema.price_cross | `Giá cắt lên EMA 20` / `Giá cắt xuống EMA 20` |
| ema.ma_cross [off] | `EMA 10 cắt lên EMA 20` / `EMA 10 cắt xuống EMA 20` |
| ema.trend [off] | `EMA 20 xu hướng lên` / `EMA 20 xu hướng xuống` |
| cross.ma_cross | `SMA 20 cắt lên SMA 50` / `SMA 20 cắt xuống SMA 50` |
| rsi.level | `RSI 14 < 30` / `RSI 14 > 70` |
| rsi.trend | `RSI 14 xu hướng lên` / `RSI 14 xu hướng xuống` |
| macd.signal | `MACD 12 / 26 cắt lên Signal 9` / `MACD 12 / 26 cắt xuống Signal 9` |
| macd.zero [off] | `MACD 12 / 26 > 0` / `MACD 12 / 26 < 0` |
| macd.hist [off] | `Histogram MACD 12 / 26 / 9 tăng so với phiên trước` / `... giảm so với phiên trước` |
| stoch.level | `%K 14 làm mượt 3 < 20` / `%K 14 làm mượt 3 > 80` |
| stoch.kd_cross | `%K 14 làm mượt 3 cắt lên %D 3` / `%K 14 làm mượt 3 cắt xuống %D 3` |
| cci.cross | `CCI 20 cắt lên -100` / `CCI 20 cắt xuống 100` |
| mfi.cross | `MFI 14 cắt lên 20` / `MFI 14 cắt xuống 80` |
| roc.cross | `ROC 20 cắt lên 5 %` / `ROC 20 cắt xuống -5 %` |
| willr.cross | `Williams %R 14 cắt lên -80` / `Williams %R 14 cắt xuống -20` |
| bb.price_action | `Giá đóng cửa quay vào dải từ dưới Bollinger 20 hệ số 2` / `Giá đóng cửa quay vào dải từ trên Bollinger 20 hệ số 2` |
| bb.price_dir | `Giá đóng cửa tăng so với phiên trước` / `Giá đóng cửa giảm so với phiên trước` |
| bb.width | `Độ rộng Bollinger 20 hệ số 2 thu hẹp` / `Độ rộng Bollinger 20 hệ số 2 mở rộng` |
| donchian.break | `Giá đóng cửa > dải trên Donchian 20` / `Giá đóng cửa < dải dưới Donchian 20` |
| dmi.di | `DMI 14 : +DI cắt lên −DI` / `DMI 14 : +DI cắt xuống −DI` |
| dmi.adx [off] | `ADX 14 > 25` / `ADX 14 > 25` |
| obv.sma | `OBV cắt lên SMA 20 của OBV` / `OBV cắt xuống SMA 20 của OBV` |
| obv.breakout [off] | `OBV vượt đỉnh 20 phiên` / `OBV phá đáy 20 phiên` |
| cmf.cross | `CMF 20 cắt lên 0` / `CMF 20 cắt xuống 0` |

The `[off]` rows are:
- sma rows 2 and 3
- ema rows 2 and 3
- macd rows 2 and 3
- dmi row 2
- obv row 2

All other rows default on. That is 27 rows per tab, 19 of them on.

---

## C. Validation messages and rules (lines 166-181, 201)

`validateSides(rec, id)` runs when Save is clicked, for the selected indicator only. It checks buy first, then sell. Within each side it goes row by row. Within each row it checks every non-text part in sentence order, then the `pairs` check. It returns the FIRST error only. The error goes to `#error` (role=alert), placed under the rule list. A toast says "Vui lòng kiểm tra lại thông số." Nothing is auto-corrected.

Templates, where `nm` is `Mua` or `Bán`, `i` is the 1-based row number and `a` is the field label:
```
preset select (SMA / MA Cross):  `${nm} · dòng ${i}: ${a} chỉ chọn 5, 10, 20, 50, 100, 200.`
number (isNum fails):            `${nm} · dòng ${i}: ${a} phải từ ${min} đến ${max}${step===1?', số nguyên':''}.`
fast >= slow (`pairs`):          `${nm} · dòng ${i}: chu kỳ nhanh phải nhỏ hơn chu kỳ chậm.`
```
- The separator is U+00B7 MIDDLE DOT.
- `isNum(v,min,max,step)` fails when `v===''`, `v==null`, the value is not finite, or it is out of range. It also fails when `step===1` and the number is not an integer.
- Select (non-preset) fields are NOT validated at all (line 173: `p.t!=null || p.sel&&!p.preset` is skipped).

Distinct message bodies generated for every field:

| Field label | Message body |
|---|---|
| Chu kỳ SMA | `chỉ chọn 5, 10, 20, 50, 100, 200.` (also for "Chu kỳ SMA nhanh" and "Chu kỳ SMA chậm") |
| Chu kỳ EMA / Chu kỳ EMA nhanh / Chu kỳ EMA chậm | `phải từ 2 đến 200, số nguyên.` (the EMA fast/slow labels are also used for MACD) |
| Chu kỳ RSI | `phải từ 2 đến 200, số nguyên.` |
| Ngưỡng RSI | `phải từ 0 đến 100, số nguyên.` |
| Chu kỳ Signal | `phải từ 2 đến 200, số nguyên.` |
| Chu kỳ %K | `phải từ 2 đến 200, số nguyên.` |
| Làm mượt %K | `phải từ 1 đến 10, số nguyên.` |
| Ngưỡng Stochastic | `phải từ 0 đến 100, số nguyên.` |
| Chu kỳ %D | `phải từ 1 đến 20, số nguyên.` |
| Chu kỳ CCI | `phải từ 2 đến 200, số nguyên.` |
| Ngưỡng CCI | `phải từ -300 đến 300, số nguyên.` |
| Chu kỳ MFI | `phải từ 2 đến 200, số nguyên.` |
| Ngưỡng MFI | `phải từ 0 đến 100, số nguyên.` |
| Chu kỳ ROC | `phải từ 2 đến 252, số nguyên.` |
| Ngưỡng ROC (%) | `phải từ -100 đến 10000.` |
| Chu kỳ Williams %R | `phải từ 2 đến 200, số nguyên.` |
| Ngưỡng Williams %R | `phải từ -100 đến 0, số nguyên.` |
| Chu kỳ Bollinger | `phải từ 2 đến 200, số nguyên.` |
| Hệ số độ lệch chuẩn | `phải từ 1 đến 3.5.` (dot decimal) |
| Chu kỳ Donchian | `phải từ 2 đến 252, số nguyên.` |
| Chu kỳ DMI | `phải từ 2 đến 200, số nguyên.` |
| Chu kỳ ADX | `phải từ 2 đến 200, số nguyên.` |
| Ngưỡng ADX | `phải từ 0 đến 100.` |
| Chu kỳ SMA của OBV | `phải từ 2 đến 200, số nguyên.` |
| Số phiên OBV | `phải từ 2 đến 252, số nguyên.` |
| Chu kỳ CMF | `phải từ 2 đến 200, số nguyên.` |
| Ngưỡng CMF | `phải từ -1 đến 1.` |

The spec's example `Mua · dòng 2: Chu kỳ RSI phải từ 2 đến 200, số nguyên.` is reproduced exactly by `rsi.trend`.

`fast_lt_slow` rows are `sma.ma_cross`, `ema.ma_cross`, `cross.ma_cross`, `macd.signal`, `macd.zero` and `macd.hist`. This matches spec §4.

---

## D. Discrepancies and gaps: HTML vs spec

Row-level content matches. Differences are below. Where the spec is silent, the HTML decides, since the spec says HTML wins.

1. **Referenced file name.** Spec lines 6 and 451 name `IQX_CHI_BAO_MAU_v2.html`. The file on disk is `IQX_CHI_BAO_MAU.html` (`grep -n "MAU_v2" IQX_CHI_BAO_SPEC.md` returns 6 and 451). The HTML labels itself v2 in its comment (line 2), its localStorage key `iqx_bot_indicator_panels_v2` (line 120) and its export `version:'2.0'` (line 206). That is the sample's own version, not the spec's V3. There is no content conflict.

2. **Indicator order.** The HTML sidebar order differs from spec §3 order (see section A). Use spec order for the registry and §7.1 row counts. The HTML order is only the demo sidebar order.

3. **SMA, EMA and MA Cross direction selects store `cắt lên` / `cắt xuống`, displayed as `lên` / `xuống`.** This applies to `sma.price_cross`, `sma.ma_cross`, `ema.price_cross`, `ema.ma_cross` and `cross.ma_cross`.
   - Spec §3 shows `[lên/xuống]` and defaults "lên", with no stored value stated.
   - Spec §1.4 only shows the trend `dir:"lên"`.
   - Trend rows (`dir`) store `lên` / `xuống` directly.
   - Every other cross op stores and displays `cắt lên` / `cắt xuống`.

4. **Integer-ness not stated in the spec for three thresholds.**
   - The spec states "số nguyên" only for RSI and CCI thresholds.
   - It gives only a range for MFI (0–100), Stochastic (0–100) and Williams %R (−100–0).
   - The HTML uses step 1 for all three, so non-integers are rejected with ", số nguyên" in the message.
   - Stochastic smoothing m (1–10) and D (1–20) are also integers, implied by "chu kỳ".

5. **Step multiples are not enforced.** `isNum` only enforces integers when `step===1`. For step 0.1 or 0.01, any number in range passes, for example Bollinger k 2.35, ROC 5.05, ADX 25.55 or CMF 0.005. The spec says "Ô số: ghi min–max và bước" but §4 does not say to reject non-multiples. The registry or server must decide; mirroring the HTML means not enforcing.

6. **Message wording details the spec elides.**
   - The preset message in the spec is `… chỉ chọn 5, 10, 20, 50, 100, 200.` The HTML prefix is `${nm} · dòng ${i}: ${label}`, with the field label from the table in section C.
   - Decimals use a dot, so "3.5" in the message where the spec's prose has "3,5".
   - The ", số nguyên" suffix appears only for step-1 fields.

7. **Scope of validation.** The HTML validates every row, including disabled rows, and both tabs even when the side master switch is off. It does not look at `enabled` anywhere. It returns the first error only. Spec §4 is silent on disabled rows and on single versus multiple errors.

8. **Enum values are not validated, and old-format rejection is structural only.**
   - `shapeOk` (line 122) checks that the row count equals the definition's row count and that every non-text key exists in the row (`p.k in r`).
   - It does not check that `op`, `dir`, `action` or `band` values belong to the option list, or that numbers are in range.
   - An old-style row such as CCI `{op:'>'}` with the same keys would pass.
   - Spec §6.1.5 and §7.4.11 require rejecting old formats, so the shared registry and server should check enum membership. The HTML does not.

9. **No stable row codes in the HTML.** Spec §1.4 requires them (for example `rsi.level`, `rsi.trend`). The HTML addresses rows by array index (`rules.${i}.${key}`). The ids in section B are proposed, not given. Field keys are the de-facto storage names: `op`, `dir`, `action`, `band`, `period`, `fast`, `slow`, `signal`, `k`, `smooth`, `d`, `threshold`, `mult`, plus `enabled`.

10. **Defaults the spec does not state.**
    - `defaults()` sets side `enabled:true` for both buy and sell.
    - It sets indicator `active` true only for `rsi` and `sma` (line 119). This is demo behaviour, and spec §6.1.3 and §1.3 say to preserve existing `active`.
    - "Đặt lại" (line 203) restores defaults but keeps the current `active`.
    - The sidebar toggle (line 188) writes `active` to both `draft` and `saved` and persists immediately. It does not go through Lưu and is not validated.

11. **No evaluation logic in the HTML.** Grep for `signal|evaluate|compute|calc` hits only CSS and `signal` field names. §2, the Bollinger action definitions, the Donchian and OBV "exclude bar T" rules, `NO_SIGNAL` and the "keep existing Stochastic type (Full/Slow)" note exist only in the spec.

12. **Minor text and display.**
    - In `dmi.di` the colon is a separate token, so it renders `DMI 14 : +DI cắt lên −DI`, with a space before the colon. The spec writes `DMI [N]: +DI`.
    - The minus in `−DI` is U+2212.
    - Spec's "+100" and "+5%" are notation only. The HTML stores and shows `100` and `5 %`, with `%` as a separate trailing token after the ROC input.
    - Bollinger action option labels are lowercase in the HTML, while the spec table capitalises the first letter. The lowercase strings are the stored values.
    - All strings are NFC.
    - The CCI and ROC threshold inputs get class `wide` (88px instead of 79px). This is cosmetic.

13. **Extra UI strings in the HTML, with no spec counterpart.**
    - Rule-count line (line 146): `${n}/${total} điều kiện được bật` plus, when `total>1`, ` · Các điều kiện đang bật phải đồng thời thỏa mãn`. This is the AND hint, consistent with spec §1.3.
    - `Sử dụng điều kiện Mua` / `Sử dụng điều kiện Bán`.
    - Tabs `Điều kiện Mua` / `Điều kiện Bán`.
    - Status `Chỉ báo đang bật cho Bot.` / `Chỉ báo đang tắt: lưu tham số không tự bật chỉ báo.`
    - Buttons `Đặt lại`, `Hủy`, `Lưu`; dirty text `Chưa lưu thay đổi` / `Đã lưu`.
    - Disabled rows get class `off`, with sentence opacity .58, which matches spec §1.1. No input is disabled when a row or side is off.

## E. Cross-check summary

- Verified identical between HTML and spec §3, row by row:
  - the sentences and the order of inputs
  - the op/option sets
  - number ranges and steps: periods 2–200 by default; ROC, Donchian and OBV row 2 use 2–252; Stochastic m 1–10 and D 1–20; ROC threshold −100–10000 step 0.1; CCI ±300; CMF ±1 step 0.01; Bollinger k 1–3.5 step 0.1; ADX 0–100 step 0.1
  - buy and sell defaults
  - the enabled flags
  - the `fast < slow` rows
  - the 6 Bollinger actions and their order
  - the 27 rows and the per-indicator counts
- Items present in the spec but not the HTML are listed in item 11.
- Items present in the HTML but not the spec are items 5, 6, 7, 8, 10 and 13.
