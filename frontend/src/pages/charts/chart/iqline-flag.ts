/**
 * Công tắc bật IQLine (Canvas) cho `/bieu-do` và `/co-phieu/:symbol`. Mặc định vẫn là TradingView; trong lúc làm Giai đoạn 4 chỉ bật
 * khi URL có `?iqline=1`. Mọi nơi trong `pages/charts` hỏi công tắc này, không tự đọc URL, nên Giai đoạn 7 (đổi mặc định, thêm
 * cờ `VITE_IQLINE_OFF` để quay lại TradingView) chỉ sửa đúng hàm này.
 */
export function iqlineMarketEnabled(params: Pick<URLSearchParams, "get">): boolean {
  return params.get("iqline") === "1"
}
