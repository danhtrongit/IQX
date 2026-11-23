export interface EmptyPageStateProps {
  onOpenCatalog: () => void
}

export function EmptyPageState({ onOpenCatalog }: EmptyPageStateProps) {
  return (
    <div className="mo-empty">
      <b>Trang trống</b>
      <span>Chọn widget ở bảng bên phải để thêm vào trang.</span>
      <button type="button" className="mo-btn pri" onClick={onOpenCatalog}>
        ＋ Thêm widget
      </button>
    </div>
  )
}
