import { useState } from "react"
import { Message, Modal, Spin } from "@arco-design/web-react"
import { getErrorMessage } from "@/shared/http/client"
import { useAddToCap5Watchlist, useCap5Watchlist, useHuntResult } from "./sanMaHooks"
import {
  describeHuntTotal,
  huntFilterDef,
  splitLocSan,
  type HuntFilterKey,
} from "./sanMaTypes"
import "./cap5-sanma.css"

/**
 * Popup kết quả một bộ lọc săn mã (spec §5.4, mockup `iqx-cap5-sanma.html`
 * `.hunt-modal`): khối định nghĩa nền vàng · dòng minh bạch · tối đa 10 mã kèm
 * tín hiệu thô · nút "+ Watchlist" → "✓ Đã thêm".
 *
 * ★★ LUẬT SỐ 1. Popup có BỐN trạng thái tách bạch, và ba trong số đó KHÔNG
 * được vẽ ra danh sách rỗng như thể "đã lọc xong, không có mã nào":
 *   1. đang tải          → spinner
 *   2. lỗi mạng/máy chủ  → câu lỗi, KHÔNG có con số nào
 *   3. `kha_dung=false`  → «Chưa đủ dữ liệu để chạy bộ lọc này» + lý do của server
 *   4. `kha_dung=true`, `items` rỗng → «Hôm nay không mã nào thỏa điều kiện»
 *      (đây là số 0 THẬT, đã lọc xong — chỉ trạng thái này mới được nói vậy)
 *
 * Modal `closable` (không phải cổng như màn tốt nghiệp) — không bao giờ nhốt user.
 */
export function HuntResultModal({
  filter,
  onClose,
}: {
  /** Bộ lọc đang mở; `null` = đóng. */
  filter: HuntFilterKey | null
  onClose: () => void
}) {
  const def = huntFilterDef(filter)
  const { data, isLoading, isError } = useHuntResult(filter, filter != null)
  const { data: watchlist } = useCap5Watchlist(filter != null)
  const add = useAddToCap5Watchlist()
  const [justAdded, setJustAdded] = useState<Record<string, boolean>>({})

  const alreadyIn = new Set((watchlist ?? []).map((w) => w.symbol.toUpperCase()))

  const handleAdd = async (symbol: string, tinHieu: string) => {
    if (!filter) return
    try {
      await add.mutateAsync({ symbol, hunt_filter: filter, hunt_signal: tinHieu })
      setJustAdded((p) => ({ ...p, [symbol.toUpperCase()]: true }))
    } catch (err) {
      Message.error(await getErrorMessage(err, `Không thêm được ${symbol} vào Watchlist`))
    }
  }

  return (
    <Modal
      visible={filter != null}
      onCancel={onClose}
      footer={null}
      autoFocus={false}
      focusLock
      title={def ? `${def.icon} ${def.ten}` : "Săn mã"}
      style={{ maxWidth: 420, width: "94vw" }}
    >
      {/* `data-tour-id` cho tour Săn mã (bước 4 «Top 10 mã mạnh nhất» / bước 5
          «+ Watchlist»). Chỉ tồn tại khi popup ĐANG MỞ — engine tour có đường lùi
          target-không-thấy → bong bóng giữa màn, xem `configs/sanMaTour.ts`. */}
      <div className="cap5-sm" data-tour-id="tour-sanma-popup">
        {def && <div className="cap5-hm-def">{def.dinh_nghia}</div>}

        {isLoading && (
          <div className="cap5-hm-empty">
            <Spin />
            <div style={{ marginTop: 8 }}>Đang lọc…</div>
          </div>
        )}

        {!isLoading && isError && (
          <div className="cap5-hm-empty" data-testid="cap5-hunt-error">
            Không lấy được kết quả bộ lọc từ máy chủ. Thử lại sau nhé.
          </div>
        )}

        {!isLoading && !isError && data && !data.kha_dung && (
          <div className="cap5-hm-empty" data-testid="cap5-hunt-nodata">
            <div style={{ fontWeight: 700, color: "#d68f00" }}>
              Chưa đủ dữ liệu để chạy bộ lọc này
            </div>
            <div style={{ marginTop: 4 }}>
              {data.ly_do_chua_kha_dung ??
                "Máy chủ chưa nói rõ vì sao — chưa có kết quả nào để hiện."}
            </div>
          </div>
        )}

        {!isLoading && !isError && data && data.kha_dung && (
          <HuntResultBody
            data={data}
            defTop={def?.ghi_chu_top ?? "mã"}
            isAdded={(s) => alreadyIn.has(s.toUpperCase()) || justAdded[s.toUpperCase()] === true}
            adding={add.isPending}
            onAdd={handleAdd}
          />
        )}
      </div>
    </Modal>
  )
}

function HuntResultBody({
  data,
  defTop,
  isAdded,
  adding,
  onAdd,
}: {
  data: NonNullable<ReturnType<typeof useHuntResult>["data"]>
  defTop: string
  isAdded: (symbol: string) => boolean
  adding: boolean
  onAdd: (symbol: string, tinHieu: string) => void
}) {
  const { apDung, chuaApDung } = splitLocSan(data.loc_san)
  const def = huntFilterDef(data.ma)

  return (
    <>
      <div className="cap5-hm-meta">
        <div data-testid="cap5-hunt-total">
          {def
            ? describeHuntTotal(data, def)
            : `Đang hiện ${data.items.length.toLocaleString("en-US")} ${defTop}`}
        </div>
        <div data-testid="cap5-hunt-locsan">
          {apDung.length > 0
            ? `Đã lọc: ${apDung.join(" · ")}`
            : "Máy chủ chưa cho biết điều kiện lọc sàn nào đã được áp dụng."}
        </div>
        {chuaApDung.length > 0 && (
          <div className="cap5-sm-note-warn" data-testid="cap5-hunt-locsan-thieu">
            ⚠ Chưa lọc được: {chuaApDung.join(" · ")} — máy chủ chưa có dữ liệu.
          </div>
        )}
      </div>

      {data.items.length === 0 ? (
        <div className="cap5-hm-empty" data-testid="cap5-hunt-empty">
          Hôm nay không mã nào thỏa điều kiện này.
        </div>
      ) : (
        <div className="cap5-hm-results">
          {data.items.map((it, idx) => {
            const added = isAdded(it.symbol)
            return (
              <div className="cap5-hr" key={it.symbol}>
                <span className="cap5-hr-rank">{it.hang.toLocaleString("en-US")}</span>
                <span className="cap5-hr-code">{it.symbol}</span>
                <span className="cap5-hr-sig">{it.tin_hieu}</span>
                <button
                  type="button"
                  data-tour-id={idx === 0 ? "tour-sanma-add" : undefined}
                  className={`cap5-hr-add${added ? " added" : ""}`}
                  disabled={added || adding}
                  onClick={() => onAdd(it.symbol, it.tin_hieu)}
                >
                  {added ? "✓ Đã thêm" : "+ Watchlist"}
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="cap5-hm-foot">
        Bấm "+ Watchlist" để đưa mã vào danh sách quan sát — săn chưa phải là mua.
      </div>
    </>
  )
}
