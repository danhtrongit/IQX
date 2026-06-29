import { useState } from "react"
import { Button, Modal } from "@arco-design/web-react"
import { IconFile } from "@arco-design/web-react/icon"
import { PremiumGate } from "@/features/premium"
import { PortfolioReport } from "./PortfolioReport"

export function PortfolioAnalysisButton() {
  const [reportOpen, setReportOpen] = useState(false)

  return (
    <>
      <Button
        type="primary"
        size="small"
        icon={<IconFile />}
        onClick={() => setReportOpen(true)}
      >
        Phân tích danh mục
      </Button>

      <Modal
        visible={reportOpen}
        onCancel={() => setReportOpen(false)}
        footer={null}
        title={null}
        style={{ width: "min(760px, 96vw)", top: 20 }}
        autoFocus={false}
      >
        <div style={{ maxHeight: "86vh", overflowY: "auto" }}>
          {reportOpen && (
            <PremiumGate
              featureName="Phân tích danh mục"
              description="Báo cáo phân tích danh mục theo giọng người quản lý quỹ."
              onAuthRequested={() => setReportOpen(false)}
            >
              <PortfolioReport />
            </PremiumGate>
          )}
        </div>
      </Modal>
    </>
  )
}
