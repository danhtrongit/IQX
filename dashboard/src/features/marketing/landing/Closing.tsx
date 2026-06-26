import { Link } from "react-router"

export function Closing({ onRegister }: { onRegister: () => void }) {
  return (
    <>
      {/* ── PART 1 · final CTA band ── */}
      <section className="lp-section">
        <div className="lp-wrap">
          <div className="lp-close__cta lp-reveal">
            <h2 className="lp-h2">Bắt đầu đọc thị trường như một tổ chức.</h2>
            <p className="lp-lead lp-close__lead">
              Bản tin mỗi phiên + phân tích AI 6 lớp cho từng mã. Tạo tài khoản miễn phí, tặng ngay 7
              ngày Premium — không cần thẻ.
            </p>
            <button className="lp-btn lp-btn--primary lp-btn--lg" onClick={onRegister}>
              Phân tích miễn phí một mã ngay →
            </button>
            <div className="lp-close__reassure lp-mono">Miễn phí · Không cần thẻ · 30 giây</div>
          </div>
        </div>
      </section>

      {/* ── PART 2 · footer ── */}
      <footer className="lp-footer">
        <div className="lp-wrap">
          <div className="lp-footer__grid">
            <div className="lp-footer__col lp-close__brand">
              <span className="lp-logo">
                <span className="lp-logo__mark">IQ</span>IQX
              </span>
              <p className="lp-close__tagline">Trợ lý phân tích chứng khoán Việt Nam.</p>
              <p className="lp-close__bot lp-mono">Bot cảnh báo: @IQX_Alert_BOT</p>
            </div>

            <div className="lp-footer__col">
              <h4>Sản phẩm</h4>
              <Link to="/co-phieu">AI Phân tích</Link>
              <Link to="/bang-gia">Bảng giá</Link>
              <Link to="/chien-luoc?tab=backtest">Strategy Lab</Link>
              <Link to="/chien-luoc?tab=canh-bao">Cảnh báo</Link>
              <Link to="/bai-hoc">Bài học</Link>
            </div>

            <div className="lp-footer__col">
              <h4>Khám phá</h4>
              <a href="#demo">Phân tích AI</a>
              <a href="#thi-truong">Thị trường</a>
              <a href="#tinh-nang">Tính năng</a>
              <a href="#gia">Bảng giá</a>
            </div>

            <div className="lp-footer__col">
              <h4>Tài khoản</h4>
              <a href="#" className="lp-close__linkbtn" onClick={(e) => { e.preventDefault(); onRegister() }}>
                Đăng ký miễn phí
              </a>
              <Link to="/nang-cap">Nâng cấp Premium</Link>
            </div>
          </div>

          <div className="lp-footer__disc">
            Thông tin và phân tích trên IQX mang tính tham khảo, được tạo bằng công cụ phân tích tự
            động, <b>không phải khuyến nghị mua/bán</b> và không đảm bảo lợi nhuận. Nhà đầu tư tự chịu
            trách nhiệm cho quyết định của mình. Số liệu minh hoạ theo phiên 19/06/2026.
            <br />
            © 2026 IQX · iqx.vn
          </div>
        </div>
      </footer>

      <style>{`
        .lp-close__cta {
          max-width: 760px;
          margin-inline: auto;
          text-align: center;
          padding: clamp(36px, 6vw, 64px) clamp(22px, 5vw, 56px);
          background: linear-gradient(180deg, var(--lp-azure-soft), var(--lp-panel));
          border: 1px solid var(--lp-azure-line);
          border-radius: var(--lp-r-lg);
          box-shadow: var(--lp-shadow-sm);
        }
        .lp-close__lead {
          max-width: 46ch;
          margin: 16px auto 26px;
        }
        .lp-close__reassure {
          margin-top: 16px;
          font-size: 12.5px;
          color: var(--lp-t3);
        }

        .lp-close__brand .lp-logo { margin-bottom: 14px; }
        .lp-close__tagline {
          font-size: 14px;
          line-height: 1.6;
          color: var(--lp-t3);
          max-width: 30ch;
          margin-bottom: 10px;
        }
        .lp-close__bot {
          font-size: 12.5px;
          color: var(--lp-t3);
        }

        .lp-close__linkbtn {
          appearance: none;
          background: none;
          border: 0;
          cursor: pointer;
          font: inherit;
          text-align: left;
        }
      `}</style>
    </>
  )
}
