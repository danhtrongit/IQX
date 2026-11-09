import { beforeEach, describe, expect, it } from 'vitest';

import {
  loadCandleDojoContent,
  type CandleDojoContent,
} from '../../src/modules/candle-dojo/candle-dojo.content.js';
import { CandleDojoService } from '../../src/modules/candle-dojo/candle-dojo.service.js';
import { CD_CARDS, CD_TIER_INFO } from '../../src/modules/candle-dojo/shared/cards.js';
import {
  CD_CATALOG_VERSION,
  CD_EXAM,
  CD_LESSONS,
  CD_REWARD_XU,
  cdLessonsOfDojo,
} from '../../src/modules/candle-dojo/shared/lessons.js';
import { MemoryShopRepository, newUserId } from './helpers/shop-memory.js';
import { DojoMemoryDatabase, MemoryCandleDojoRepository } from './helpers/candle-dojo-memory.js';

const content: CandleDojoContent = loadCandleDojoContent();

interface Rig {
  readonly db: DojoMemoryDatabase;
  readonly service: CandleDojoService;
  readonly clock: { current: Date; now(): Date };
  user(balance?: number): string;
  ledger(
    userId: string,
  ): { kind: string; delta: number; balanceAfter: number; uniqueKey: string }[];
  /** Học đủ một bài với bài làm hoàn hảo. */
  learn(userId: string, lessonId: string, options?: { perfect?: boolean }): Promise<unknown>;
  /** Mở Nhập môn và học hết các Dojo tới `dojo` (kèm thi đai). */
  reach(userId: string, dojo: number): Promise<void>;
  /** Trả lời cả đề thi một lượt, đúng `right` câu, bằng đáp án server giữ. */
  sit(
    userId: string,
    dojo: number,
    right: number,
  ): Promise<Awaited<ReturnType<CandleDojoService['answerExam']>>>;
}

function rig(): Rig {
  const db = new DojoMemoryDatabase();
  const clock = {
    current: new Date('2026-11-09T05:00:00Z'),
    now() {
      return this.current;
    },
  };
  const shop = new MemoryShopRepository();
  const service = new CandleDojoService(
    db.asDatabaseService(),
    new MemoryCandleDojoRepository(),
    shop,
    content,
    clock,
  );
  const self: Rig = {
    db,
    service,
    clock,
    user(balance = 0) {
      const userId = newUserId();
      if (balance > 0) db.state.wallets.set(userId, { balance, lastSeq: 0 });
      return userId;
    },
    ledger(userId) {
      return db.state.ledger
        .filter((row) => row.userId === userId)
        .map((row) => ({
          kind: row.kind,
          delta: row.delta,
          balanceAfter: row.balanceAfter,
          uniqueKey: row.uniqueKey,
        }));
    },
    async learn(userId, lessonId, options = {}) {
      const exercises = content.exercises.get(lessonId)!;
      const perfect = options.perfect ?? true;
      return service.completeLesson(userId, lessonId, {
        hunt: { taps: perfect ? exercises.hunt.targets.map((t) => t[0]) : [] },
        twins: exercises.twins.map((twin) => (perfect ? twin.goodSide : null)),
      });
    },
    async reach(userId, dojo) {
      await service.completeIntro(userId);
      for (let n = 1; n <= dojo; n++) {
        for (const lesson of cdLessonsOfDojo(n)) await self.learn(userId, lesson.id);
        await self.sit(userId, n, CD_EXAM.questions);
      }
    },
    async sit(userId, dojo, right) {
      const started = await service.startExam(userId, dojo);
      const attempt = db.dojo.attempts.get(started.attempt_id)!;
      let last: Awaited<ReturnType<CandleDojoService['answerExam']>> | undefined;
      for (let index = 0; index < attempt.questions.length; index++) {
        const question = attempt.questions[index]!;
        const wrong = question.options.find((option) => option !== question.answer)!;
        last = await service.answerExam(userId, started.attempt_id, {
          index,
          option: index < right ? question.answer : wrong,
        });
      }
      return last!;
    },
  };
  return self;
}

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    const response = (error as { getResponse?: () => unknown }).getResponse?.() as
      { code?: string; details?: Record<string, unknown>[] } | undefined;
    return { status: (error as { getStatus?: () => number }).getStatus?.(), ...response };
  }
  throw new Error('expected the call to be rejected');
}

let t: Rig;
beforeEach(() => {
  t = rig();
});

describe('trạng thái ban đầu', () => {
  it('người mới: chưa có đai, mọi Dojo khoá, chưa có thẻ, ví 0', async () => {
    const state = await t.service.getState(t.user());
    expect(state.progress.belt).toBe(-1);
    expect(state.progress.intro_completed).toBe(false);
    expect(state.open_lessons).toEqual([]);
    expect(state.dojos.every((dojo) => !dojo.unlocked)).toBe(true);
    expect(state.cards).toMatchObject({ total: 47, owned_count: 0 });
    expect(state.wallet.balance).toBe(0);
    expect(state.catalog_version).toBe(CD_CATALOG_VERSION);
  });
});

describe('Nhập môn', () => {
  it('đai trắng, mở Dojo 1, +100 xu đúng một lần', async () => {
    const userId = t.user();
    const first = await t.service.completeIntro(userId);
    expect(first).toMatchObject({
      belt: 0,
      reward_xu: CD_REWARD_XU.intro,
      first_time: true,
      balance: 100,
    });
    const again = await t.service.completeIntro(userId);
    expect(again).toMatchObject({ belt: 0, reward_xu: 0, first_time: false, balance: 100 });
    const state = await t.service.getState(userId);
    expect(state.progress).toMatchObject({
      belt: 0,
      belt_name: 'Đai trắng',
      intro_completed: true,
    });
    expect(state.open_lessons).toEqual([CD_LESSONS[0]!.id]);
    expect(t.ledger(userId)).toEqual([
      expect.objectContaining({ kind: 'dojo_reward', delta: 100, balanceAfter: 100 }),
    ]);
  });
});

describe('bài học', () => {
  it('từ chối khi chưa xong Nhập môn hoặc chưa xong bài trước', async () => {
    const userId = t.user();
    const [first, second] = cdLessonsOfDojo(1);
    expect(await rejection(t.learn(userId, first!.id))).toMatchObject({
      status: 409,
      code: 'LESSON_LOCKED',
    });
    await t.service.completeIntro(userId);
    expect(await rejection(t.learn(userId, second!.id))).toMatchObject({
      status: 409,
      code: 'LESSON_LOCKED',
    });
    await t.learn(userId, first!.id);
    await t.learn(userId, second!.id);
    expect(await rejection(t.learn(userId, cdLessonsOfDojo(2)[0]!.id))).toMatchObject({
      code: 'LESSON_LOCKED',
    });
  });

  it('bài không có thật trả 404', async () => {
    const userId = t.user();
    expect(await rejection(t.service.completeLesson(userId, 'khong_co', {}))).toMatchObject({
      status: 404,
      code: 'LESSON_NOT_FOUND',
    });
  });

  it('chấm lại từ dữ liệu gửi lên: 1 sao khi đi hết bài, +1 Săn nến, +1 Song sinh', async () => {
    const userId = t.user();
    await t.service.completeIntro(userId);
    const lesson = CD_LESSONS[0]!;
    const exercises = content.exercises.get(lesson.id)!;

    const bare = await t.service.completeLesson(userId, lesson.id, {});
    expect(bare).toMatchObject({ stars: 1, best_stars: 1, previous_stars: 0, reward_xu: 100 });

    // Bỏ sót mẫu: không có sao Săn nến; Song sinh đúng hết: sao thứ hai là Song sinh.
    const partial = await t.service.completeLesson(userId, lesson.id, {
      hunt: { taps: [exercises.hunt.targets[0]![0]] },
      twins: exercises.twins.map((twin) => twin.goodSide),
    });
    expect(partial).toMatchObject({
      stars: 2,
      best_stars: 2,
      previous_stars: 1,
      reward_xu: 0,
      first_time: false,
      hunt: { star: false, found: 1 },
      twins: { star: true, right: 3 },
    });

    // Chạm nhầm 2 lần thì mất sao Săn nến dù tìm đủ.
    const wrongBar = exercises.hunt.decoys[0]![0];
    const sloppy = await t.service.completeLesson(userId, lesson.id, {
      hunt: {
        taps: [...exercises.hunt.targets.map((target) => target[0]), wrongBar, wrongBar + 0],
      },
    });
    expect(sloppy.hunt.found).toBe(exercises.hunt.targets.length);

    const perfect = await t.learn(userId, lesson.id);
    expect(perfect).toMatchObject({
      stars: 3,
      best_stars: 3,
      reward_xu: 0,
      card_ids: lesson.cards,
    });
    // Sao lưu theo lần cao nhất: làm lại tệ hơn không hạ sao.
    const worse = await t.service.completeLesson(userId, lesson.id, {});
    expect(worse).toMatchObject({ stars: 1, best_stars: 3, previous_stars: 3 });
    expect((await t.service.getState(userId)).lessons[0]).toMatchObject({ stars: 3, attempts: 5 });
  });

  it('+100 xu chỉ một lần cho mỗi bài, kể cả khi gửi đồng thời', async () => {
    const userId = t.user();
    await t.service.completeIntro(userId);
    const lesson = CD_LESSONS[0]!;
    await Promise.all([
      t.learn(userId, lesson.id),
      t.learn(userId, lesson.id),
      t.learn(userId, lesson.id),
    ]);
    const rewards = t.ledger(userId).filter((row) => row.uniqueKey.includes(`lesson:${lesson.id}`));
    expect(rewards).toHaveLength(1);
    expect((await t.service.getState(userId)).wallet.balance).toBe(200);
  });

  it('lời gọi sai dạng bị từ chối ở schema (không có trường sao, đai hay thưởng)', async () => {
    const { lessonCompleteBodySchema } =
      await import('../../src/modules/candle-dojo/candle-dojo.schemas.js');
    for (const extra of [{ stars: 3 }, { belt: 5 }, { reward_xu: 999 }, { user_id: 'x' }]) {
      expect(lessonCompleteBodySchema.safeParse(extra).success).toBe(false);
    }
    expect(
      lessonCompleteBodySchema.safeParse({ hunt: { taps: [1, 2] }, twins: ['a', null, 'b'] })
        .success,
    ).toBe(true);
  });
});

describe('mua thẻ', () => {
  const card = CD_CARDS.find((item) => item.id === 'doji')!;
  const price = CD_TIER_INFO[card.tier].priceXu;
  const body = (overrides = {}) => ({
    expected_price_xu: price,
    catalog_version: CD_CATALOG_VERSION,
    ...overrides,
  });

  async function readyToBuy(balance: number) {
    const userId = t.user(balance);
    await t.service.completeIntro(userId);
    for (const lesson of cdLessonsOfDojo(1)) {
      if (lesson.cards.includes(card.id)) break;
      await t.learn(userId, lesson.id);
    }
    return userId;
  }

  it('khoá cho tới khi học xong bài của thẻ; không thu xu khi bị từ chối', async () => {
    const userId = await readyToBuy(5000);
    const before = (await t.service.getState(userId)).wallet.balance;
    expect(await rejection(t.service.purchaseCard(userId, card.id, body()))).toMatchObject({
      status: 409,
      code: 'CARD_LOCKED',
    });
    expect((await t.service.getState(userId)).wallet.balance).toBe(before);
  });

  it('mua thẻ: trừ đúng giá bậc, ghi sổ card_purchase, thẻ vào kho, không mua trùng', async () => {
    const userId = await readyToBuy(5000);
    await t.learn(userId, card.lessonId);
    const before = (await t.service.getState(userId)).wallet.balance;

    const bought = await t.service.purchaseCard(userId, card.id, body());
    expect(bought).toMatchObject({
      status: 'purchased',
      card_id: 'doji',
      name: 'Doji',
      price_xu: 300,
      balance: before - 300,
    });
    const row = t.ledger(userId).find((entry) => entry.kind === 'card_purchase')!;
    expect(row).toMatchObject({
      delta: -300,
      uniqueKey: `card:${userId}:doji`,
      balanceAfter: before - 300,
    });

    expect(await rejection(t.service.purchaseCard(userId, card.id, body()))).toMatchObject({
      status: 409,
      code: 'CARD_OWNED',
    });
    expect((await t.service.getState(userId)).wallet.balance).toBe(before - 300);
    const cards = await t.service.getCards(userId);
    expect(cards.owned_count).toBe(1);
    expect(cards.items.find((item) => item.card_id === 'doji')).toMatchObject({
      owned: true,
      seen: false,
      unlocked: true,
      price_xu: 300,
    });
    expect(cards.items.filter((item) => item.unlocked).map((item) => item.card_id)).toContain(
      'doji',
    );
  });

  it('thiếu xu: báo INSUFFICIENT_XU kèm số thiếu và không ghi gì', async () => {
    const userId = await readyToBuy(0);
    await t.learn(userId, card.lessonId); // chỉ có xu thưởng học bài, chưa đủ giá thẻ
    const wallet = t.db.state.wallets.get(userId)!;
    t.db.state.wallets.set(userId, { ...wallet, balance: 120 });
    const balance = (await t.service.getState(userId)).wallet.balance;
    expect(balance).toBe(120);
    const failure = await rejection(t.service.purchaseCard(userId, card.id, body()));
    expect(failure).toMatchObject({ status: 409, code: 'INSUFFICIENT_XU' });
    expect(failure.details?.[0]).toMatchObject({
      balance_xu: balance,
      price_xu: price,
      shortfall_xu: price - balance,
    });
    expect(t.ledger(userId).some((entry) => entry.kind === 'card_purchase')).toBe(false);
    expect((await t.service.getCards(userId)).owned_count).toBe(0);
  });

  it('giá hoặc danh mục đã đổi: xác nhận lại; thẻ lạ trả 404', async () => {
    const userId = await readyToBuy(5000);
    await t.learn(userId, card.lessonId);
    expect(
      await rejection(t.service.purchaseCard(userId, card.id, body({ expected_price_xu: 1 }))),
    ).toMatchObject({
      code: 'PRICE_CHANGED',
    });
    expect(
      await rejection(t.service.purchaseCard(userId, card.id, body({ catalog_version: 'cu' }))),
    ).toMatchObject({ code: 'CATALOG_CHANGED' });
    expect(await rejection(t.service.purchaseCard(userId, 'khong_co', body()))).toMatchObject({
      status: 404,
      code: 'CARD_NOT_FOUND',
    });
  });

  it('hai lệnh mua đồng thời chỉ trừ xu một lần', async () => {
    const userId = await readyToBuy(5000);
    await t.learn(userId, card.lessonId);
    const before = (await t.service.getState(userId)).wallet.balance;
    const results = await Promise.allSettled([
      t.service.purchaseCard(userId, card.id, body()),
      t.service.purchaseCard(userId, card.id, body()),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect((await t.service.getState(userId)).wallet.balance).toBe(before - price);
    expect(t.ledger(userId).filter((entry) => entry.kind === 'card_purchase')).toHaveLength(1);
  });

  it('mua đủ 47 thẻ khi đã học hết 27 bài: tổng xu trừ = tổng giá bộ thẻ', async () => {
    const userId = t.user(100_000);
    await t.reach(userId, 5);
    const start = (await t.service.getState(userId)).wallet.balance;
    for (const item of CD_CARDS) {
      await t.service.purchaseCard(userId, item.id, {
        expected_price_xu: CD_TIER_INFO[item.tier].priceXu,
        catalog_version: CD_CATALOG_VERSION,
      });
    }
    const total = CD_CARDS.reduce((sum, item) => sum + CD_TIER_INFO[item.tier].priceXu, 0);
    expect(total).toBe(11 * 300 + 16 * 600 + 8 * 1000 + 3 * 2000 + 9 * 3000);
    expect((await t.service.getState(userId)).wallet.balance).toBe(start - total);
    expect((await t.service.getState(userId)).cards.owned_count).toBe(47);
  });
});

describe('thi đai', () => {
  it('khoá cho tới khi mọi bài của Dojo có ≥ 1 sao', async () => {
    const userId = t.user();
    await t.service.completeIntro(userId);
    expect(await rejection(t.service.startExam(userId, 1))).toMatchObject({
      status: 409,
      code: 'EXAM_LOCKED',
    });
    const lessons = cdLessonsOfDojo(1);
    for (const lesson of lessons.slice(0, -1)) await t.learn(userId, lesson.id);
    expect(await rejection(t.service.startExam(userId, 1))).toMatchObject({ code: 'EXAM_LOCKED' });
    await t.learn(userId, lessons.at(-1)!.id, { perfect: false });
    const exam = await t.service.startExam(userId, 1);
    expect(exam).toMatchObject({
      dojo: 1,
      total: 8,
      pass_mark: CD_EXAM.passMark,
      belt_name: 'Đai vàng',
    });
    // Dojo 2 còn khoá vì chưa có đai vàng.
    expect(await rejection(t.service.startExam(userId, 2))).toMatchObject({ code: 'EXAM_LOCKED' });
  });

  it('đề do server ra: 8 câu, 4 lựa chọn, không kèm đáp án', async () => {
    const userId = t.user();
    await t.service.completeIntro(userId);
    for (const lesson of cdLessonsOfDojo(1)) await t.learn(userId, lesson.id);
    const exam = await t.service.startExam(userId, 1);
    expect(exam.questions).toHaveLength(8);
    for (const question of exam.questions) {
      expect(question.options).toHaveLength(4);
      expect(question.bars.length).toBeGreaterThan(question.n);
      expect(Object.keys(question)).not.toContain('answer');
    }
    expect(JSON.stringify(exam)).not.toMatch(/"ans"|"answer"/);
  });

  it('đúng ≥ 6/8: lên đai và +300 xu; làm lại không thưởng thêm, đai không hạ', async () => {
    const userId = t.user();
    await t.service.completeIntro(userId);
    for (const lesson of cdLessonsOfDojo(1)) await t.learn(userId, lesson.id);
    const balance = (await t.service.getState(userId)).wallet.balance;

    const pass = await t.sit(userId, 1, 6);
    expect(pass.finished).toBe(true);
    expect(pass.result).toMatchObject({
      score: 6,
      passed: true,
      belt: 1,
      belt_up: true,
      reward_xu: 300,
      balance: balance + 300,
    });
    const state = await t.service.getState(userId);
    expect(state.progress.belt).toBe(1);
    expect(state.dojos.find((dojo) => dojo.n === 2)?.unlocked).toBe(true);

    const again = await t.sit(userId, 1, 8);
    expect(again.result).toMatchObject({ passed: true, belt: 1, belt_up: false, reward_xu: 0 });
    const retakeFail = await t.sit(userId, 1, 0);
    expect(retakeFail.result).toMatchObject({ passed: false, belt: 1, reward_xu: 0 });
    expect((await t.service.getState(userId)).progress.belt).toBe(1);
    expect(t.ledger(userId).filter((row) => row.uniqueKey.endsWith('belt:1'))).toHaveLength(1);
  });

  it('đúng 5/8 thì chưa qua: không đai, không xu, thi lại không giới hạn', async () => {
    const userId = t.user();
    await t.service.completeIntro(userId);
    for (const lesson of cdLessonsOfDojo(1)) await t.learn(userId, lesson.id);
    const balance = (await t.service.getState(userId)).wallet.balance;
    const fail = await t.sit(userId, 1, 5);
    expect(fail.result).toMatchObject({
      score: 5,
      passed: false,
      belt: 0,
      belt_up: false,
      reward_xu: 0,
    });
    expect((await t.service.getState(userId)).wallet.balance).toBe(balance);
    expect((await t.sit(userId, 1, 7)).result).toMatchObject({
      passed: true,
      belt: 1,
      belt_up: true,
    });
  });

  it('mỗi câu chỉ trả lời một lần, lựa chọn phải thuộc câu, lượt cũ bị bỏ khi mở lượt mới', async () => {
    const userId = t.user();
    await t.service.completeIntro(userId);
    for (const lesson of cdLessonsOfDojo(1)) await t.learn(userId, lesson.id);
    const first = await t.service.startExam(userId, 1);
    const attempt = t.db.dojo.attempts.get(first.attempt_id)!;
    const question = attempt.questions[0]!;
    const wrong = question.options.find((option) => option !== question.answer)!;

    const answered = await t.service.answerExam(userId, first.attempt_id, {
      index: 0,
      option: wrong,
    });
    expect(answered).toMatchObject({
      correct: false,
      answer: question.answer,
      answered: 1,
      finished: false,
    });
    expect(
      await rejection(
        t.service.answerExam(userId, first.attempt_id, { index: 0, option: question.answer }),
      ),
    ).toMatchObject({
      code: 'EXAM_ALREADY_ANSWERED',
    });
    expect(
      await rejection(
        t.service.answerExam(userId, first.attempt_id, { index: 1, option: 'khong_co' }),
      ),
    ).toMatchObject({
      status: 422,
      code: 'EXAM_OPTION_INVALID',
    });
    expect(
      await rejection(
        t.service.answerExam(userId, first.attempt_id, { index: 7 + 1, option: wrong }),
      ),
    ).toMatchObject({
      code: 'EXAM_QUESTION_INVALID',
    });

    await t.service.startExam(userId, 1);
    expect(
      await rejection(t.service.answerExam(userId, first.attempt_id, { index: 1, option: wrong })),
    ).toMatchObject({
      status: 409,
      code: 'EXAM_CLOSED',
    });
    // Lượt của người khác không dùng được.
    const other = t.user();
    expect(
      await rejection(t.service.answerExam(other, first.attempt_id, { index: 1, option: wrong })),
    ).toMatchObject({
      status: 404,
      code: 'EXAM_NOT_FOUND',
    });
  });

  it('đi hết 5 Dojo: đai đen, +300 xu mỗi đai, tổng thưởng đúng', async () => {
    const userId = t.user();
    await t.reach(userId, 5);
    const state = await t.service.getState(userId);
    expect(state.progress).toMatchObject({ belt: 5, belt_name: 'Đai đen' });
    const dojoRewards = t.ledger(userId).filter((row) => row.kind === 'dojo_reward');
    const total = dojoRewards.reduce((sum, row) => sum + row.delta, 0);
    expect(total).toBe(100 + 27 * 100 + 5 * 300);
    expect(state.wallet.balance).toBe(total);
    expect(
      state.dojos.every((dojo) => dojo.passed && dojo.lessons_done === dojo.lessons_total),
    ).toBe(true);
  });
});

describe('luyện công mỗi ngày', () => {
  async function drillReady() {
    const userId = t.user();
    await t.reach(userId, 1);
    return userId;
  }
  const perfectTaps = (lessonId: string) =>
    content.exercises.get(lessonId)!.hunt.targets.map((target) => target[0]);

  it('chỉ mở từ khi có đai vàng và chỉ với bài đã học', async () => {
    const userId = t.user();
    await t.service.completeIntro(userId);
    const lesson = CD_LESSONS[0]!;
    await t.learn(userId, lesson.id);
    expect(
      await rejection(
        t.service.completeDrill(userId, { lesson_id: lesson.id, taps: perfectTaps(lesson.id) }),
      ),
    ).toMatchObject({
      status: 409,
      code: 'DRILL_LOCKED',
    });
    const ready = await drillReady();
    expect(
      await rejection(
        t.service.completeDrill(ready, { lesson_id: cdLessonsOfDojo(2)[0]!.id, taps: [3] }),
      ),
    ).toMatchObject({
      code: 'LESSON_LOCKED',
    });
  });

  it('+20 xu một lần mỗi ngày (giờ Việt Nam), chuỗi tăng khi liền ngày và về 1 khi đứt', async () => {
    const userId = await drillReady();
    const lesson = CD_LESSONS[0]!;
    const taps = perfectTaps(lesson.id);
    const start = (await t.service.getState(userId)).wallet.balance;

    const day1 = await t.service.completeDrill(userId, { lesson_id: lesson.id, taps });
    expect(day1).toMatchObject({
      reward_xu: 20,
      first_time: true,
      streak_days: 1,
      balance: start + 20,
    });
    const same = await t.service.completeDrill(userId, { lesson_id: lesson.id, taps });
    expect(same).toMatchObject({
      reward_xu: 0,
      first_time: false,
      streak_days: 1,
      balance: start + 20,
    });
    expect((await t.service.getState(userId)).progress).toMatchObject({
      drill_done_today: true,
      streak_days: 1,
    });

    t.clock.current = new Date('2026-11-10T05:00:00Z');
    const day2 = await t.service.completeDrill(userId, { lesson_id: lesson.id, taps });
    expect(day2).toMatchObject({ reward_xu: 20, streak_days: 2 });

    t.clock.current = new Date('2026-11-13T05:00:00Z');
    const gap = await t.service.completeDrill(userId, { lesson_id: lesson.id, taps });
    expect(gap).toMatchObject({ reward_xu: 20, streak_days: 1 });
    expect((await t.service.getState(userId)).progress).toMatchObject({
      best_streak: 2,
      drills_total: 3,
    });
  });

  it('ngày tính theo giờ Việt Nam: 17:30 UTC đã sang ngày mới', async () => {
    const userId = await drillReady();
    const lesson = CD_LESSONS[0]!;
    t.clock.current = new Date('2026-11-09T16:30:00Z');
    await t.service.completeDrill(userId, { lesson_id: lesson.id, taps: perfectTaps(lesson.id) });
    t.clock.current = new Date('2026-11-09T17:30:00Z');
    const next = await t.service.completeDrill(userId, {
      lesson_id: lesson.id,
      taps: perfectTaps(lesson.id),
    });
    expect(next).toMatchObject({ reward_xu: 20, streak_days: 2 });
  });

  it('nộp trống (không tìm được mẫu nào) không nhận xu và không giữ chuỗi', async () => {
    const userId = await drillReady();
    const lesson = CD_LESSONS[0]!;
    const result = await t.service.completeDrill(userId, { lesson_id: lesson.id, taps: [] });
    expect(result).toMatchObject({ found: 0, reward_xu: 0, streak_days: 0 });
    expect((await t.service.getState(userId)).progress.drill_done_today).toBe(false);
  });
});
