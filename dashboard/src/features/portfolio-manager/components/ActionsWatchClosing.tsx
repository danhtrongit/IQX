import type { NarrativeJSON } from "../types"

interface ActionsWatchClosingProps {
  actions: NarrativeJSON["actions"]
  watch: string
  closing: string
}

export function ActionsWatchClosing({ actions, watch, closing }: ActionsWatchClosingProps) {
  return (
    <div>
      <div className="actions">
        {actions.map((action, idx) => (
          <div key={idx} className="action">
            <div>
              <div className="at">{action.title}</div>
              <p className="ad">{action.detail}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="watch">
        <div className="wt">Điều cần theo dõi tới kỳ sau</div>
        <p>{watch}</p>
      </div>

      <div className="closing">{closing}</div>

      <div className="signoff">
        <div className="av">Q</div>
        <div className="sn">
          <b>Người quản lý danh mục của bạn</b>
          <span>IQX · tự động cập nhật mỗi kỳ</span>
        </div>
      </div>

      <footer className="foot">
        Báo cáo này nhằm mục đích phân tích và tham khảo, không phải khuyến nghị mua bán. Mọi số liệu được tính tự động từ dữ liệu giá và báo cáo tài chính; những mã chưa đủ dữ liệu được ghi rõ thay vì ước tính. Quyết định cuối cùng là của bạn.
      </footer>
    </div>
  )
}
