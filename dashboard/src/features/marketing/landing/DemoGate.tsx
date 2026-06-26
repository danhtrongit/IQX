import { Link } from "react-router"
import { useAuth } from "@/features/auth"
import { AiInsightBriefing } from "@/features/stock/ai-insight"
import { AI_SAMPLE } from "./aiSample"

/**
 * The conversion engine: renders the REAL <AiInsightBriefing> (the same
 * component used in the app) with an injected sample, as a public teaser
 * (briefing + L1). The detail layers L2–L5 sit behind the signup gate below.
 */
export function DemoGate({ onRegister }: { onRegister: () => void }) {
  const { isAuthenticated } = useAuth()

  return (
    <section className="lp-section" id="demo">
      <div className="lp-wrap lp-wrap--narrow">
        <span className="lp-eyebrow">AI Phân tích cổ phiếu · Xem thử miễn phí</span>
        <h2 className="lp-h2" style={{ marginTop: 14, marginBottom: 12 }}>
          Gõ một mã. Đọc phân tích AI 6 lớp.
        </h2>
        <p className="lp-lead" style={{ marginBottom: 22 }}>
          Đây chính là bản phân tích AI bạn nhận được trong ứng dụng — xu hướng, thanh khoản, dòng
          tiền, nội bộ và tin tức, viết thành một bản briefing dễ đọc.
        </p>

        <div className="lp-ai lp-card">
          <div className="lp-ai__body">
            <AiInsightBriefing symbol="VCB" injected={AI_SAMPLE} teaser />
          </div>

          <div className="lp-ai__gate">
            <div className="lp-ai__lock" aria-hidden="true">🔒</div>
            <h3 className="lp-ai__title">Còn 4 lớp phân tích chi tiết</h3>
            <p className="lp-ai__sub">
              Thanh khoản, dòng tiền khối ngoại, giao dịch nội bộ và tin tức — kèm biểu đồ từng lớp,
              cho mọi mã bạn theo dõi.
            </p>
            <div className="lp-ai__feats">
              <span className="lp-chip">L1–L6 đầy đủ</span>
              <span className="lp-chip">Mọi mã bạn giữ</span>
              <span className="lp-chip">Tặng 7 ngày Premium</span>
            </div>
            {isAuthenticated ? (
              <Link to="/co-phieu/VCB" className="lp-btn lp-btn--primary lp-btn--lg">
                Mở phân tích đầy đủ cho VCB →
              </Link>
            ) : (
              <button className="lp-btn lp-btn--primary lp-btn--lg" onClick={onRegister}>
                Đăng ký miễn phí để mở khóa →
              </button>
            )}
            <div className="lp-ai__note lp-mono">Miễn phí · Không cần thẻ · 30 giây</div>
          </div>
        </div>
      </div>

      <style>{`
        .lp-ai { overflow: hidden; }
        .lp-ai__body { padding: 18px 20px 4px; }
        .lp-ai__gate {
          border-top: 1px solid var(--lp-border);
          background: var(--lp-bg-2);
          padding: 26px 22px;
          text-align: center;
        }
        .lp-ai__lock {
          width: 46px; height: 46px; margin: 0 auto 12px; display: grid; place-items: center;
          font-size: 22px; border-radius: 13px;
          background: var(--lp-azure-soft); border: 1px solid var(--lp-azure-line);
        }
        .lp-ai__title { font-size: 19px; font-weight: 800; color: var(--lp-t1); margin-bottom: 8px; }
        .lp-ai__sub {
          font-size: 14px; line-height: 1.55; color: var(--lp-t2);
          max-width: 46ch; margin: 0 auto 16px;
        }
        .lp-ai__feats { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-bottom: 18px; }
        .lp-ai__note { font-size: 12px; color: var(--lp-t3); margin-top: 11px; }
      `}</style>
    </section>
  )
}
