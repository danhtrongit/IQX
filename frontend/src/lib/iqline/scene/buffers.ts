/**
 * Bộ đệm số tăng dần, dùng lại giữa các khung hình để kéo và zoom không tạo rác (bản thử Giai đoạn 0). Mỗi lệnh
 * vẽ trong cùng một cảnh phải dùng khoá riêng; lệnh cũ bị ghi đè ở lần dựng cảnh kế tiếp.
 */
export class Buffers {
  private pool = new Map<string, Float64Array>()

  get(key: string, size: number): Float64Array {
    const current = this.pool.get(key)
    if (current && current.length >= size) return current
    const next = new Float64Array(Math.max(size, (current?.length ?? 0) * 2, 256))
    this.pool.set(key, next)
    return next
  }
}
