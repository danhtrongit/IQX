/** Màn học một bài (6 bước). Bản giữ chỗ: tác vụ "lesson player" thay bằng bản đầy đủ, giữ nguyên props. */
export interface LessonPlayerProps {
  lessonId: string
  /** Chế độ xem trước: chạy hoàn toàn ở máy khách, không gọi API, không lưu tiến độ, không thưởng xu. */
  preview: boolean
  /** Thoát (nút ✕): không lưu tiến độ bài đang học. */
  onExit: () => void
  /** Gọi khi người học đóng màn kết thúc bài (sau khi server đã ghi nhận ở chế độ thật). */
  onFinished?: () => void
}

export function LessonPlayer({ lessonId, onExit }: LessonPlayerProps) {
  return (
    <div className="p-4">
      <button type="button" onClick={onExit}>
        Thoát
      </button>
      <p>Bài {lessonId}</p>
    </div>
  )
}
