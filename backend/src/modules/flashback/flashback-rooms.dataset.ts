/**
 * Chọn dữ liệu cho một ván phòng chơi (spec v2.2 §3, thay thế v2 §5): cắt một đoạn
 * `252 + H + P` phiên liên tục từ kho dữ liệu VN100 đang dùng.
 *
 * Toàn bộ việc chọn nằm ở `FlashbackDatasetCuts` (danh sách điểm cắt hợp lệ tính sẵn, chọn mã rồi
 * điểm cắt ngẫu nhiên đều bằng CSPRNG, không thử lại). Lớp này chỉ đổi kết quả sang dạng
 * `FbMatchDataset` mà `FlashbackRoomsService.startRoom` đang dùng. Bộ dựng đề v1 (`FlashbackRoundBuilder`)
 * không còn nằm trên đường chọn dữ liệu của phòng chơi.
 */

import { Injectable } from '@nestjs/common';

import { FlashbackDatasetCuts } from './flashback-dataset.cuts.js';
import type { FbDatasetPort, FbMatchDataset } from './flashback-rooms.service.js';

@Injectable()
export class FlashbackRoomDataset implements FbDatasetPort {
  constructor(private readonly cuts: FlashbackDatasetCuts) {}

  async pick(now: Date, viewBars: number, playBars: number): Promise<FbMatchDataset | null> {
    const cut = await this.cuts.pick(now, viewBars, playBars);
    if (!cut) return null;
    return {
      symbol: cut.symbol,
      warmupBars: cut.warmupBars,
      bars: cut.bars,
      priceSource: cut.priceSource,
      fallbackLevel: 0,
      datasetVersion: cut.datasetVersion,
      startIdx: cut.startIdx,
    };
  }
}
