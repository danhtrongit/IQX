// ─── MarketOverviewModal ───────────────────────────────────────────────────────
// Market modal (v1.4 layout) — chỉ các thành phần MỚI:
//   MarketAnalysisArticle + MarketPulseBar + MarketTakeaway.
// Các panel chart cũ (tái dùng từ trang thị trường cũ) đã được bỏ.
// Gate: the body is mounted only when isOpen (`{isOpen && <Body/>}` inside <Modal visible={isOpen}>).

import { Modal } from "@arco-design/web-react"
import { useMarketModal } from "@/shared/contexts/market-modal-context"
import { MarketAnalysisArticle } from "./MarketAnalysisArticle"
import { MarketPulseBar } from "./MarketPulseBar"
import { MarketTakeaway } from "./MarketTakeaway"

// ─── Modal body (mounted only when open) ─────────────────────────────────────

function ModalBody() {
  return (
    <div
      style={{ maxHeight: "82vh", overflowY: "auto" }}
      className="px-1 py-2"
    >
      {/* ── AI nhận định ── */}
      <MarketAnalysisArticle />

      {/* ── Pulse summary bar ── */}
      <div className="mt-3.5">
        <MarketPulseBar />
      </div>

      {/* ── Takeaway (kịch bản + đáng quan sát) ── */}
      <MarketTakeaway />
    </div>
  )
}

// ─── Public component ─────────────────────────────────────────────────────────

export function MarketOverviewModal() {
  const { isOpen, closeMarketModal } = useMarketModal()

  return (
    <Modal
      visible={isOpen}
      onCancel={closeMarketModal}
      footer={null}
      title={null}
      style={{ width: "92vw", maxWidth: 1280 }}
      autoFocus={false}
    >
      {isOpen && <ModalBody />}
    </Modal>
  )
}
