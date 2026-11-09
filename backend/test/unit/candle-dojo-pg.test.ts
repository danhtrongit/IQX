import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadCandleDojoContent } from '../../src/modules/candle-dojo/candle-dojo.content.js';
import { PgCandleDojoRepository } from '../../src/modules/candle-dojo/candle-dojo.repository.js';
import { CandleDojoService } from '../../src/modules/candle-dojo/candle-dojo.service.js';
import { CD_CATALOG_VERSION, cdLessonsOfDojo } from '../../src/modules/candle-dojo/shared/lessons.js';
import { postgresHarness, type ShopHarness } from './helpers/shop-harness.js';

/**
 * Chạy SQL thật của Candle Dojo (migration 0045-0046 đã áp) trên PostgreSQL. Bỏ qua trừ khi đặt
 * CANDLE_DOJO_TEST_DATABASE_URL tới một database cục bộ `iqx_v2_test_*`, ví dụ
 *   CANDLE_DOJO_TEST_DATABASE_URL=postgres://cdtest@127.0.0.1:15441/iqx_v2_test_candledojo \
 *     npx vitest run test/unit/candle-dojo-pg.test.ts
 * Bản kiểm bằng bộ nhớ (`candle-dojo-service.test.ts`) phản chiếu các luật này; file này chứng minh chính SQL:
 * khoá duy nhất theo thẻ, thưởng một lần, khoá ví, ràng buộc loại sổ cái.
 */
const URL = process.env.CANDLE_DOJO_TEST_DATABASE_URL;

describe.skipIf(!URL)('Candle Dojo trên PostgreSQL', () => {
  let harness: ShopHarness;
  let repo: PgCandleDojoRepository;
  let service: CandleDojoService;
  const content = loadCandleDojoContent();

  beforeAll(async () => {
    harness = await postgresHarness(URL!);
    repo = new PgCandleDojoRepository();
    service = new CandleDojoService(harness.database, repo, harness.repository, content);
  });
  afterAll(async () => {
    await harness?.close();
  });

  const learn = (userId: string, lessonId: string) => {
    const exercises = content.exercises.get(lessonId)!;
    return service.completeLesson(userId, lessonId, {
      hunt: { taps: exercises.hunt.targets.map((target) => target[0]) },
      twins: exercises.twins.map((twin) => twin.goodSide),
    });
  };

  const balanceOf = async (userId: string) =>
    Number(
      (
        await harness.database.query<{ balance: string }>(
          `select balance::text as balance from coin_wallets where user_id = $1`,
          [userId],
        )
      )[0]?.balance ?? 0,
    );

  it('thưởng Nhập môn và bài học chỉ một lần, kể cả gửi đồng thời', async () => {
    const userId = await harness.newUser();
    await service.completeIntro(userId);
    await Promise.all([service.completeIntro(userId), service.completeIntro(userId)]);
    const lesson = cdLessonsOfDojo(1)[0]!;
    await Promise.all([learn(userId, lesson.id), learn(userId, lesson.id), learn(userId, lesson.id)]);
    expect(await balanceOf(userId)).toBe(200);
    const rows = await harness.database.query<{ kind: string }>(
      `select kind from coin_ledger where user_id = $1`,
      [userId],
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.kind === 'dojo_reward')).toBe(true);
  });

  it('mua thẻ: trừ xu một lần, không mua trùng, thiếu xu bị từ chối và không ghi gì', async () => {
    const userId = await harness.newUser();
    await service.completeIntro(userId);
    const [first, second] = cdLessonsOfDojo(1);
    await learn(userId, first!.id);
    await learn(userId, second!.id);
    expect(await balanceOf(userId)).toBe(300);
    const body = { expected_price_xu: 300, catalog_version: CD_CATALOG_VERSION };

    const results = await Promise.allSettled([
      service.purchaseCard(userId, 'doji', body),
      service.purchaseCard(userId, 'doji', body),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await balanceOf(userId)).toBe(0);
    const purchases = await harness.database.query<{ delta: string; kind: string }>(
      `select delta::text, kind from coin_ledger where user_id = $1 and kind = 'card_purchase'`,
      [userId],
    );
    expect(purchases).toEqual([{ delta: '-300', kind: 'card_purchase' }]);
    expect((await service.getCards(userId)).owned_count).toBe(1);

    const poor = await service.purchaseCard(userId, 'marubozu_tang', body).catch((error: unknown) => error);
    expect((poor as { getResponse(): { code: string } }).getResponse().code).toBe('INSUFFICIENT_XU');
    expect(await balanceOf(userId)).toBe(0);
  });

  it('thi đai: lên đai và +300 xu một lần; đề do server giữ đáp án', async () => {
    const userId = await harness.newUser();
    await service.completeIntro(userId);
    for (const lesson of cdLessonsOfDojo(1)) await learn(userId, lesson.id);
    const before = await balanceOf(userId);

    const sit = async (right: number) => {
      const started = await service.startExam(userId, 1);
      const attempt = (await repo.findAttempt(harness.database, started.attempt_id, userId, false))!;
      let last;
      for (let index = 0; index < attempt.questions.length; index++) {
        const question = attempt.questions[index]!;
        const wrong = question.options.find((option) => option !== question.answer)!;
        last = await service.answerExam(userId, started.attempt_id, {
          index,
          option: index < right ? question.answer : wrong,
        });
      }
      return last!;
    };

    expect((await sit(5)).result).toMatchObject({ passed: false, belt_up: false, reward_xu: 0 });
    expect(await balanceOf(userId)).toBe(before);
    expect((await sit(8)).result).toMatchObject({ passed: true, belt_up: true, reward_xu: 300 });
    expect((await sit(8)).result).toMatchObject({ passed: true, belt_up: false, reward_xu: 0 });
    expect(await balanceOf(userId)).toBe(before + 300);
    expect((await service.getState(userId)).progress.belt).toBe(1);
  });

  it('luyện công: +20 xu một lần mỗi ngày', async () => {
    const userId = await harness.newUser();
    await service.completeIntro(userId);
    for (const lesson of cdLessonsOfDojo(1)) await learn(userId, lesson.id);
    const started = await service.startExam(userId, 1);
    const attempt = (await repo.findAttempt(harness.database, started.attempt_id, userId, false))!;
    for (let index = 0; index < attempt.questions.length; index++) {
      await service.answerExam(userId, started.attempt_id, {
        index,
        option: attempt.questions[index]!.answer,
      });
    }
    const lesson = cdLessonsOfDojo(1)[0]!;
    const taps = content.exercises.get(lesson.id)!.hunt.targets.map((target) => target[0]);
    const before = await balanceOf(userId);
    const first = await service.completeDrill(userId, { lesson_id: lesson.id, taps });
    const again = await service.completeDrill(userId, { lesson_id: lesson.id, taps });
    expect(first).toMatchObject({ reward_xu: 20, first_time: true });
    expect(again).toMatchObject({ reward_xu: 0, first_time: false });
    expect(await balanceOf(userId)).toBe(before + 20);
  });
});
