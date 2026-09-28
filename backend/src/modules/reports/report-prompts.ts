import type { MarketReportPayload, ReportType } from './reports.types.js';

const PURPOSE: Record<ReportType, string> = {
  daily: 'tổng kết phiên và xây dựng các kịch bản có điều kiện cho phiên kế tiếp',
  midday:
    'đánh giá diễn biến phiên sáng, tuyệt đối không diễn đạt dữ liệu buổi sáng như dữ liệu đóng cửa',
  premarket: 'chuẩn bị trước phiên từ dữ liệu đóng cửa gần nhất, tin tức và lịch sự kiện',
};

export function buildReportPrompts(
  type: ReportType,
  payload: MarketReportPayload,
  errors: string[] = [],
) {
  const contract =
    type === 'daily'
      ? `tagline={direction:"up"|"down"|"flat"|"anomaly",marker:string,text:string}; paragraphs={structure:string,smart_money:string,market_health:string}; scenarios là mảng (có thể []) với mỗi phần tử={direction:"up"|"down",condition_html:string,outcome_html:string}; watchlist là null hoặc mảng {ticker:string,alert:boolean,reason_html:string}`
      : type === 'midday'
        ? `tagline={text:string,color:"up"|"down"|"neutral"}; paragraphs={session_structure:{status:"published",content:string},money_flow:{status:"published",content:string},market_health:{status:"pending",pending_message:string,pending_until:string}}; scenarios là mảng (có thể []) với mỗi phần tử={type:"up"|"down",condition:string,outcome:string,scope:"afternoon_session"}; watchlist là null hoặc mảng {key:string,alert_level:"normal"|"alert"|"warn",reason:string}`
        : `tagline={text:string}; paragraphs={world_paragraph?:string} (giữ {} nếu không có nguồn); scenarios là mảng (có thể []); watchlist là null hoặc mảng {level:"normal"|"alert"|"warn",content:string}; meta là object hoặc null`;
  const systemPrompt = `Bạn là biên tập viên phân tích thị trường chứng khoán Việt Nam. Nhiệm vụ: ${PURPOSE[type]}.
Chỉ sử dụng số liệu, mã, tin tức và mốc thời gian có trong payload. Không suy đoán dữ liệu thiếu, không thay null/thiếu bằng 0, không tự tạo số liệu hoặc biểu đồ số. Chỉ đưa charts/pulse/meta mở rộng khi giá trị có trong payload; giữ nguyên giá trị nguồn.
Chỉ thêm charts hoặc pulse bên trong meta, tuyệt đối không thêm ở root. Với daily, paragraphs.market_health phải có ít nhất 25 từ. Nếu chất lượng nguồn bị hạn chế, nêu phạm vi nguồn đã xác nhận và điều kiện cần kiểm chứng, không suy diễn.
Không đưa khuyến nghị mua/bán hay cam kết chắc chắn. Mọi kịch bản phải có điều kiện kiểm chứng được. Không mô tả dữ liệu buổi sáng như dữ liệu đóng cửa.
Trả về duy nhất JSON hợp lệ, không markdown, đúng cấu trúc: headline (string tối đa 80 ký tự), ${contract}, unexplained (string hoặc null), meta (object hoặc null). Không đổi tên khóa, không dùng camelCase thay cho snake_case, không thêm giá trị mặc định. Các trường nested khác chỉ được thêm khi có nguồn trong payload. Không dùng các cụm: "không có sẵn", "không có dữ liệu", "thiếu thông tin", "dữ liệu không đầy đủ", "khuyến nghị mua", "khuyến nghị bán", "chắc chắn tăng", "chắc chắn giảm".`;
  let userPrompt = `REPORT_TYPE=${type}\nPAYLOAD=${JSON.stringify(payload)}`;
  if (errors.length) userPrompt += `\nVALIDATION_ERRORS=${JSON.stringify(errors)}`;
  return { systemPrompt, userPrompt };
}
