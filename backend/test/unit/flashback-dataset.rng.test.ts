import { describe, expect, it, vi } from 'vitest';

/** `crypto.randomInt` thay bằng bản giả ghi lại lời gọi; mọi thứ khác của `node:crypto` giữ nguyên. */
const randomInt = vi.hoisted(() => vi.fn((max: number) => max - 1));
vi.mock('node:crypto', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:crypto')>()),
  randomInt,
}));

import { FlashbackDatasetCuts } from '../../src/modules/flashback/flashback-dataset.cuts.js';
import { healthySeries, weekdaysFrom } from './helpers/flashback-dataset-fixtures.js';
import { MemoryDatasetRepository } from './helpers/flashback-dataset-memory.js';

const NOW = new Date('2026-11-04T03:00:00.000Z');
const L = 252 + 60 + 30;

describe('FlashbackDatasetCuts · bộ sinh số ngẫu nhiên mặc định là CSPRNG', () => {
  it('chọn mã rồi điểm cắt bằng crypto.randomInt (không dùng Math.random)', async () => {
    randomInt.mockClear();
    const mathRandom = vi.spyOn(Math, 'random');
    const repository = new MemoryDatasetRepository(() => NOW);
    // AAA có 5 điểm cắt, BBB có 9 điểm cắt, CCC không có điểm cắt nào (thiếu phiên).
    repository.seedActive({
      AAA: healthySeries(weekdaysFrom('2014-01-06', L + 4)),
      BBB: healthySeries(weekdaysFrom('2014-01-06', L + 8)),
      CCC: healthySeries(weekdaysFrom('2014-01-06', L - 1)),
    });
    const cuts = new FlashbackDatasetCuts(repository);

    const picked = await cuts.pick(NOW, 60, 30);

    // Bước 1: chọn trong 2 mã có điểm cắt; bước 2: chọn trong số điểm cắt của mã đó.
    // Bản giả luôn trả max − 1 nên ra mã cuối (BBB) và điểm cắt cuối (8).
    expect(randomInt.mock.calls).toEqual([[2], [9]]);
    expect(picked).toMatchObject({ symbol: 'BBB', startIdx: 8 });
    expect(mathRandom).not.toHaveBeenCalled();
    mathRandom.mockRestore();
  });
});
