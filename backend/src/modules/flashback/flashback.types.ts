import type { FlashbackRoundStatus } from './flashback.constants.js';

/** Một nến ngày đã điều chỉnh (server-only: có ngày thật). */
export interface FlashbackBar {
  /** Ngày phiên thật, chỉ ở server. */
  readonly d: string;
  readonly o: number;
  readonly h: number;
  readonly l: number;
  readonly c: number;
  readonly v: number;
}

/** Nến gửi cho trình duyệt: không có ngày, không có mã. */
export interface PublicFlashbackBar {
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

/** Một chỉ báo đã lưu trong lượt chơi. */
export interface FlashbackIndicatorInstance {
  readonly id: string;
  /** Tham số theo đúng key của registry; giá trị có thể là số hoặc cặp ngưỡng dưới/trên. */
  readonly params: Record<string, number | { lower: number; upper: number }>;
}

/** Bản ghi đề (round) đọc từ kho. */
export interface FlashbackRoundRow {
  readonly id: string;
  readonly roundNo: number;
  readonly status: FlashbackRoundStatus;
  readonly symbol: string;
  readonly startDate: string;
  readonly warmupBars: readonly FlashbackBar[];
  readonly bars: readonly FlashbackBar[];
  readonly scheduledOpenAt: Date;
  readonly opensAt: Date | null;
  readonly closesAt: Date | null;
  readonly fallbackLevel: number;
  readonly createdAt: Date;
  /** Lúc đề chuyển trạng thái gần nhất (dùng để cảnh báo đề closed quá 1 giờ chưa paid). */
  readonly updatedAt: Date;
}

/** Bản ghi lượt chơi đọc từ kho. */
export interface FlashbackEntryRow {
  readonly id: string;
  readonly roundId: string;
  readonly userId: string;
  readonly joinedAt: Date;
  readonly feeXu: number;
  readonly firstJoin: boolean;
  readonly indicatorParams: readonly FlashbackIndicatorInstance[];
  readonly step: number;
  readonly cash: bigint;
  readonly initialCash: bigint;
  readonly finishedAt: Date | null;
  readonly finalNav: bigint | null;
  readonly pnlPct: number | null;
  readonly maxDrawdown: number | null;
  readonly rank: number | null;
  readonly rewardXu: number;
  readonly status: 'playing' | 'finished';
}

/** Bản ghi lượt chơi kèm thông tin người chơi (dùng cho bảng xếp hạng). */
export interface FlashbackLeaderboardEntry extends FlashbackEntryRow {
  readonly username: string;
  readonly phoneVerified: boolean;
  readonly accountCreatedAt: Date;
}

/** Bản ghi lô cổ phiếu đọc từ kho. */
export interface FlashbackLotRow {
  readonly id: string;
  readonly entryId: string;
  readonly qty: number;
  readonly price: bigint;
  readonly step: number;
  readonly sellableStep: number;
  readonly createdAt: Date;
}

/** Bản ghi lệnh đọc từ kho. */
export interface FlashbackOrderRow {
  readonly id: string;
  readonly entryId: string;
  readonly side: 'buy' | 'sell';
  readonly qty: number;
  readonly price: bigint;
  readonly step: number;
  readonly amount: bigint;
  readonly fee: bigint;
  readonly tax: bigint;
  readonly idempotencyKey: string | null;
  readonly createdAt: Date;
}

/** Dòng bảng xếp hạng (đã tính hạng và thưởng tạm thời). */
export interface FlashbackLeaderboardRow {
  readonly rank: number;
  readonly userId: string;
  readonly username: string;
  readonly pnlPct: number | null;
  readonly maxDrawdown: number | null;
  readonly finishedAt: Date | null;
  readonly step: number;
  readonly status: 'playing' | 'finished';
  readonly rewardXu: number;
  readonly isMe: boolean;
}

/** Lệnh mua/bán đã khớp. */
export type FlashbackOrderSide = 'buy' | 'sell';

/** Kết quả một lệnh trả về cho trình duyệt. */
export interface FlashbackOrderResult {
  readonly id: string;
  readonly side: FlashbackOrderSide;
  readonly qty: number;
  readonly price: string;
  readonly step: number;
  readonly amount: string;
  readonly fee: string;
  readonly tax: string;
  readonly cash: string;
  readonly holdings: number;
  readonly createdAt: string;
}
