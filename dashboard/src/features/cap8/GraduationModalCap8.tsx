import { Modal } from "@arco-design/web-react"
import { useSidebar } from "@/shared/contexts/sidebar-context"
import { Badge, LEVELS } from "@/features/cap0/Badge"
import "@/features/cap0/cap0.css"
import "./cap8-graduation.css"
import { HuyHieuRailCap8 } from "./HuyHieuRailCap8"
import { useCap8Progress, useGraduateCap8, useThachThucCap8 } from "./hooks"
import { caveatThieuCatLoCap8 } from "./portfolioAnalysisCap8"
import { countCap8TasksDone, type Cap8Progress, type DanhMucCap8 } from "./types"

/**
 * Điều kiện mở màn tốt nghiệp Cấp 8 (spec §3): 3/3 nhiệm vụ, chưa từng tốt
 * nghiệp (một chiều — không mở lại một khi `graduated_at` đã có, mirrors
 * `cap7/GraduationModalCap7.tsx#isGraduationReadyCap7`). Vì nhiệm vụ ③ (Thách
 * thức Quản trị rủi ro danh mục) bao hàm cả 3 điều kiện số lệnh kiểm tra + mua
 * bất chấp trong cửa sổ trượt + trạng thái danh mục, xong ③ = xong Cấp 8.
 */
export function isGraduationReadyCap8(progress: Cap8Progress | null | undefined): boolean {
  if (!progress || progress.graduated_at) return false
  return countCap8TasksDone(progress) >= 3
}

/** `18` → `"18"` — số en-US, không phần thập phân (§E). */
function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US")
}

/**
 * `14` → `"14%"`, `null` → `"chưa tính được"`.
 *
 * ★★ `don_nganh_max_pct` và `tong_rui_ro_pct` là `number | null`, và `null`
 * nghĩa là CHƯA TÍNH ĐƯỢC — `?? 0` ở đây sẽ nói với người dùng rằng cả danh mục
 * của họ không có chút rủi ro nào, đúng vào lúc chương trình chúc mừng họ vì đã
 * biết đo nó. Đây chính là bài học của Cấp 8, nên màn tốt nghiệp không được phép
 * vi phạm nó.
 */
function fmtPctOrChua(n: number | null): string {
  return n == null ? "chưa tính được" : `${Math.round(n).toLocaleString("en-US")}%`
}

// Verbatim spec §3 copy — `**bold**` markers kept for the inline-bold renderer
// below (same convention as `cap0/GraduationModal.tsx` → `cap7/
// GraduationModalCap7.tsx`).
//
// Khối 1 có một chỗ trống `{N}` trong spec → điền bằng SỐ THẬT của user (§C12c:
// không hiện template rỗng).
function block1(progress: Cap8Progress | null | undefined): string {
  const n = fmtInt(progress?.so_lenh_kiem_tra ?? 0)
  return (
    `Bạn đã quản trị rủi ro ở tầm danh mục qua ${n} lệnh: không dồn một ngành, để ý các mã ` +
    "cùng nhịp, và luôn biết tổng vốn mình đang đặt cược. Bạn đã đi trọn hành trình từ lệnh " +
    "đầu tiên ở Cấp 0 tới quản trị cả danh mục hôm nay."
  )
}

/**
 * §C12c — Khối 1 là lời GHI NHẬN (copy spec), nên con số đứng ngay sau nó.
 *
 * ★ Nói CẢ cửa sổ trượt lẫn con số cả đời: điều kiện ② được chấm trên `{cửa sổ}`
 * lệnh gần nhất, nên in mỗi con số cả đời sẽ khiến người dùng tưởng mình bị tính
 * hết mọi lần "Vẫn mua" từ đầu — họ không, và câu này nói thẳng ra.
 *
 * ★ Và "Vẫn mua" KHÔNG được viết như một lỗi: nó là lựa chọn hợp lệ (§C8, spec
 * §9) — câu chỉ ĐẾM, không phán.
 */
function block1Provenance(
  progress: Cap8Progress | null | undefined,
  tongRuiRo: number | null,
): string {
  const canhBao = fmtInt(progress?.so_lan_co_canh_bao ?? 0)
  const batChap = fmtInt(progress?.bat_chap_gan_day ?? 0)
  const cuaSo = fmtInt(progress?.cua_so_gan_day ?? 0)
  const doiBatChap = fmtInt(progress?.so_lan_mua_bat_chap_canh_bao ?? 0)
  const tong = fmtPctOrChua(tongRuiRo)
  const nganh = fmtPctOrChua(progress?.don_nganh_max_pct ?? null)
  return (
    `(Số của bạn: ${canhBao} lần bước kiểm tra bật cảnh báo · vẫn mua ${batChap}/${cuaSo} ` +
    `lệnh gần nhất, ${doiBatChap} lần tính cả đời tài khoản — «Vẫn mua» là lựa chọn hợp lệ, ` +
    `đây chỉ là con số · ngành lớn nhất ${nganh} · tổng vốn ở rủi ro ${tong} nếu mọi cắt lỗ ` +
    "bị chạm.)"
  )
}

/**
 * ★★ CAVEAT CẮT LỖ CHO MÀN CUỐI — bắt buộc, không phải trang trí.
 *
 * Một vị thế chưa đặt cắt lỗ có rủi ro **CHƯA BIẾT, không phải bằng 0**, nên
 * server LOẠI nó khỏi tổng vốn ở rủi ro. Mọi bề mặt khác của Cấp 8 (khối Kiểm tra
 * danh mục lúc mua, Kết sổ, khối ⑱, widget "Danh mục hiện tại") đều đi kèm câu
 * "{N} vị thế chưa có cắt lỗ". Màn tốt nghiệp trước fix wave FE-2 thì KHÔNG — nó
 * in `tổng rủi ro 12%` trần trụi, vì `Cap8Progress` không mang theo cả
 * `so_vi_the_thieu_cat_lo` lẫn caveat. Đây lại đúng là màn hình được thiết kế để
 * người dùng tin, và là câu chốt của cả chương trình 0-8.
 *
 * Ba trạng thái, không trạng thái nào được im lặng:
 *  · có vị thế thiếu cắt lỗ → câu caveat (của server, hoặc tự dựng);
 *  · không thiếu vị thế nào → nói thẳng tổng ở trên là toàn bộ;
 *  · CHƯA lấy được `/cap8/thach-thuc` → nói thẳng là chưa biết. Im lặng ở nhánh
 *    này sẽ khiến một con số ảnh chụp của `cap8_progress` trông như đã đầy đủ.
 */
function gradCaveat(danhMuc: DanhMucCap8 | null | undefined): string {
  if (!danhMuc) {
    return (
      "⚠ Chưa đối chiếu lại được danh mục lúc này nên chưa biết có vị thế nào chưa đặt cắt lỗ " +
      "hay không — nếu có, con số tổng ở trên chỉ là phần ĐÃ BIẾT."
    )
  }
  const caveat = caveatThieuCatLoCap8(danhMuc.caveat, danhMuc.so_vi_the_thieu_cat_lo)
  return caveat != null
    ? `⚠ ${caveat}`
    : "Mọi vị thế đều đã có cắt lỗ, nên tổng ở trên là toàn bộ phần vốn ở rủi ro."
}

// Khối 2 — Định vị. VERBATIM spec §3.
const BLOCK_2 =
  "Đây là hết mạch kỹ năng nền tảng. Nhưng thị trường luôn còn tầng sâu hơn: chu kỳ ngành, xoay vòng dòng tiền, định giá nâng cao… Hành trình học không dừng."

// Khối 3 — Chuyển tiếp. VERBATIM spec §3. ★ Cấp 9+ chỉ là CHỮ ở đây: không link,
// không nút, không ô rail xám — chưa có gì để bấm vào.
const BLOCK_3 =
  "**Bạn đã ở cấp cao nhất hiện có.** Các cấp theo chủ đề (Cấp 9+) sẽ mở dần khi ra mắt. Giờ: giữ kỷ luật, và giao dịch như một nhà đầu tư đã đi trọn con đường."

/** Splits on the spec's own `**bold**` markers and renders them as `<strong>`. */
function renderInlineBold(text: string) {
  return text.split("**").map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part))
}

/**
 * Màn tốt nghiệp Cấp 8 (spec §3) — **màn cuối của cả chương trình 0-8**.
 * Self-contained (gọi `useCap8Progress` + `useGraduateCap8` bên trong, cùng
 * pattern `GraduationModalCap7`): consumer (`Cap8TradingPage`) chỉ cần mount
 * `<GraduationModalCap8 />`, component tự quyết định hiển thị qua
 * `isGraduationReadyCap8`. Header (tag/tên/dòng phụ `3/3 · danh mục phân tán ·
 * tổng rủi ro {X}%` với SỐ THẬT / huy hiệu 120px phát sáng, xanh lá Cấp 8
 * `#3f9b5a` + dòng nhỏ "Trọn mạch Nhập môn → đây.") + rail 0-8 đã hoàn thành +
 * 3 khối (Ghi nhận / Định vị / Chuyển tiếp) + CTA xanh lá.
 *
 * ★★ **KHÔNG CÓ CẤP SAU.** CTA là `Xem hồ sơ hành trình →` — nó ghi tốt nghiệp
 * rồi mở tab Hành trình (rail huy hiệu đầy đủ 0-8), chứ KHÔNG vào cấp nào cả.
 * Cấp 9+ xuất hiện đúng một lần, ở Khối 3, và chỉ là CHỮ.
 *
 * ★★ **CTA KHÔNG BAO GIỜ `disabled`.** Modal này `closable={false}` +
 * `visible = isGraduationReadyCap8(...)` và chỉ biến mất khi `graduated_at` về,
 * nên một nút disabled sẽ nhốt VĨNH VIỄN mọi user đã xong 3/3 trong một màn không
 * có lối ra — kể cả khi `POST /cap8/graduate` vừa lỗi. Chống double-submit bằng
 * cách chặn trong handler (`graduate.isPending`), KHÔNG bằng `disabled`.
 *
 * ★ **KHÔNG confetti, KHÔNG huy chương** (§C10, spec §9). Màu cấp + rail 0-8 đã
 * hoàn thành là toàn bộ khoảnh khắc, và đó là cố ý.
 */
export function GraduationModalCap8() {
  const { data: progress } = useCap8Progress()
  // ★ `GET /cap8/thach-thuc` là endpoint DUY NHẤT mang theo cả tổng vốn ở rủi ro
  // lẫn `so_vi_the_thieu_cat_lo`/`caveat`, đo CÙNG một lúc — `cap8_progress` cố ý
  // chỉ là ảnh chụp và không có hai trường sau. Không có nó thì màn cuối không thể
  // nói ra vị thế nào đã bị loại khỏi tổng.
  const { data: thachThuc } = useThachThucCap8()
  const danhMuc = thachThuc?.danh_muc ?? null
  const graduate = useGraduateCap8()
  const { setActivePanel } = useSidebar()
  const level = LEVELS[8]
  const visible = isGraduationReadyCap8(progress)

  // Con số sống của `/thach-thuc` THẮNG ảnh chụp `cap8_progress` (nó được đo cùng
  // lúc với caveat bên dưới, nên hai thứ không thể lệch nhau); chưa tải được thì
  // rơi về ảnh chụp — và `gradCaveat` nói thẳng rằng lúc đó chưa biết có vị thế
  // nào thiếu cắt lỗ hay không.
  const tongRuiRo = danhMuc?.tong_rui_ro_pct ?? progress?.tong_rui_ro_pct ?? null
  const soThieuCatLo = danhMuc?.so_vi_the_thieu_cat_lo ?? 0

  const handleGraduate = () => {
    // Chống double-submit mà KHÔNG dùng `disabled` — xem docstring.
    if (graduate.isPending) return
    graduate.mutate(undefined, {
      onSuccess: () => {
        // Đích của spec §3: tab Hành trình / rail huy hiệu đầy đủ 0-8. Không
        // `navigate` gì: modal này chỉ render khi đã ở `/dau-truong`.
        setActivePanel("journey")
      },
    })
  }

  // Dòng phụ spec §3 `3/3 · danh mục phân tán · tổng rủi ro {X}%` — số THẬT
  // (§C12c), và `null` thành "chưa tính được" chứ KHÔNG thành 0%.
  //
  // ★ Kèm ĐUÔI "(chưa gồm N vị thế chưa có cắt lỗ)" khi có vị thế bị loại khỏi
  // tổng: một dòng tóm tắt là chỗ dễ được đọc nhất và dễ trích dẫn nhất, nên nó
  // không được phép là chỗ duy nhất bỏ qua caveat.
  const duoiCatLo =
    soThieuCatLo > 0 && tongRuiRo != null
      ? ` (chưa gồm ${fmtInt(soThieuCatLo)} vị thế chưa có cắt lỗ)`
      : ""
  const sub = progress
    ? `${countCap8TasksDone(progress)}/3 · danh mục phân tán · tổng rủi ro ${fmtPctOrChua(
        tongRuiRo,
      )}${duoiCatLo}`
    : ""

  return (
    <Modal
      visible={visible}
      footer={null}
      title={null}
      closable={false}
      maskClosable={false}
      escToExit={false}
      autoFocus={false}
      className="cap0"
      style={{
        width: 480,
        maxWidth: "calc(100vw - 32px)",
        background: "var(--bg2)",
        border: "1px solid var(--bd)",
        borderRadius: 16,
      }}
    >
      <div className="cap0-grad-header">
        <div className="cap0-grad-tag">HOÀN THÀNH</div>
        <h2 className="cap0-display cap0-grad-title">CẤP 8 · QUẢN TRỊ RỦI RO DANH MỤC</h2>
        <div className="cap0-grad-sub" data-testid="cap8-grad-sub">
          {sub}
        </div>
        <div className="cap0-grad-badge-wrap">
          <Badge n={level.n} color={level.color} fill={8} size={120} glow />
        </div>
        <p className="cap8-grad-tronmach" data-testid="cap8-grad-tronmach">
          Trọn mạch Nhập môn → đây.
        </p>
      </div>

      {/* Mốc "trọn mạch 0-8" (spec §10 checklist) — rail đã hoàn thành, cùng
          component với tab Hành trình nên hai chỗ không thể lệch nhau. */}
      <div className="cap8-grad-rail">
        <HuyHieuRailCap8
          graduated
          size={26}
          testId="cap8-grad-rail"
          testIdPrefix="cap8-grad-rail"
          title="Trọn mạch 0-8"
          note={null}
        />
      </div>

      <div className="cap0-grad-block" data-testid="cap8-grad-khoi1">
        {renderInlineBold(block1(progress))}
      </div>
      <p className="cap8-grad-provenance" data-testid="cap8-grad-khoi1-provenance">
        {block1Provenance(progress, tongRuiRo)}
      </p>
      {/* ★ Ở ĐÂU HIỆN TỔNG RỦI RO, Ở ĐÓ CÓ CAVEAT — kể cả ở màn cuối cùng. */}
      <p className="cap8-grad-caveat" data-testid="cap8-grad-caveat">
        {gradCaveat(danhMuc)}
      </p>
      <div className="cap0-grad-block" data-testid="cap8-grad-khoi2">
        {renderInlineBold(BLOCK_2)}
      </div>
      <div className="cap0-grad-block cap8-grad-block--top" data-testid="cap8-grad-khoi3">
        {renderInlineBold(BLOCK_3)}
      </div>

      <button
        type="button"
        className="cap0-grad-cta cap8-grad-cta--top"
        data-testid="cap8-grad-cta"
        onClick={handleGraduate}
      >
        Xem hồ sơ hành trình →
      </button>
    </Modal>
  )
}
