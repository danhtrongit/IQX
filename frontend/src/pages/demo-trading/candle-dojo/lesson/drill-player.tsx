/** Luyện công mỗi ngày: bước Săn nến của một bài đã học. Bản giữ chỗ, thay bằng bản đầy đủ và giữ nguyên props. */
export interface DrillPlayerProps {
  lessonId: string
  /** Chế độ xem trước: chạy ở máy khách, không gọi API, không nhận xu. */
  preview: boolean
  onExit: () => void
  /** Gọi khi người học đóng màn kết quả. */
  onFinished?: () => void
}

export function DrillPlayer({ lessonId, onExit }: DrillPlayerProps) {
  return (
    <div className="p-4">
      <button type="button" onClick={onExit}>
        Thoát
      </button>
      <p>Luyện công {lessonId}</p>
    </div>
  )
}
