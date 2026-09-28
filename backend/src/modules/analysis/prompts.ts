/**
 * Versioned prompts are application source, not mutable deployment files.
 * Updating one requires changing its version so cached outputs cannot cross a
 * prompt boundary. These prompts preserve the contracts of the legacy prompt
 * templates while making the JSON-only requirements machine-verifiable.
 */
export type AnalysisPromptKind = 'dashboard' | 'industry' | 'insight' | 'bctc' | 'bctc-narrative';

export interface VersionedPrompt {
  version: string;
  text: string;
}

const COMMON = `Bạn là chuyên gia phân tích thị trường chứng khoán Việt Nam. Chỉ sử dụng dữ liệu trong JSON đầu vào. Không bịa số, không tự suy diễn dữ liệu còn thiếu và nói rõ khi dữ liệu không đủ. Phân biệt dữ kiện với nhận định. Nội dung chỉ mang tính thông tin, không phải khuyến nghị đầu tư.`;

export const ANALYSIS_PROMPTS: Readonly<Record<AnalysisPromptKind, VersionedPrompt>> = {
  dashboard: {
    version: 'dashboard-v2.1.0',
    text: `${COMMON}\nViết phân tích thị trường bằng ngôn ngữ được yêu cầu, ngắn gọn và có cấu trúc: trạng thái chỉ số, thanh khoản, độ rộng, dòng tiền ngoại/tự doanh, nhóm ngành và rủi ro. Không nêu số không có trong payload. Trả về văn bản thuần, không markdown fence.`,
  },
  industry: {
    version: 'industry-v2.1.0',
    text: `${COMMON}\nPhân tích đúng ngành ICB trong payload. Trình bày 8 ý: trạng thái, hiệu suất, thanh khoản, độ rộng, cổ phiếu dẫn dắt, điểm yếu, cơ hội và rủi ro. Không biến tương quan thành quan hệ nhân quả. Trả về văn bản thuần, không markdown fence.`,
  },
  insight: {
    version: 'insight-v2.2.0',
    text: `${COMMON}\nTrả về duy nhất JSON hợp lệ, không markdown. Bắt buộc có L1..L6. L1={xu_huong,statusLabel,ho_tro,khang_cu,da_gia,diff}; L2={thanh_khoan,statusLabel,cung_cau,tac_dong,diff}; L3={khoi_ngoai,tu_doanh,statusLabel,diff}; L4={noi_bo,khoi_luong_tong,statusLabel,diff}; L5={tong_quan,statusLabel,tin_material,tin_filler,tac_dong,diff}; L6={trend,status,timeframe,narrative,diff,observations,watchLevels,recommendation}. observations có liquidity,moneyFlow,insider,news,supportResistance. watchLevels là mảng {tag,description}. recommendation chỉ được là Chờ điểm mua, Có thể mua thử, Quan sát thêm, Nên giảm bớt hoặc Bán bớt. Mọi con số phải xuất hiện nguyên văn trong input. So sánh phiên trước chỉ khi previousInsight có dữ liệu.`,
  },
  bctc: {
    version: 'bctc-v2.1.0',
    text: `${COMMON}\nTrả về duy nhất JSON {"memo":string,"modules":Record<string,string>}. Chỉ diễn giải các chỉ tiêu BCTC đã được hệ thống tính sẵn. Mỗi số trong output phải có trong payload. Không tự tính tỷ lệ mới. Không dùng lời khuyên mua/bán/giữ.`,
  },
  'bctc-narrative': {
    version: 'bctc-narrative-v2.1.0',
    text: `${COMMON}\nViết cho nhà đầu tư cá nhân Việt Nam không chuyên. Chỉ dùng số có trong input; không tự tính. Cấm các tên mô hình Altman, Z-score, Piotroski, F-score, Beneish, M-score, DuPont, Sloan, accrual. Cấm khuyến nghị mua/bán/giữ. Trả về JSON duy nhất gồm verdict_oneliner, story={lead,paragraphs đúng 3 phần,strengths,watchlist}, blocks. Template A dùng blocks valuation,financial,business,cashflow,health{sub a,b,c},dividend. Template B dùng valuation,financial,earning,efficiency,asset_quality{sub a,b},dividend. Mỗi block có answer không rỗng.`,
  },
};

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ASSET_FILES: Record<AnalysisPromptKind, string> = {
  dashboard: 'ai-dashboard.md',
  industry: 'ai-industry.md',
  insight: 'ai-insight.md',
  bctc: 'ai-bctc.md',
  'bctc-narrative': 'ai-bctc-narrative.md',
};

/** Prompt assets are required deployable resources; never silently change prompts in production. */
export function promptFor(kind: AnalysisPromptKind): VersionedPrompt {
  const configured = ANALYSIS_PROMPTS[kind];
  const fileName = ASSET_FILES[kind];
  const candidates = [
    join(dirname(new URL(import.meta.url).pathname), 'prompts', fileName),
    join(process.cwd(), 'src/modules/analysis/prompts', fileName),
  ];
  const assetPath = candidates.find((candidate) => existsSync(candidate));
  if (!assetPath) {
    throw new Error(`Required AI prompt asset is missing: ${fileName}`);
  }
  try {
    const text = readFileSync(assetPath, 'utf8').trim();
    if (!text) throw new Error('asset is empty');
    return { ...configured, text: `${text}\n\n${configured.text}` };
  } catch (error) {
    throw new Error(`Unable to load required AI prompt asset: ${fileName}`, { cause: error });
  }
}
