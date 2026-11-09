import { describe, expect, it, vi } from 'vitest';

import {
  FB_CARDS_DETECTOR_TTL_MS,
  FlashbackRoomCards,
} from '../../src/modules/flashback/flashback-rooms.cards.js';
import type { FbMatchRow } from '../../src/modules/flashback/flashback-rooms.repository.js';
import {
  FlashbackRoomsService,
  type FbDatasetPort,
} from '../../src/modules/flashback/flashback-rooms.service.js';
import { MemoryDatasetRepository } from './helpers/flashback-dataset-memory.js';
import { MemoryPatternsRepository } from './helpers/flashback-patterns-memory.js';
import { MemoryRoomsRepository, memoryDatabase } from './helpers/flashback-rooms-memory.js';
import {
  T0,
  makeDataset,
  playTo,
  rising,
  roomOf,
  type Harness,
} from './helpers/flashback-rooms-fixtures.js';

const VERSION = 1;
const START_IDX = 100;
const WARMUP = 252;
const VIEW = 60;
/** Phiên chơi k của ván ứng với idx này trong kho (v1.3 §5). */
const idxOfStep = (step: number) => START_IDX + WARMUP + VIEW + step - 1;

function cardsSetup(options: { withDatasetCut?: boolean } = {}) {
  const withCut = options.withDatasetCut ?? true;
  const repository = new MemoryRoomsRepository();
  const clock = { at: new Date(T0) };
  const datasets = new MemoryDatasetRepository(() => T0);
  const patterns = new MemoryPatternsRepository(datasets, () => T0);
  const cards = new FlashbackRoomCards(patterns);
  const dataset: FbDatasetPort = {
    pick: async (_now, viewBars, playBars) => ({
      ...makeDataset('FPT', viewBars, playBars, rising(viewBars)),
      ...(withCut ? { datasetVersion: VERSION, startIdx: START_IDX } : {}),
    }),
  };
  const service = new FlashbackRoomsService(
    memoryDatabase(),
    repository,
    dataset,
    { now: () => clock.at },
    undefined,
    cards,
  );
  const advance = (ms: number) => {
    clock.at = new Date(clock.at.getTime() + ms);
  };
  patterns.seedRun({ version: VERSION, detectorVersion: 1 });
  /** Mẫu tính sẵn của mã FPT tại các phiên chơi cho trước. */
  const seedPatterns = (byStep: Record<number, { id: string; n: number }>, detector = 1) => {
    for (const [step, card] of Object.entries(byStep)) {
      patterns.seedPattern(VERSION, 'FPT', detector, {
        idx: idxOfStep(Number(step)),
        date: '2026-01-02',
        cardId: card.id,
        cardN: card.n,
        tier: 1,
      });
    }
  };
  const harness = { repository, service, advance, clock } as unknown as Harness;
  const start = async (users: string[]) => {
    const room = await roomOf(harness, users);
    const started = await service.startRoom(users[0]!, room.id);
    return started.match.match_id;
  };
  return { repository, service, patterns, cards, harness, advance, seedPatterns, start, datasets };
}

describe('Flashback · tra thẻ nến tính sẵn khi bấm Phiên tiếp (Candle Dojo v1.3 §5)', () => {
  it('chưa có thẻ nào: card luôn null, bảng thẻ của ván trống, snapshot có cards rỗng', async () => {
    const t = cardsSetup();
    t.seedPatterns({ 2: { id: 'bua', n: 1 }, 4: { id: 'marubozu_tang', n: 1 } });
    const matchId = await t.start(['a']);
    expect((await t.service.matchSnapshot('a', matchId)).cards).toEqual([]);
    for (let step = 1; step <= 5; step += 1) {
      const response = await t.service.next('a', matchId);
      expect(response.card).toBeNull();
      expect(Object.keys(response)).toEqual(expect.arrayContaining(['bar', 'me', 'card']));
    }
    expect(t.patterns.matchCardRows).toEqual([]);
    expect((await t.service.matchSnapshot('a', matchId)).cards).toEqual([]);
  });

  it('có thẻ: phiên có mẫu trả card {id, n} cùng nến, ghi thẻ của ván và "Đã gặp"; phiên không có mẫu là null', async () => {
    const t = cardsSetup();
    t.seedPatterns({ 2: { id: 'bua', n: 1 }, 4: { id: 'ba_pp_tang', n: 5 } });
    t.patterns.own('a', 'bua');
    t.patterns.own('a', 'ba_pp_tang');
    const matchId = await t.start(['a']);

    const shown: Array<{ id: string; n: number } | null> = [];
    for (let step = 1; step <= 5; step += 1) shown.push((await t.service.next('a', matchId)).card);
    expect(shown).toEqual([null, { id: 'bua', n: 1 }, null, { id: 'ba_pp_tang', n: 5 }, null]);
    expect(t.patterns.matchCardRows.map((row) => [row.playIdx, row.cardId, row.cardN])).toEqual([
      [2, 'bua', 1],
      [4, 'ba_pp_tang', 5],
    ]);
    expect(t.patterns.owned.get('a:bua')).toEqual(T0);
    expect(t.patterns.owned.get('a:ba_pp_tang')).toEqual(T0);

    // Vào lại ván / tải lại trang: dựng lại đúng khối "Thẻ trong ván".
    const snapshot = await t.service.matchSnapshot('a', matchId);
    expect(snapshot.cards).toEqual([
      { play_idx: 2, card_id: 'bua', card_n: 1 },
      { play_idx: 4, card_id: 'ba_pp_tang', card_n: 5 },
    ]);
  });

  it('phiên của ván ↔ idx của kho: idx = start_idx + 252 + H + k − 1, và phần phiên xem không bao giờ được tra', async () => {
    const t = cardsSetup();
    // Một mẫu nằm trong phần phiên xem (idx 360) và một ở Phiên 1 (idx 412).
    t.patterns.seedPattern(VERSION, 'FPT', 1, { idx: START_IDX + WARMUP + 8, date: '2026-01-02', cardId: 'bua', cardN: 1, tier: 1 });
    t.seedPatterns({ 1: { id: 'doji', n: 1 } });
    t.patterns.own('a', 'bua');
    t.patterns.own('a', 'doji');
    const lookups: number[] = [];
    const patternAt = t.patterns.patternAt.bind(t.patterns);
    vi.spyOn(t.patterns, 'patternAt').mockImplementation(async (version, symbol, idx, detector) => {
      lookups.push(idx);
      return patternAt(version, symbol, idx, detector);
    });
    const matchId = await t.start(['a']);
    const first = await t.service.next('a', matchId);
    expect(first.card).toEqual({ id: 'doji', n: 1 });
    await t.service.next('a', matchId);
    expect(lookups).toEqual([idxOfStep(1), idxOfStep(2)]);
    expect(lookups[0]).toBe(412);
    expect(lookups.every((idx) => idx >= START_IDX + WARMUP + VIEW)).toBe(true);
  });

  it('mỗi người một kết quả theo kho thẻ của mình: người có thẻ thấy, người chưa có không thấy gì', async () => {
    const t = cardsSetup();
    t.seedPatterns({ 1: { id: 'bua', n: 1 } });
    t.patterns.own('a', 'bua');
    const matchId = await t.start(['a', 'b']);
    expect((await t.service.next('a', matchId)).card).toEqual({ id: 'bua', n: 1 });
    expect((await t.service.next('b', matchId)).card).toBeNull();
    expect((await t.service.matchSnapshot('a', matchId)).cards).toHaveLength(1);
    expect((await t.service.matchSnapshot('b', matchId)).cards).toEqual([]);
  });

  it('mua thẻ giữa ván có hiệu lực từ lần bấm Phiên tiếp kế tiếp, không hiện bù cho các phiên đã qua', async () => {
    const t = cardsSetup();
    t.seedPatterns({
      2: { id: 'bua', n: 1 },
      4: { id: 'marubozu_tang', n: 1 },
      5: { id: 'bua', n: 1 },
    });
    const matchId = await t.start(['a']);
    await playTo(t.harness, 'a', matchId, 3);
    expect(t.patterns.matchCardRows).toEqual([]);

    t.patterns.own('a', 'bua');
    t.patterns.own('a', 'marubozu_tang');
    expect((await t.service.next('a', matchId)).card).toEqual({ id: 'marubozu_tang', n: 1 });
    expect((await t.service.next('a', matchId)).card).toEqual({ id: 'bua', n: 1 });
    // Phiên 2 (đã qua trước khi mua) không được hiện bù.
    expect((await t.service.matchSnapshot('a', matchId)).cards.map((card) => card.play_idx)).toEqual([4, 5]);
  });

  it('snapshot chỉ gồm thẻ của phiên đã mở: thẻ ở phiên sau phiên của tôi không bao giờ lộ', async () => {
    const t = cardsSetup();
    t.patterns.own('a', 'bua');
    const matchId = await t.start(['a']);
    await playTo(t.harness, 'a', matchId, 3);
    t.patterns.matchCardRows.push({ matchId, userId: 'a', playIdx: 10, cardId: 'bua', cardN: 1 });
    expect((await t.service.matchSnapshot('a', matchId)).cards).toEqual([]);
  });

  it('hết giờ tự kéo tới phiên cuối: không hiện thẻ cho các phiên bị kéo qua, thẻ đã hiện vẫn còn khi xem lại', async () => {
    const t = cardsSetup();
    t.seedPatterns({ 2: { id: 'bua', n: 1 }, 20: { id: 'bua', n: 1 } });
    t.patterns.own('a', 'bua');
    const matchId = await t.start(['a']);
    await playTo(t.harness, 'a', matchId, 3);
    t.advance(10 * 60 * 60_000);
    const snapshot = await t.service.matchSnapshot('a', matchId);
    expect(snapshot.cards).toEqual([{ play_idx: 2, card_id: 'bua', card_n: 1 }]);
    expect(snapshot.played_bars).toHaveLength(30);
  });

  it('ván không cắt từ kho (không có dataset_version / start_idx): luôn không có thẻ và không tra bảng', async () => {
    const t = cardsSetup({ withDatasetCut: false });
    t.seedPatterns({ 1: { id: 'bua', n: 1 } });
    t.patterns.own('a', 'bua');
    const matchId = await t.start(['a']);
    expect((await t.service.next('a', matchId)).card).toBeNull();
    expect(t.patterns.calls.patternAt).toBe(0);
  });

  it('chưa có lần tính done: ván vẫn chơi bình thường, chưa có thẻ; xong rồi thì hiện (sau khi hết ghi nhớ)', async () => {
    const t = cardsSetup();
    t.patterns.runs.length = 0;
    t.seedPatterns({ 1: { id: 'bua', n: 1 }, 2: { id: 'bua', n: 1 } });
    t.patterns.own('a', 'bua');
    const matchId = await t.start(['a']);
    expect((await t.service.next('a', matchId)).card).toBeNull();
    t.patterns.seedRun({ version: VERSION, detectorVersion: 1 });
    t.cards.invalidate();
    expect((await t.service.next('a', matchId)).card).toEqual({ id: 'bua', n: 1 });
  });

  it('lỗi khi tra (CSDL, bảng chưa có) không làm hỏng ván: nến vẫn trả, card là null', async () => {
    const t = cardsSetup();
    t.patterns.own('a', 'bua');
    vi.spyOn(t.patterns, 'patternAt').mockRejectedValue(new Error('relation "fb_dataset_patterns" does not exist'));
    const matchId = await t.start(['a']);
    const response = await t.service.next('a', matchId);
    expect(response.card).toBeNull();
    expect(response.bar).toMatchObject({ session: 1 });
    expect(response.me.step).toBe(1);
  });

  it('lỗi đọc thẻ của ván: snapshot vẫn trả đủ, cards rỗng', async () => {
    const t = cardsSetup();
    const matchId = await t.start(['a']);
    vi.spyOn(t.patterns, 'matchCards').mockRejectedValue(new Error('boom'));
    expect((await t.service.matchSnapshot('a', matchId)).cards).toEqual([]);
  });

  it('không lộ mã, ngày thật hay nến tương lai: phản hồi next và snapshot chỉ thêm card_id/play_idx', async () => {
    const t = cardsSetup();
    t.seedPatterns({ 1: { id: 'bua', n: 1 }, 7: { id: 'marubozu_tang', n: 1 } });
    t.patterns.own('a', 'bua');
    t.patterns.own('a', 'marubozu_tang');
    const matchId = await t.start(['a']);
    const next = await t.service.next('a', matchId);
    const snapshot = await t.service.matchSnapshot('a', matchId);
    const text = JSON.stringify({ next, snapshot }, (_key, value) =>
      typeof value === 'bigint' ? value.toString() : value,
    );
    expect(text).not.toContain('FPT');
    expect(text).not.toContain('marubozu_tang'); // phiên 7 chưa mở
    expect(text).not.toContain('2026-01-02');
    expect(text).not.toContain('"idx"');
    expect(snapshot.cards).toEqual([{ play_idx: 1, card_id: 'bua', card_n: 1 }]);
  });
});

describe('FlashbackRoomCards · quy tắc tra', () => {
  const matchOf = (over: Partial<FbMatchRow> = {}): FbMatchRow =>
    ({
      id: 'm1',
      symbol: 'FPT',
      viewBars: VIEW,
      playBars: 30,
      warmupBars: new Array(WARMUP).fill({}),
      datasetVersion: VERSION,
      startIdx: START_IDX,
      ...over,
    }) as unknown as FbMatchRow;

  function setup() {
    const datasets = new MemoryDatasetRepository(() => T0);
    const patterns = new MemoryPatternsRepository(datasets, () => T0);
    const cards = new FlashbackRoomCards(patterns);
    patterns.own('u', 'bua');
    patterns.seedPattern(VERSION, 'FPT', 1, { idx: idxOfStep(5), date: '2026-01-02', cardId: 'bua', cardN: 1, tier: 1 });
    patterns.seedPattern(VERSION, 'FPT', 2, { idx: idxOfStep(5), date: '2026-01-02', cardId: 'bua', cardN: 1, tier: 1 });
    patterns.seedPattern(VERSION, 'FPT', 2, { idx: idxOfStep(6), date: '2026-01-03', cardId: 'bua', cardN: 1, tier: 1 });
    return { patterns, cards };
  }

  it('bước ngoài 1..P (phiên xem hoặc quá phiên cuối) và dữ liệu cắt thiếu: không tra', async () => {
    const { patterns, cards } = setup();
    patterns.seedRun({ version: VERSION, detectorVersion: 1 });
    for (const step of [0, -1, 31, 1.5]) {
      expect(await cards.cardAt({ match: matchOf(), userId: 'u', step })).toBeNull();
    }
    expect(await cards.cardAt({ match: matchOf({ datasetVersion: null }), userId: 'u', step: 5 })).toBeNull();
    expect(await cards.cardAt({ match: matchOf({ startIdx: null }), userId: 'u', step: 5 })).toBeNull();
    expect(patterns.calls.patternAt).toBe(0);
    expect(await cards.cardAt({ match: matchOf(), userId: 'u', step: 5 })).toEqual({ id: 'bua', n: 1 });
  });

  it('lần tính done mới nhất được ghi nhớ một phút; hết hạn hoặc invalidate thì đọc lại', async () => {
    const { patterns, cards } = setup();
    patterns.seedRun({ version: VERSION, detectorVersion: 1 });
    await cards.cardAt({ match: matchOf({ id: 'm1' }), userId: 'u', step: 5, now: 0 });
    await cards.cardAt({ match: matchOf({ id: 'm2' }), userId: 'u', step: 5, now: FB_CARDS_DETECTOR_TTL_MS - 1 });
    expect(patterns.calls.latestDoneRun).toBe(1);
    await cards.cardAt({ match: matchOf({ id: 'm3' }), userId: 'u', step: 5, now: FB_CARDS_DETECTOR_TTL_MS });
    expect(patterns.calls.latestDoneRun).toBe(2);
    cards.invalidate();
    await cards.cardAt({ match: matchOf({ id: 'm4' }), userId: 'u', step: 5, now: FB_CARDS_DETECTOR_TTL_MS });
    expect(patterns.calls.latestDoneRun).toBe(3);
  });

  it('một ván dùng một bộ nhận diện từ lần tra đầu tới hết ván, dù lần tính mới (bộ khác) đã xong', async () => {
    const { patterns, cards } = setup();
    patterns.seedRun({ version: VERSION, detectorVersion: 1 });
    // Ván cũ tra lần đầu với bộ 1 → ghim.
    expect(await cards.cardAt({ match: matchOf({ id: 'old' }), userId: 'u', step: 5 })).toEqual({ id: 'bua', n: 1 });
    // Bộ 2 xong: có mẫu ở phiên 6 mà bộ 1 không có.
    patterns.seedRun({ version: VERSION, detectorVersion: 2 });
    cards.invalidate();
    expect(await cards.cardAt({ match: matchOf({ id: 'old' }), userId: 'u', step: 6 })).toBeNull();
    // Ván mới dùng bộ 2.
    expect(await cards.cardAt({ match: matchOf({ id: 'new' }), userId: 'u', step: 6 })).toEqual({ id: 'bua', n: 1 });
  });

  it('thẻ đã hiện được ghi một lần cho mỗi phiên: bấm lặp không tạo dòng trùng', async () => {
    const { patterns, cards } = setup();
    patterns.seedRun({ version: VERSION, detectorVersion: 1 });
    await cards.cardAt({ match: matchOf(), userId: 'u', step: 5 });
    await cards.cardAt({ match: matchOf(), userId: 'u', step: 5 });
    expect(patterns.matchCardRows).toHaveLength(1);
  });
});
