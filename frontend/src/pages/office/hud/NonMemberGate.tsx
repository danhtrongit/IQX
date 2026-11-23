export type NonMemberGateMode = "guest" | "non-member" | "loading" | "error"

export interface NonMemberGateProps {
  mode: NonMemberGateMode
  errorMessage?: string
  onLogin?: () => void
  onRetry?: () => void
}

export function NonMemberGate({
  mode,
  errorMessage,
  onLogin,
  onRetry,
}: NonMemberGateProps) {
  return (
    <div
      className="of-gate"
      role={mode === "loading" ? "status" : "region"}
      aria-label="Khu Văn phòng IQX"
    >
      <div className="of-gate-card">
        <div className="of-gate-head">IQX · VĂN PHÒNG</div>
        <div className="of-gate-body">
          {mode === "loading" && (
            <p>Đang tải không gian làm việc Khu Văn phòng…</p>
          )}

          {mode === "guest" && (
            <>
              <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
                Đăng nhập để vào Văn phòng
              </h1>
              <p>
                Đăng nhập tài khoản IQX của bạn để truy cập không gian làm việc
                nhóm, nhiệm vụ hằng ngày và bảng điểm danh.
              </p>
              <div>
                <button
                  type="button"
                  className="of-btn is-gold"
                  onClick={onLogin}
                >
                  Đăng nhập
                </button>
              </div>
            </>
          )}

          {mode === "non-member" && (
            <>
              <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
                Bạn chưa thuộc nhóm nào
              </h1>
              <p>
                Bạn chưa thuộc nhóm nào. Liên hệ trưởng nhóm để được thêm vào
                văn phòng.
              </p>
            </>
          )}

          {mode === "error" && (
            <>
              <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
                Không tải được Khu Văn phòng
              </h1>
              <p>
                {errorMessage || "Không thể kết nối máy chủ. Vui lòng thử lại."}
              </p>
              {onRetry && (
                <div>
                  <button
                    type="button"
                    className="of-btn is-gold"
                    onClick={onRetry}
                  >
                    Thử lại
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
