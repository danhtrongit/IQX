# IQX Journey Identity — ImageGen assets

Ngày chốt: 15/09/2026.

## Phạm vi và nguồn

Bộ runtime gồm **12 ảnh độc lập**: bảy trạng thái Trứng Cấp 0–6 và năm Linh thú. Tất cả artwork được tạo hoặc chỉnh bằng **built-in ImageGen**. Không có bước tách nền bằng Python, script xử lý pixel hay dịch vụ ngoài. Các bản PNG được ImageGen trả về với kênh alpha thật; bước đóng gói runtime chỉ đổi kích thước/định dạng bằng codec ảnh thông thường và không tạo thêm nội dung.

Hai ảnh bàn giao chỉ được dùng làm mẫu về silhouette, chất liệu, màu và tính cách:

| Mẫu | Kích thước | SHA-256 |
| --- | ---: | --- |
| `/Users/danhtrongit/Downloads/bot-pokemon/magical_egg_evolution_progression_grid.png` | 1448×1086 RGB | `b5bf9e485183087354c75c616100999c366d4d1b9e57db7765011b733badd1a7` |
| `/Users/danhtrongit/Downloads/bot-pokemon/IQX-5-Linh-Thu-Approved-Reference.png` | 1536×1024 RGBA | `2f3663ac00c581f3201640200ab324d8e8b1bc440fd39f708524548aa146b306` |

ImageGen tạo artwork mới; các hash mẫu chỉ cố định tài liệu đối chiếu, không hàm ý ảnh đầu ra trùng pixel với mẫu.

### Provenance master RGBA được chấp nhận

Các `exec-*` dưới đây là file output nguyên bản từ built-in ImageGen trước bước chuẩn hóa codec. “Extraction” trong phần prompt cũng là một lần gọi built-in ImageGen.

| Asset | ImageGen output | Kích thước raw | SHA-256 raw |
| --- | --- | ---: | --- |
| Trứng C0 | `exec-39ee4585-e3bf-42fb-b1dc-f25edc8d7614.png` | 1254×1254 | `22ffeb669bee930867e3759449d83f6e464874a073aebcb157c8a6a911b86d09` |
| Trứng C1 | `exec-da64a98f-f1c7-47c3-a13e-8635989b80a5.png` | 1254×1254 | `cee4a0d81a68b0dbb5eaf7cf03ec1f01a99c3abaa2501ea1ec452c22770befa6` |
| Trứng C2 | `exec-e56140d8-d104-4b2c-97c4-0dfd47f5ec7b.png` | 1254×1254 | `a58b48f747c5df3726404a99f9baf01d3bfd41964b3cc78e00544ad969753f45` |
| Trứng C3 | `exec-b86e323a-5f17-4aa0-8eea-974913bd70cc.png` | 1254×1254 | `d523bd81737c5bb5912a8e7c4c054a9d5fabf66448e6b0e22d868d251fd015eb` |
| Trứng C4 | `exec-b0128e36-9cbf-400f-a195-c98ab0e667dd.png` | 1254×1254 | `8cc6c6e3716bbe245c2e6bbfa8044d6b3d533ab504370832262c501e7bb6f7a9` |
| Trứng C5 | `exec-3aacb311-9853-4127-8238-0c76af0585e2.png` | 1254×1254 | `784c7cb061862fecab3fad0ea134171805a3528ee7558bd4f367a1e632aebb80` |
| Trứng C6 | `exec-d34f03d7-718f-4cc5-afff-84a66c6a0b0d.png` | 1254×1254 | `8098e643121c570083cd1bc86a77abb3e598676c0158560ca73249384fb45e94` |
| Bạch Hổ | `exec-03b2b77a-aa07-4534-a98e-0660ce47efe3.png` | 1254×1254 | `f0e8fc2a28d5d1c427a92290419a41b1ef88ba2cdb16ce87e91256729838be19` |
| Thanh Long | `exec-445f2a19-1534-4ec4-a1e7-553cde993c19.png` | 1254×1254 | `516dafb957dc22c0c623cf2d9359117a0dc2a04b52be205d1b3e73061c7987f5` |
| Lộc Hươu | `exec-d26b4c43-9652-4547-ab4f-7205427aaaa7.png` | 1169×1346 | `f5d553d3d497b4bd74c4fa9274854e1f915541039e981dbc5d4df671fa2079f3` |
| Phụng Hoàng | `exec-4c00e9b6-4897-41fb-a071-17dfe7a44975.png` | 1254×1254 | `68ef298f7b383d425150384329f8df647483b5554f023409b2ca474b5ed43a28` |
| Kim Quy | `exec-a0e257f0-f62a-4d32-877c-d6c60655a3f9.png` | 1182×1331 | `383a67ac42069c5bbf89d95a1d7268a2957df2e3586fec981bc72fb1c657b92c` |

<details>
<summary>Đường dẫn đầy đủ của 12 master ImageGen nguyên bản</summary>

```text
/Users/danhtrongit/.codex/generated_images/01a0a4c3-ac1c-74d0-bea1-f138865e2cf5/exec-39ee4585-e3bf-42fb-b1dc-f25edc8d7614.png
/Users/danhtrongit/.codex/generated_images/01a0a4c3-ac1c-74d0-bea1-f138865e2cf5/exec-da64a98f-f1c7-47c3-a13e-8635989b80a5.png
/Users/danhtrongit/.codex/generated_images/01a0a4c3-ac1c-74d0-bea1-f138865e2cf5/exec-e56140d8-d104-4b2c-97c4-0dfd47f5ec7b.png
/Users/danhtrongit/.codex/generated_images/01a0a4c3-ac1c-74d0-bea1-f138865e2cf5/exec-b86e323a-5f17-4aa0-8eea-974913bd70cc.png
/Users/danhtrongit/.codex/generated_images/01a0a4c3-b962-7613-861f-e77a30fcfe45/exec-b0128e36-9cbf-400f-a195-c98ab0e667dd.png
/Users/danhtrongit/.codex/generated_images/01a0a4dd-d640-7e31-b6fd-3e1601a65302/exec-3aacb311-9853-4127-8238-0c76af0585e2.png
/Users/danhtrongit/.codex/generated_images/01a0a4c3-b962-7613-861f-e77a30fcfe45/exec-d34f03d7-718f-4cc5-afff-84a66c6a0b0d.png
/Users/danhtrongit/.codex/generated_images/01a0a4eb-7606-7970-b858-a46ca6b4dc12/exec-03b2b77a-aa07-4534-a98e-0660ce47efe3.png
/Users/danhtrongit/.codex/generated_images/01a0a4eb-c485-7e90-a555-caf18908b0c2/exec-445f2a19-1534-4ec4-a1e7-553cde993c19.png
/Users/danhtrongit/.codex/generated_images/01a0a4eb-9aeb-7db1-914b-1738697ca3ff/exec-d26b4c43-9652-4547-ab4f-7205427aaaa7.png
/Users/danhtrongit/.codex/generated_images/01a0a4eb-f1cc-7442-bae1-1eda17e0f49f/exec-4c00e9b6-4897-41fb-a071-17dfe7a44975.png
/Users/danhtrongit/.codex/generated_images/01a0a4ec-18d1-78d2-bf6f-e929bd77b633/exec-a0e257f0-f62a-4d32-877c-d6c60655a3f9.png
```

</details>

## Manifest runtime

Mỗi stem dưới đây có ba đường dẫn runtime: `.avif` → `.webp` → `.png`. Component thử lần lượt theo thứ tự này. Nếu cả ba định dạng Trứng hiện tại hoặc Trứng trước đều lỗi, runtime dùng SVG egg fallback. Nếu cả ba định dạng Linh thú lỗi hoặc backend chưa trả `mascot_id`, runtime dùng silhouette IQX trung tính; không thay một loài khác hoặc dùng species SVG giả.

| Asset | Stem trong `public/journey-identity/generated/` | Ý nghĩa hình tĩnh |
| --- | --- | --- |
| Trứng C0 | `egg-level-0` | Vỏ kín, lõi vừa, trạng thái khởi đầu |
| Trứng C1 | `egg-level-1` | Ba điểm hội tụ quanh lõi |
| Trứng C2 | `egg-level-2` | Năm node mint-teal quanh lõi |
| Trứng C3 | `egg-level-3` | Lõi xanh royal tập trung, vỏ kín |
| Trứng C4 | `egg-level-4` | Hai luồng giao nhau và vết nứt tóc đầu tiên |
| Trứng C5 | `egg-level-5` | Một quỹ đạo vàng phân đoạn, vết nứt ổn định |
| Trứng C6 | `egg-level-6` | Lõi teal trắng sáng nhất, nứt teal, đúng hai wisp; vỏ vẫn kín |
| Bạch Hổ | `mascot-bach-ho` | Hổ trắng, tai/đuôi crystal xanh, vẫy tay |
| Thanh Long | `mascot-thanh-long` | Rồng Á Đông trắng-xanh, sừng nhánh, đuôi vảy và orb phân tích |
| Lộc Hươu | `mascot-loc-huou` | Hươu kem, gạc vàng, đuôi vàng nhỏ |
| Phụng Hoàng | `mascot-phung-hoang` | Chim phượng kem-cam, hai cánh, hai chân chim |
| Kim Quy | `mascot-kim-quy` | Rùa cạn mint-lục, mai phân đốt và đúng hai lá |

### Artifact audit cuối

Tất cả 36 file dưới đây có canvas 1024×1024 và `hasAlpha: yes`. Dung lượng là byte thực tế; digest trong bảng là 12 ký tự đầu của SHA-256 đầy đủ ở khối kế tiếp.

| Stem | PNG | AVIF | WebP |
| --- | ---: | ---: | ---: |
| `egg-level-0` | 835464 B; `31cc181ad251…` | 61142 B; `1aeb805f5cea…` | 69692 B; `b443081873a7…` |
| `egg-level-1` | 840020 B; `9dfd5c06855d…` | 62504 B; `27b7bb9e6feb…` | 72394 B; `2f920a994707…` |
| `egg-level-2` | 1051929 B; `0fb0601b2230…` | 78066 B; `21cc8ba13928…` | 86848 B; `03d1aec2a621…` |
| `egg-level-3` | 828902 B; `a76117b10232…` | 61353 B; `a47801f9396b…` | 70976 B; `32b407dc6384…` |
| `egg-level-4` | 1154192 B; `cdff4634a3cf…` | 98028 B; `9a01df690e2e…` | 144328 B; `e0ebba790c60…` |
| `egg-level-5` | 1020104 B; `ec48d3cf71c6…` | 85061 B; `d99ae1138f3d…` | 114638 B; `be584ccb6fa7…` |
| `egg-level-6` | 1106890 B; `dba396686316…` | 87138 B; `07a28a94130d…` | 122852 B; `52ea6808d214…` |
| `mascot-bach-ho` | 1200568 B; `849a714aa19f…` | 99402 B; `376db7f0fac7…` | 130216 B; `f4cdc4714498…` |
| `mascot-thanh-long` | 814723 B; `b3621cd30a39…` | 90100 B; `cd6c128aa60b…` | 117650 B; `86bc98680831…` |
| `mascot-loc-huou` | 1050790 B; `670c247f9d4b…` | 87075 B; `966f2e1b36c7…` | 111808 B; `3db0b7a77e7a…` |
| `mascot-phung-hoang` | 1051044 B; `9003bc5e08a7…` | 100981 B; `d0644dbb3c5e…` | 129290 B; `9a4d6cf57732…` |
| `mascot-kim-quy` | 746047 B; `7d7fdbacf678…` | 52919 B; `69f210be6c99…` | 63342 B; `1b85fafeb957…` |

<details>
<summary>SHA-256 đầy đủ của 36 file runtime</summary>

```text
1aeb805f5ceacc9570fd8f96d17999a4ef8ce60381c4dba0b28cc62b9162aa5f  egg-level-0.avif
31cc181ad2519d60857b150aad395a7ffefbe9b535b294156eaba4679506f5cd  egg-level-0.png
b443081873a7bddfc34debe5a0ae65965ddc892cc8c180ad81f91b508fe4f6b5  egg-level-0.webp
27b7bb9e6feb77ae94ad5341cd5efb97f1291add4b6c91f656bc41042ebed929  egg-level-1.avif
9dfd5c06855db050532e6abd07881aa04632eccbe84668d27c2f9724acf0db14  egg-level-1.png
2f920a9947076fcee58635a00d8373956dc4145f869b3b8a4549d396861481c9  egg-level-1.webp
21cc8ba139284f9d8ae9c286c4909fb39ae068103a946d325a949e89297b996a  egg-level-2.avif
0fb0601b2230ca8e9991296f042f9bcb516be30c8d58b269fb46bab7ef2bbf37  egg-level-2.png
03d1aec2a621304741fb4389a1740714969ecb62f0dd8578cb5c8ac80cbec04d  egg-level-2.webp
a47801f9396bbabf797a984665edb6189cefc180155a976db82d6bfda9340e55  egg-level-3.avif
a76117b10232987da0356dfa1681b65f8405f37b9714907a78c20f7d8d43c300  egg-level-3.png
32b407dc63843bb5442874f7f2a61cf9c33a3586792763e94b36378f043e6c1a  egg-level-3.webp
9a01df690e2e8098134f08094b760db259233bd2b9f45caf4383284f3f76278c  egg-level-4.avif
cdff4634a3cfe4d957721569d9d6e026aedf4fd848227689fbe7f90ea6c83388  egg-level-4.png
e0ebba790c60f8516ef5618c6e2a0e4b7d379f047798592292999902931bd398  egg-level-4.webp
d99ae1138f3d746f6c321e68314988b9f02fa7ec136deb02001236b66ad8c588  egg-level-5.avif
ec48d3cf71c6620f467b832639ce2c3b5b0f607a4e5389303e7d936b841d8cf8  egg-level-5.png
be584ccb6fa7540f76eb22047b292076189fd519f2e7dd76a8ed57f702449b46  egg-level-5.webp
07a28a94130d80c1cd20d814f3920613adda697c66f4d217e9dc61d420d175af  egg-level-6.avif
dba396686316aa3147b406603eb305c59c60ea98773405cb0c5eb1f621ec66a8  egg-level-6.png
52ea6808d21424b36de99db322f146c5160ffa9e72fd8a19e28ca95dcfbfa707  egg-level-6.webp
376db7f0fac714bcd299338bf1c45c9e9ce721723a6839de9cd38c93593e2cfc  mascot-bach-ho.avif
849a714aa19fa950f92576481c16edc746d9652e5a2d1f7a38f9c18f1473fb61  mascot-bach-ho.png
f4cdc4714498e59dbe4431df645f21adfb86199a1ecbcb76b92ab6d672e9dca6  mascot-bach-ho.webp
69f210be6c99b756f3e11bb7e490cbf89cb15e2e9e8342b324d16915d0564dd9  mascot-kim-quy.avif
7d7fdbacf67817c37ef74bae8fe203e2114b72b10f67f0a712d37c33b7b7571f  mascot-kim-quy.png
1b85fafeb957c485a0def6e8102b5578a89aa9dc765e0aeec0df9976fb3034c9  mascot-kim-quy.webp
966f2e1b36c723ed655e83794b2775bf4ec5ea8c973f1291301959f41b2beb3e  mascot-loc-huou.avif
670c247f9d4b3f5b9137d191a65eb341ae6ab6ca4ddbfb3e4b6602b02e7b8d4c  mascot-loc-huou.png
3db0b7a77e7a9dd89b6dd803df675fc23a439c630cfba1601ff13e74f03abf98  mascot-loc-huou.webp
d0644dbb3c5e1229f202df65a472a53e024806dc9e45f8907e5bce8056adcbc8  mascot-phung-hoang.avif
9003bc5e08a79d479d77cada680705483e3ce8b47956f1df610fa2b17d4ecea3  mascot-phung-hoang.png
9a4d6cf5773209551a16a3bb4d564c2dc88981d1ec4a2c656d803ea075a8b8b2  mascot-phung-hoang.webp
cd6c128aa60b0ea21c28cf6b3b1adb38266c9a818c028ea9b56c559e16cae1fb  mascot-thanh-long.avif
b3621cd30a3943b581dbb8396fc444e35e6a612598ac304da4c4e4d720f6304b  mascot-thanh-long.png
86bc9868083121fd0cac7aa421db0d3ce453961d2f743081e80d1e284fdba2ae  mascot-thanh-long.webp
```

</details>

### Tiêu chí đóng gói

- PNG là bản master/cứu hộ có RGBA thật.
- AVIF là lựa chọn đầu; WebP là fallback nén; PNG là fallback cuối.
- Mục tiêu cho mỗi Trứng: AVIF không quá **220 KB**, WebP không quá **350 KB**.
- Chỉ một Linh thú được tải cho assignment hiện tại; payload đầu tiên của Linh thú phải không quá **1,5 MB**, ưu tiên AVIF/WebP.
- Cả 12 PNG runtime được chuẩn hóa về canvas vuông 1024×1024. Bản ImageGen RGBA gốc được giữ theo provenance trong cache/staging; thay đổi kích thước không tách nền hay vẽ lại.
- Nghiệm thu alpha kiểm tra định dạng RGBA, dải alpha và pixel ở bốn góc. ImageGen trả alpha `1/255` ở góc trái dưới của C6, Bạch Hổ và Phụng Hoàng; đây là gần như trong suốt ở chính output sinh ảnh, không phải checkerboard giả. Các ảnh còn lại có bốn góc alpha `0` tại bản sinh được chấp nhận.

Hash runtime ở trên khác hash bản ImageGen raw khi ảnh đã resize/encode; dùng đúng nhóm hash cho từng mục đích kiểm tra.

## Cách hình tĩnh tham gia animation

Mỗi PNG/AVIF/WebP là **một poster một lớp**. Runtime đặt poster trong SVG và bổ sung các lớp SVG/CSS có tên semantic cho hiệu ứng chưa có trong poster C0–C3 cùng cue trạng thái. C4–C6 đã chứa đúng hai luồng, một quỹ đạo phân đoạn hoặc hai wisp trong artwork được duyệt, nên runtime không vẽ chồng thêm các hình đó. Trứng có thể trôi nhẹ cùng hiệu ứng theo cấp. Poster Linh thú được giữ nguyên pose, không float, rotate, scale hoặc giả chuyển động khớp. Các trạng thái `greet`, `analyzing`, `updated` và `tap_reaction` chỉ dùng light, foot-ring, hologram/trail/spark và crossfade do code render; ưu tiên trạng thái vẫn do coordinator quyết định.

Fallback hatch kéo dài 1200 ms ở motion thường: 700 ms lõi sáng, 150 ms flash, rồi 350 ms crossfade sang poster; reduced motion dùng crossfade 350 ms. Coordinator chỉ bắt đầu khi cả asset Trứng và Linh thú cần cho transition đã sẵn sàng, kể cả nhánh fallback.

Hiện chưa có Spine, Live2D hay part rig tách đầu/mắt/tay/cánh/đuôi từ asset ImageGen. Runtime không biến đổi từng bộ phận và cũng không dùng SVG species để tạo cảm giác đã có rig. `prefers-reduced-motion`, pause khi bị che/tab ẩn và non-interactive egg vẫn được áp dụng ở lớp runtime.

## Prompt đã chấp nhận — Trứng

### C0 — tạo hình

```text
Use case: stylized-concept
Asset type: production transparent raster artwork for an IQX web journey egg, square canvas
Input image: Image 1 is the approved visual reference. Use specifically the “Cấp 0” egg only as the design reference for silhouette, camera angle, pearl/amethyst shell, gold filigree bands, central diamond core, and premium 2.5D finish. Do not reproduce the reference poster layout.
Primary request: create the Level 0 base egg as one isolated intact egg.
Subject: one elegant closed egg, front view with a very slight three-quarter angle; tall oval silhouette; white-silver pearlescent shell with restrained translucent lavender/amethyst depth; warm polished gold bands wrapping the shell; centered purple diamond core with moderate glow.
Composition/framing: 1024×1024 square intent; egg centered at the exact canvas center, consistent production scale and anchor for a seven-level set; entire egg visible; at least 12% transparent padding on every side; bottom anchor centered.
Lighting/mood: soft top-front studio light, subtle cool violet rim light, luxurious calm financial-product feel.
Level-specific state: Level 0, shell completely intact, no cracks, moderate core brightness, simplest and least energized state.
Transparency: genuinely transparent RGBA background with clean antialiased edges.
Constraints: preserve the approved egg silhouette and material language; egg artwork only.
Avoid: any background, dark rectangle, checkerboard, floor, pedestal, ground halo, orbit ring, node, radar, blip, particle, sparkle outside the shell, text, “Cấp 0”, logo, label, border, UI frame, watermark, creature, broken shell, cropped edge.
```

### C0 — alpha extraction

```text
Use case: background-extraction
Asset type: final transparent production cutout for IQX Journey Egg Level 0
Input image: Image 1 is the exact edit target.
Primary request: remove only the gray-and-white checkerboard background and replace it with genuine fully transparent alpha.
Constraints: preserve the egg exactly pixel-for-pixel in design, silhouette, size, position, crop, camera, gold bands, pearl/amethyst shell, central diamond, highlights and colors; preserve at least the existing clear padding; produce clean antialiased edges and preserve translucent shell edge detail.
Transparency: output a genuine RGBA PNG with alpha=0 outside the egg.
Avoid: drawing any checkerboard, white background, gray background, shadow, floor, halo, particles, text, logo, watermark; do not redesign, recolor, resize, recrop, rotate, soften, sharpen or add anything.
```

### C1 — tạo hình

```text
Use case: stylized-concept
Asset type: production transparent raster artwork for the IQX web journey egg, Level 1 of a consistent seven-level set
Input images: Image 1 is the approved progression reference; use specifically “Cấp 1” for level intent. Image 2 is the exact Level 0 production anchor; preserve its egg silhouette, camera, crop, canvas position, scale, gold band geometry, central diamond position, material finish, lighting direction, and bottom anchor.
Primary request: create the Level 1 evolved-core egg by changing only the energy detail around the central core while keeping the same intact egg.
Subject: the identical elegant closed pearl-white, translucent lavender/amethyst and warm-gold egg; central purple diamond core slightly more energized than Level 0; exactly three small luminous convergence points embedded immediately around or within the central core, arranged clearly and symmetrically, with subtle warm copper accent #c97b4a.
Composition/framing: 1024×1024 square intent; exact same center, size, silhouette and bottom anchor as Image 2; entire egg visible; at least 12% transparent padding.
Lighting/mood: premium soft 2.5D studio finish, calm and controlled.
Level-specific state: Level 1, shell completely intact, no cracks; core is the only focal evolution; exactly three small convergence points, no other level effect.
Transparency: genuinely transparent RGBA background with clean antialiased edges.
Constraints: preserve Image 2 exactly except the slightly evolved central core and three embedded luminous points; egg artwork only.
Avoid: any background, checkerboard pixels, floor, pedestal, shadow plate, ground halo, orbit ring, radar, tick marks, five-node ring, external particle, sparkle outside the shell, text, “Cấp 1”, logo, label, border, UI frame, watermark, creature, crack, broken shell, crop or scale drift.
```

### C1 — alpha extraction

```text
Use case: background-extraction
Asset type: final transparent production cutout for IQX Journey Egg Level 1
Input image: Image 1 is the exact edit target.
Primary request: remove only the gray-and-white checkerboard background and replace it with genuine fully transparent alpha.
Constraints: preserve the egg exactly in design, silhouette, size, position, crop, camera, gold bands, pearl/amethyst shell, central diamond, exactly three luminous convergence points and their thin triangular connection, highlights and colors; preserve the existing clear padding; produce clean antialiased edges and preserve translucent shell edge detail.
Transparency: output a genuine RGBA PNG with alpha=0 outside the egg.
Avoid: drawing any checkerboard, white background, gray background, shadow, floor, halo, extra particles, text, logo, watermark; do not redesign, recolor, resize, recrop, rotate, soften, sharpen, remove or add nodes, or add anything.
```

### C2 — tạo hình

```text
Use case: stylized-concept
Asset type: production transparent raster artwork for the IQX web journey egg, Level 2 of a consistent seven-level set
Input images: Image 1 is the approved progression reference; use specifically “Cấp 2” for level intent. Image 2 is the exact preceding production anchor; preserve its egg silhouette, camera, crop, canvas position, scale, gold band geometry, central diamond position, material finish, lighting direction, and bottom anchor.
Primary request: create the Level 2 node-ring egg by replacing the Level 1 three-point core motif with exactly five small luminous nodes embedded on the shell immediately around the central diamond.
Subject: the identical elegant closed pearl-white, translucent lavender/amethyst and warm-gold egg; central purple diamond remains clearly visible; exactly five small mint-teal node lights, accent #7dd3c0, balanced around the core as a subtle connected system. Keep connections extremely thin and confined to the shell surface.
Composition/framing: 1024×1024 square intent; exact same center, size, silhouette and bottom anchor as Image 2; entire egg visible; at least 12% transparent padding.
Lighting/mood: premium soft 2.5D studio finish, calm and controlled.
Level-specific state: Level 2, shell completely intact, no cracks; five-node structure is the only evolution; slightly brighter core than Level 1.
Transparency: genuinely transparent RGBA background with clean antialiased edges.
Constraints: preserve Image 2 exactly except replace the three-point motif with exactly five embedded mint-teal nodes and a slightly stronger core; egg artwork only.
Avoid: more or fewer than five nodes, any background, checkerboard pixels, floor, pedestal, ground halo, external orbit ring, radar, tick marks, blip, crossed energy trails, external particle, sparkle outside shell, text, “Cấp 2”, logo, label, border, UI frame, watermark, creature, crack, broken shell, crop or scale drift.
```

### C2 — alpha extraction

```text
Use case: background-extraction
Asset type: final transparent production cutout for IQX Journey Egg Level 2
Input image: Image 1 is the exact edit target.
Primary request: remove only the gray-and-white checkerboard background and replace it with genuine fully transparent alpha.
Constraints: preserve the egg exactly in design, silhouette, size, position, crop, camera, gold bands, pearl/amethyst shell, central diamond, exactly five mint-teal luminous nodes and their thin connections, highlights and colors; preserve the existing clear padding; produce clean antialiased edges and preserve translucent shell edge detail.
Transparency: output a genuine RGBA PNG with alpha=0 outside the egg.
Avoid: drawing any checkerboard, white background, gray background, shadow, floor, halo, extra particles, text, logo, watermark; do not redesign, recolor, resize, recrop, rotate, soften, sharpen, remove or add nodes, or add anything.
```

### C3 — tạo trực tiếp từ C0 RGBA

```text
Create the Level 3 variant of this exact game sprite. Preserve the egg shell, gold trim, camera, scale, placement, and closed intact silhouette. Change only the central gemstone to vivid royal blue with a small violet-white focused core. No cracks, no nodes, no external effects. Isolated single object on a fully transparent background, production PNG with native alpha.
```

Input chính xác: `dashboard/public/journey-identity/generated/egg-level-0.png` tại thời điểm sinh. Raw output: `exec-b86e323a-5f17-4aa0-8eea-974913bd70cc.png`, SHA-256 `d523bd81737c5bb5912a8e7c4c054a9d5fabf66448e6b0e22d868d251fd015eb`.

### C4 — tạo hình

```text
Use case: stylized-concept
Asset type: production transparent game/app asset for IQX journey egg, Level 4
Input images: Image 1 is the authoritative egg evolution reference; preserve the egg shell design, silhouette, three-quarter frontal camera, proportions, center diamond core, pearlescent silver-white shell and elegant gold bands. Use its Level 4 panel only for progression cues. Image 2 is supporting IQX approved 2.5D style reference for polish, soft premium materials and lighting.
Primary request: Create the standalone Level 4 “Thuần thục” evolution egg. One single closed egg. Add exactly two controlled energy streams crossing around the egg in opposite directions, one using the level purple accent and one subtle blue-gold secondary light. Add the first stable hairline crack on the shell, small and delicate; the shell remains completely closed and intact.
Composition/framing: centered full object, same camera, silhouette, size and foot/center anchor as the reference egg; generous transparent padding on all sides; square canvas.
Style/medium: premium polished 2.5D fantasy-finance product illustration, refined and calm, high fidelity.
Lighting/mood: controlled inner glow, restrained premium light, no warning mood.
Color palette: 70–80% pearl silver-white, elegant gold and IQX night-blue details; purple only as the level accent.
Constraints: genuinely transparent background with clean alpha; no ground, no platform, no baked backdrop; no text, numbers, labels, UI frame, logo wordmark, watermark, character, creature, fragments or open shell; no red alert light; do not change the approved egg design. Runtime overlays may animate later, but the still must clearly identify Level 4.
```

### C4 — loại fragment

```text
Use case: background-extraction / surgical production edit.
Input: the supplied Level 4 IQX egg asset.
Remove the entire gray checkerboard pattern and every loose floating crystal fragment around the egg. Output a genuine transparent-background PNG with real alpha, including clean semi-transparent alpha on all glow and energy edges. Preserve the egg itself pixel-faithfully: same closed shell, silhouette, camera, gold bands, central purple diamond, two crossing blue/purple/gold energy streams, first hairline crack, lighting, size, position and square canvas. Preserve small light particles that belong to the energy streams only. Do not add any new object, text, label, ground, platform, backdrop, shadow card, logo, creature, open shell or separated shell piece. The checkerboard must not appear in the RGB pixels; outside the asset must have alpha 0.
```

### C4 — alpha extraction cuối

```text
Use case: background-extraction
Asset type: final production transparent PNG for IQX journey egg Level 4
Primary request: Remove the entire gray-and-white checkerboard backdrop from the supplied image and replace it with genuine alpha transparency. Do NOT render, paint, simulate or preserve any checkerboard pattern. Transparency must be encoded in the PNG alpha channel: every pixel outside the egg, glow and specified energy effects must have alpha 0.
Constraints: change only the background. Preserve every visible subject pixel and detail, including the closed egg, two crossing energy streams and first hairline crack; preserve the exact square canvas, camera, scale and anchor. Output a genuine RGBA transparent PNG with clean anti-aliased edges and semi-transparent glow edges. No solid background, no checkerboard pixels, no text, no label, no ground, no platform, no new object, no logo, no watermark.
```

### C5 — tạo semantic candidate

```text
Use case: precise-object-edit
Asset type: transparent PNG game progression asset, Level 5 magical egg
Primary request: Starting from Image 1, preserve the egg itself and its real transparent alpha background. Replace the multicolor crossed orbit paths with exactly one balanced segmented warm-gold orbital ring. Reposition the crack so it is a small stable branching crack only on the upper-right white shell panel, like the supplied reference egg design, and remove the lower-left crack.
Input images: Image 1 is the RGBA edit target; preserve its transparency and main egg design.
Scene/backdrop: keep the existing genuine transparent RGBA background, with alpha 0 outside the object. Do not paint any backdrop or transparency preview pattern.
Subject: luminous pearl-and-lavender egg with gold filigree and centered violet diamond core.
Style/medium: polished luminous fantasy game UI asset, crisp transparent cutout.
Composition/framing: centered upright egg; exactly one elliptical orbit around the middle, made of evenly spaced short warm-gold segments and small round gold nodes; side portions behind the egg; lower foreground portion in front; no segment crosses through the egg body.
Constraints: preserve or produce true RGBA PNG transparency; fully transparent all four corners; exactly one segmented warm-gold orbit; no crossing paths; no duplicate rings; upper-right crack only; no extra objects; no text; no watermark.
Avoid: checkerboard pattern, black or white background, opaque canvas, blue/pink/purple orbit, intersecting streams, ribbons, tangled paths, lower-left crack, excessive bloom.
```

### C5 — alpha extraction đã chấp nhận

```text
Use case: background-extraction
Asset type: transparent PNG game UI cutout
Primary request: Remove only the gray-and-white checkerboard background from Image 1 and replace it with real alpha transparency. This is an extraction pass, not a redesign.
Input images: Image 1 is the exact edit target; keep the egg, upper-right crack, single segmented warm-gold orbit, gold nodes, and restrained glow unchanged.
Scene/backdrop: none; genuine transparent RGBA pixels outside the object.
Constraints: output true RGBA PNG; alpha channel present; all four corner pixels fully transparent with alpha 0; background must be absent rather than painted; preserve composition, color, scale, crack placement, orbit geometry, nodes, and glow; no additions; no text; no watermark.
Avoid: any checkerboard pattern, gray squares, white background, black background, opaque canvas, redesign, extra orbit, crossing streams.
```

Semantic candidate: `exec-928cbd08-ea3e-4ab7-b935-5911a168bd51.png`. Raw RGBA được chấp nhận: `exec-3aacb311-9853-4127-8238-0c76af0585e2.png`, SHA-256 `784c7cb061862fecab3fad0ea134171805a3528ee7558bd4f367a1e632aebb80`.

### C6 — tạo hình

```text
Use case: stylized-concept
Asset type: isolated transparent PNG game/UI progression asset, Level 6 magical egg
Primary request: Create one ornate upright closed magical egg in a premium luminous fantasy game-asset style. It has a smooth pearl-ivory and pale-lavender shell, elegant flowing polished-gold filigree bands, and a centered gold-framed diamond window. Inside the diamond, make the core an extremely bright saturated teal/cyan crystal with a white-hot starburst center, the brightest focal point. Add sparse, controlled thin teal energy cracks across a few shell panels.
Energy effects: EXACTLY TWO thin graceful teal/cyan energy wisps total, one short open wisp curling outward on the left and one short open wisp curling outward on the right. They remain separate and fade into transparency. Neither passes behind the egg; neither wraps around it; neither connects; no ring, no orbit, no loop. No other detached trails, wisps, ribbons, halos, or particles.
Shell state: completely closed and intact; no split halves, no opening, no hatchling, no missing pieces.
Scene/backdrop: genuine transparent background with real alpha channel. All empty canvas outside the egg and its two wisps must be alpha 0, including all four corners. Never depict a checkerboard or any matte/background color.
Composition: centered single egg, front three-quarter product-icon view, entire silhouette visible, generous empty transparent padding, square canvas.
Palette: pearl ivory, soft lavender and ice-blue shell; warm polished gold; dominant electric teal/cyan core, cracks, and wisps.
Rendering: polished high-detail 3D fantasy collectible icon, crisp silhouette, luminous gem, pearlescent enamel, restrained bloom, clean edges.
Constraints: exactly two wisps; brightest teal core; controlled teal cracks; fully closed shell; no full orbit; transparent outside; no text, logo, watermark, pedestal, ground plane, or cast shadow.
Avoid: checkerboard pattern, gray grid, rectangular background, black background, white background, RGB matte, purple core, orange energy, excessive cracks, full orbit, rings, spiral, extra trails, extra objects, hatching.
```

### C6 — alpha extraction đã chấp nhận

```text
Use case: background-extraction
Return the Level 6 egg, teal cracks and exactly two teal wisps as a clean cutout on a truly transparent canvas. Remove only the gray checkerboard background. Preserve the subject exactly. Output a PNG with a real alpha channel; all four corners and all empty surrounding pixels must have alpha value 0. Do not draw any checkerboard or replacement color. Preserve soft glow using partial alpha. No other changes.
```

Raw RGBA được chấp nhận: `exec-d34f03d7-718f-4cc5-afff-84a66c6a0b0d.png`, SHA-256 `8098e643121c570083cd1bc86a77abb3e598676c0158560ca73249384fb45e94`. ImageGen tạo góc trái dưới alpha `1/255`; ba lần làm sạch viền tiếp theo đều làm mất alpha nên bản RGBA giữ đúng shell/camera/anchor này được chọn.

## Prompt đã chấp nhận — Linh thú

### Bạch Hổ

```text
Use case: illustration-story
Asset type: premium 2D game mascot cutout for an identity journey interface
Primary request: Create one polished full-body BẠCH HỔ mascot, faithfully following the approved IQX mascot concept: a chubby baby white tiger/cat with very soft fluffy white fur; large pointed ears whose inner fur is faceted sapphire-blue crystal; a tiny blue diamond crystal centered on the forehead; a very large open cobalt-blue eye on the viewer's left and the other eye happily winking; rosy cheeks; friendly open smiling mouth with tiny cute fangs; one front paw raised on the viewer's right in a wave, showing pink-and-blue paw pads; short sturdy legs; and a large fluffy curled tail sweeping up on the viewer's left with rich cobalt-to-cyan blue accents. Around the neck is a cobalt-blue scarf bearing the exact small white uppercase text "IQX", plus a hanging faceted blue diamond pendant.
Scene/backdrop: genuinely transparent RGBA canvas; all four corner pixels and all canvas outside the mascot must have alpha exactly 0; no visible backdrop or surface.
Style/medium: premium hand-painted 2D game illustration, soft layered digital gouache and airbrush, elegant clean silhouette, subtle painterly fur tufts and restrained crystal glow; warm, charming mascot art matching the softness and chibi proportions of the approved five-mascot reference. Clearly flat 2D illustration, avoiding 3D render materials and plastic gloss.
Composition/framing: single mascot only, full body centered in a square canvas, front three-quarter view; entire ears, tail, raised paw, pendant, and feet visible; at least 8 percent fully transparent empty padding between the character and every canvas edge.
Lighting/mood: gentle cool blue rim light and soft warm facial light, cheerful and welcoming.
Color palette: luminous white, cobalt blue, sapphire, cyan highlights, soft blush pink, tiny navy accents.
Text (verbatim): "IQX"
Constraints: preserve the exact described anatomy and sidedness: tail on viewer's left, waving paw on viewer's right; one blue eye open and the other winking; raised paw visibly shows pads; only the scarf may contain the text IQX; full character isolated on actual transparent alpha; four corner pixels alpha 0.
Avoid: background, checkerboard pattern, transparency grid, floor, ground shadow, glow ring, platform, pedestal, frame, border, labels, captions, watermark, extra characters, extra limbs, cropped ears or tail, facial stripes, photorealism, 3D CGI, vinyl-toy look, hard outlines, black matte, white matte.
```

Raw RGBA SHA-256: `f0e8fc2a28d5d1c427a92290419a41b1ef88ba2cdb16ce87e91256729838be19`.

### Thanh Long

```text
Use case: stylized-concept
Asset type: transparent full-body 2D game mascot sprite
Primary request: Freshly illustrate Thanh Long, the adorable IQX white baby Asian dragon, as one polished character sprite consistent with a premium soft-painted 2D chibi mobile-game mascot family.
Transparent canvas requirement: output genuine RGBA transparency. Reserve a wide completely empty safety border of at least 120 pixels on every side. Absolutely no visible or faint pixels, glow, antialiasing, haze, RGB matte, or alpha values above zero anywhere in this outer border. All four corner pixels and the full outer border must be RGBA (0,0,0,0).
Character: compact chubby white dragon body, short feet, rounded friendly proportions; two small branching translucent ice-blue antler horns; soft white forehead tuft and tiny centered blue diamond; blue fin-shaped ears and layered blue cheek fins; one huge sparkling blue eye open and the other winking; open delighted smile with pink tongue and two tiny fangs. On viewer-right, one paw raised in a wave. On viewer-left, the other paw supports a luminous cyan orb containing a crisp simple white upward chart icon. Long curved serpentine dragon tail extends to viewer-right, clearly covered in pale-blue scales with blue fin ridges. Cobalt neck scarf displaying exact clean white text "IQX" once; blue faceted diamond pendant.
Identity constraints: unmistakably an Asian dragon, differentiated from the Bach Ho cat mascot by branching horns, fin ears, scaled serpentine tail, belly scales, and glowing analysis orb. No cat ears or fluffy fox tail.
Art direction: premium hand-painted 2D illustration, soft rounded forms, clean cutout, delicate painterly shadowing, subtle pearly scales, controlled cool rim light, expressive cute face. Match a cohesive blue-and-white luxury fintech mascot set. Avoid 3D CGI/plastic appearance.
Composition: centered, upright, front/three-quarter full body; all horn tips, toes, orb glow, scarf ends, and tail fully visible; generous transparent space around every part; compact square silhouette.
Text: only "IQX" on scarf, exact spelling.
Avoid: any backdrop or background, checkerboard, matte, rectangle, floor, ground, drop shadow, underfoot ring, pedestal, card, scenery, wings, deer body, crops, extra objects, extra text, watermark, excessive bloom.
```

Raw RGBA SHA-256: `516dafb957dc22c0c623cf2d9359117a0dc2a04b52be205d1b3e73061c7987f5`.

### Lộc Hươu

```text
Use case: stylized-concept
Asset type: premium 2D painted game mascot sprite for the IQX journey identity UI
Primary request: Create Lộc Hươu, a charming chubby ivory-cream baby deer mascot, faithfully matching the approved IQX five-mascot visual language.
Scene/backdrop: genuinely transparent background with a real alpha channel; the character is an isolated cutout only.
Subject: Full-body baby deer with a very round compact body and short little paws. Ivory-cream fluffy fur. Two small, elegant branched antlers in warm luminous gold, rounded and organic rather than crystalline. Very large fluffy deer ears with cream rims and warm golden-brown inner ears. A soft white forehead curl. One huge warm brown eye open and the other eye winking. Tiny friendly open smiling mouth. The deer's front paw on the viewer's right is raised in a gentle wave; the other front paw rests down. A small curled fluffy tail with a warm gold tip is visible on the viewer's left. Around its neck is a cobalt-blue scarf printed with the exact white uppercase text "IQX", plus one small faceted gold-amber diamond pendant hanging beneath the scarf.
Style/medium: polished premium 2D painted game sprite, adorable East Asian mobile-game mascot aesthetic, soft painterly shading, subtle warm rim light, plush fur shapes, clean controlled silhouette, dimensional but clearly illustrated rather than 3D or photoreal.
Composition/framing: one character only, centered and fully visible from antler tips through paws and tail, upright three-quarter/front pose, generous transparent padding on every side, balanced silhouette suitable for UI use.
Lighting/mood: soft warm studio-like character lighting, optimistic, friendly, patient, observant.
Color palette: ivory and cream fur, warm honey gold antlers and tail accent, rich cobalt-blue scarf, warm brown eye, small amber-gold pendant.
Text (verbatim): "IQX"
Constraints: exactly one baby deer mascot; clearly recognizable as a deer; preserve the specified wink, open brown eye, raised paw, small gold-tipped tail, short paws, antlers, scarf, and pendant; genuine RGBA transparency all the way to the canvas corners; crisp feathered cutout edges; no cast shadow or floor.
Avoid: checkerboard pattern, transparency grid, white background, colored background, matte rectangle, halo panel, border, floor, platform, pedestal, glowing circle, ground shadow, scenery, other characters, extra objects, extra jewelry, forehead gem, blue horns, long limbs, adult deer proportions, catlike face, foxlike face, photorealism, 3D render, excessive gloss, watermark, signature, any text except the exact IQX letters on the scarf.
```

Raw RGBA SHA-256: `f5d553d3d497b4bd74c4fa9274854e1f915541039e981dbc5d4df671fa2079f3`.

### Phụng Hoàng

```text
Use case: stylized-concept
Asset type: production-ready opaque 2D game character cutout on transparent RGBA
Primary request: Generate a fresh IQX PHỤNG HOÀNG baby phoenix mascot. The character itself must render fully solid and vivid when composited over either black or white; use alpha 255 across all interior character pixels, with transparency only outside the silhouette.
Subject: one round ivory-cream baby phoenix BIRD, full body, front-facing, centered, happily celebrating. Both eyes joyfully closed as curved lashes. A distinct solid gold-orange bird BEAK around a small joyful open mouth; no mammal muzzle. Tall orange-gold flame crest sweeping upward. Exactly two solid feathered wings spread left and right, with layered cream inner feathers grading through gold and orange to red-orange tips. Small orange tail feathers visible behind one side. Exactly two slender solid gold bird legs. Each foot clearly has exactly THREE separated forward-pointing bird toes, no paws. Rich cobalt-blue scarf with centered clean white uppercase "IQX". One faceted amber-orange diamond pendant centered below the scarf.
Style/medium: premium polished 2D painted mobile-game sprite matching the approved IQX mascot sheet; soft rounded volume, luminous but solid feather coloring, crisp readable silhouette, warm cheek blush, cute proportions.
Composition/framing: square; complete full body; generous empty margin on all sides; crest, both wing tips, tail, both legs, and all toes fully within frame.
Alpha requirements: CHARACTER INTERIOR MUST BE FULLY OPAQUE, alpha 255, not translucent, not ghosted. Only a narrow anti-aliased edge transition may use intermediate alpha. BACKGROUND MUST BE FULLY TRANSPARENT, alpha 0, including every corner and a clean empty border. The saved PNG must look fully colored and vivid on a black checkerboard-free viewer.
Text (verbatim): "IQX"
Constraints: one mascot only; clear bird anatomy; exactly two wings, two legs, and three visible front toes on each foot; true RGBA PNG; no stray pixels outside silhouette.
Avoid: semi-transparent or ghosted mascot, low-alpha subject, translucent feathers, checkerboard pixels, matte, background, floor, ground shadow, halo, glow, platform, ring, pedestal, scenery, props, extra marks, border, extra text, watermark, mammal muzzle, paws, open eyes, cropped toes, extra limbs.
```

Raw RGBA SHA-256: `68ef298f7b383d425150384329f8df647483b5554f023409b2ca474b5ed43a28`.

### Kim Quy

```text
Use case: stylized-concept
Asset type: transparent full-body game mascot asset for the IQX journey identity interface
Primary request: Create Kim Quy, an adorable chubby baby land turtle mascot, closely matching the character language and premium soft 2D painted game-illustration finish of the approved IQX five-mascot reference.
Scene/backdrop: no scene; genuinely transparent background with a true alpha channel.
Subject: Full-body baby land turtle. Ivory to pale-mint face and softly segmented ivory belly. A dark emerald and sage-green rounded segmented land-turtle shell is clearly visible behind the body, especially on the viewer's right. Add a small cluster of pale-green forehead spots and exactly TWO fresh green leaf blades sprouting from the top of the head. One single large emerald eye is open and glossy; the other eye is a cheerful wink. Closed happy smiling mouth, with no open mouth or visible tongue. Short sturdy stump-like legs with tiny ivory claws. The forefoot on the viewer's left is lifted in a friendly greeting; the other forefoot rests naturally.
Wardrobe/accessory: cobalt-blue neck scarf displaying the exact white uppercase text "IQX", with a mint-green faceted DIAMOND pendant hanging at the center below it.
Style/medium: premium polished 2D painted mobile-game mascot illustration, soft volume, smooth painterly gradients, subtle edge highlights, gentle blush, rounded appealing proportions, clean silhouette, cohesive with the approved IQX mascot reference. Avoid plastic 3D rendering, photorealism, hard outlines, or excessive gloss.
Composition/framing: one character only, upright three-quarter pose, full body centered, generous transparent padding on every side; no part cropped.
Lighting/mood: soft luminous studio-like character lighting, warm friendly optimistic expression.
Color palette: ivory, pale mint, sage, deep emerald, cobalt blue, mint gemstone.
Text (verbatim): "IQX"
Constraints: output a PNG with ACTUAL transparent alpha outside the character. Transparency must be real image transparency, never a rendered transparency preview. Exactly two leaves. Only one open eye and one wink. Closed smile. One lifted forefoot on viewer's left. Shell must read as a land-turtle shell, not sea-turtle anatomy.
Avoid: checkerboard or grid pattern, white/colored/gray background, floor, ground shadow, glowing ring, pedestal, platform, framing card, scenery, props, extra characters, extra limbs, extra leaves, logos or text other than "IQX", watermark, open mouth, tongue.
```

Raw RGBA SHA-256: `383a67ac42069c5bbf89d95a1d7268a2957df2e3586fec981bc72fb1c657b92c`.

## Giới hạn nghiệm thu

- Bộ ảnh đáp ứng nhận diện level/spec ở mức artwork mới được đối chiếu bằng mắt; chưa có đo similarity hay phê duyệt pixel-level từ tác giả mẫu.
- Các câu “preserve pixel-for-pixel” trong prompt extraction là chỉ dẫn gửi cho ImageGen, không phải bằng chứng thuật toán giữ nguyên từng pixel. Bản được chọn đã được kiểm tra lại bằng `view_image`, alpha và hash.
- Chữ `IQX` nằm trong raster do ImageGen tạo, vì vậy có thể cần artwork chữ/vector riêng nếu yêu cầu brand pixel-perfect.
- C0–C6 là bảy file khác nhau; semantic động chi tiết được bổ sung bởi SVG/CSS và không phải mọi hiệu ứng đều được bake vào poster.
- Production rig nhiều bộ phận, biểu cảm face swap và deformation chất lượng Spine vẫn là hạng mục tiếp theo nếu cần motion ở cấp mascot-game hoàn chỉnh. Poster hiện đứng yên; animation mascot chỉ là ánh sáng, vòng chân, cue và crossfade quanh artwork.
