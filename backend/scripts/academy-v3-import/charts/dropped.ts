/**
 * Biểu đồ của bản mẫu chưa được port sang mô hình chart của backend.
 *
 * Mỗi mục ghi rõ lý do: bản mẫu vẽ SVG tự do (khung vẽ, thẻ, đường cong pixel) mà mô hình
 * `series_panels` / `category` / `compare` không diễn đạt được trọn vẹn. Biểu đồ bị bỏ khỏi
 * nội dung bài (phần còn lại của bài giữ nguyên), và lý do được ghi vào
 * `import-manifest.json` (`warnings`) để không lặp lại công việc này.
 *
 * Hiện danh sách trống: toàn bộ biểu đồ của bản mẫu (Chương 1-13, gồm 33 biểu đồ đại diện)
 * đã được port sang mô hình chart của backend. Cơ chế này giữ lại để ghi nhận biểu đồ nào
 * thật sự không map được, thay vì im lặng bỏ đi.
 */
export const DROPPED_CHARTS: Readonly<Record<string, string>> = {};
