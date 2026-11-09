import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomInt, randomUUID } from 'node:crypto';

import { DatabaseService, type SqlClient } from '../../platform/database/database.service.js';
import { COIN_POLICY_VERSION } from '../shop/shop.catalog.js';
import { ShopRepository } from '../shop/shop.repository.js';
import { CANDLE_DOJO_CONTENT, type CandleDojoContent } from './candle-dojo.content.js';
import {
  CandleDojoRepository,
  type ExamAttemptRow,
  type ExamQuestionRecord,
  type LessonProgressRow,
} from './candle-dojo.repository.js';
import {
  NO_BELT,
  beltName,
  dojoSummary,
  isCardUnlocked,
  isDrillUnlocked,
  isExamReady,
  isLessonOpen,
  nextStreak,
  vietnamDay,
} from './candle-dojo.rules.js';
import type {
  CardPurchaseBody,
  DrillCompleteBody,
  ExamAnswerBody,
  LessonCompleteBody,
} from './candle-dojo.schemas.js';
import { CD_CARDS, cdCard, cdCardPrice } from './shared/cards.js';
import { gradeHunt, gradeTwins, lessonStars } from './shared/grading.js';
import {
  CD_CATALOG_VERSION,
  CD_DOJOS,
  CD_EXAM,
  CD_LESSONS,
  CD_REWARD_XU,
  cdLesson,
} from './shared/lessons.js';

export const CANDLE_DOJO_CLOCK = Symbol('CANDLE_DOJO_CLOCK');

export interface CandleDojoClock {
  now(): Date;
}

const systemClock: CandleDojoClock = { now: () => new Date() };

const ISO = (value: Date) => value.toISOString();

const conflict = (code: string, message: string, details?: unknown[]) =>
  new ConflictException({ code, message, ...(details ? { details } : {}) });

/** Ví của người dùng trong một giao dịch: số dư và số thứ tự sổ cái, cập nhật khi ghi thêm dòng. */
interface WalletCursor {
  balance: number;
  lastSeq: number;
}

export const rewardLedgerKey = (userId: string, rewardKey: string) =>
  `dojo_reward:${userId}:${rewardKey}`;
export const cardLedgerKey = (userId: string, cardId: string) => `card:${userId}:${cardId}`;

function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

@Injectable()
export class CandleDojoService {
  constructor(
    private readonly database: DatabaseService,
    private readonly repository: CandleDojoRepository,
    private readonly shop: ShopRepository,
    @Inject(CANDLE_DOJO_CONTENT) private readonly content: CandleDojoContent,
    @Optional() @Inject(CANDLE_DOJO_CLOCK) private readonly clock: CandleDojoClock = systemClock,
  ) {}

  // ================================================================== đọc

  /** Trạng thái học: đai, bài đã xong, kho thẻ, chuỗi luyện công. Chỉ đọc. */
  async getState(userId: string) {
    const [progress, lessons, cards, wallet] = await Promise.all([
      this.repository.readProgress(this.database, userId),
      this.repository.listLessons(this.database, userId),
      this.repository.listCards(this.database, userId),
      this.shop.readWallet(this.database, userId),
    ]);
    const belt = progress?.belt ?? NO_BELT;
    const done = new Set(lessons.map((lesson) => lesson.lessonId));
    const today = vietnamDay(this.clock.now());
    return {
      catalog_version: CD_CATALOG_VERSION,
      wallet: { balance: wallet?.balance ?? 0 },
      progress: {
        belt,
        belt_name: beltName(belt),
        intro_completed: (progress?.introCompletedAt ?? null) !== null,
        streak_days: progress?.streakDays ?? 0,
        best_streak: progress?.bestStreak ?? 0,
        drills_total: progress?.drillsTotal ?? 0,
        drill_unlocked: isDrillUnlocked(belt),
        drill_done_today: progress?.lastDrillDay === today,
      },
      lessons: lessons.map((lesson) => this.lessonView(lesson)),
      open_lessons: CD_LESSONS.filter((lesson) => isLessonOpen(lesson.id, belt, done)).map(
        (lesson) => lesson.id,
      ),
      dojos: dojoSummary(belt, done),
      cards: {
        total: CD_CARDS.length,
        owned_count: cards.length,
        owned: cards.map((card) => ({
          card_id: card.cardId,
          acquired_at: ISO(card.acquiredAt),
          seen_at: card.seenAt ? ISO(card.seenAt) : null,
        })),
      },
      rewards: {
        intro_xu: CD_REWARD_XU.intro,
        lesson_xu: CD_REWARD_XU.lesson,
        belt_xu: CD_REWARD_XU.belt,
        drill_xu: CD_REWARD_XU.drill,
      },
    };
  }

  /** Mục Thẻ nến của Shop: cả 47 thẻ kèm trạng thái sở hữu và mở khoá (spec §8.1). */
  async getCards(userId: string) {
    const [lessons, cards, wallet] = await Promise.all([
      this.repository.listLessons(this.database, userId),
      this.repository.listCards(this.database, userId),
      this.shop.readWallet(this.database, userId),
    ]);
    const done = new Set(lessons.map((lesson) => lesson.lessonId));
    const owned = new Map(cards.map((card) => [card.cardId, card]));
    return {
      catalog_version: CD_CATALOG_VERSION,
      wallet: { balance: wallet?.balance ?? 0 },
      total_count: CD_CARDS.length as 47,
      owned_count: cards.length,
      items: CD_CARDS.map((card) => {
        const mine = owned.get(card.id);
        return {
          card_id: card.id,
          name: card.name,
          tier: card.tier,
          price_xu: cdCardPrice(card),
          lesson_id: card.lessonId,
          lesson_title: cdLesson(card.lessonId)?.title ?? card.lessonId,
          dojo: card.dojo,
          owned: mine !== undefined,
          acquired_at: mine ? ISO(mine.acquiredAt) : null,
          seen: mine?.seenAt != null,
          unlocked: isCardUnlocked(card.lessonId, done),
        };
      }),
    };
  }

  // ================================================================== Nhập môn và bài học

  /** Nhập môn xong: đai trắng, mở Dojo 1, +100 xu lần đầu (spec §2). */
  async completeIntro(userId: string) {
    return this.database.transaction(async (tx) => {
      const wallet = await this.lockWallet(tx, userId);
      const progress = await this.repository.lockProgress(tx, userId);
      await this.repository.saveProgress(tx, userId, {
        belt: Math.max(progress.belt, 0),
        ...(progress.introCompletedAt ? {} : { introCompletedAt: this.clock.now() }),
      });
      const reward = await this.grantReward(tx, userId, wallet, 'intro', CD_REWARD_XU.intro, {
        source: 'intro',
      });
      return {
        belt: Math.max(progress.belt, 0),
        reward_xu: reward,
        first_time: reward > 0,
        balance: wallet.balance,
      };
    });
  }

  /**
   * Xong một bài (đã đi hết 6 bước): server chấm lại Săn nến và Song sinh từ dữ liệu người học gửi,
   * lưu sao cao nhất, thưởng +100 xu lần đầu (spec §5.1). Bài chưa mở thì từ chối.
   */
  async completeLesson(userId: string, lessonId: string, input: LessonCompleteBody) {
    const lesson = cdLesson(lessonId);
    const exercises = this.content.exercises.get(lessonId);
    if (!lesson || !exercises) {
      throw new NotFoundException({ code: 'LESSON_NOT_FOUND', message: 'Không tìm thấy bài học' });
    }
    return this.database.transaction(async (tx) => {
      const wallet = await this.lockWallet(tx, userId);
      const progress = await this.repository.lockProgress(tx, userId);
      const lessons = await this.repository.listLessons(tx, userId);
      const done = new Set(lessons.map((item) => item.lessonId));
      if (!isLessonOpen(lessonId, progress.belt, done)) {
        throw conflict('LESSON_LOCKED', 'Hoàn thành bài trước (và Nhập môn) để mở bài này.');
      }
      const hunt = input.hunt
        ? gradeHunt(exercises.hunt, input.hunt.taps)
        : { found: 0, total: exercises.hunt.targets.length, miss: 0, star: false };
      const twins = input.twins
        ? gradeTwins(exercises.twins, input.twins)
        : { right: 0, total: exercises.twins.length, star: false };
      const result = lessonStars(hunt.star, twins.star);
      const previous = lessons.find((item) => item.lessonId === lessonId)?.stars ?? 0;
      const recorded = await this.repository.recordLesson(tx, {
        userId,
        lessonId,
        huntStar: result.huntStar,
        twinStar: result.twinStar,
        stars: result.stars,
      });
      const reward = await this.grantReward(
        tx,
        userId,
        wallet,
        `lesson:${lessonId}`,
        CD_REWARD_XU.lesson,
        { source: 'lesson', lesson_id: lessonId, lesson_title: lesson.title },
      );
      return {
        lesson_id: lessonId,
        stars: result.stars,
        best_stars: recorded.row.stars as 1 | 2 | 3,
        previous_stars: previous,
        hunt: { found: hunt.found, total: hunt.total, miss: hunt.miss, star: hunt.star },
        twins: { right: twins.right, total: twins.total, star: twins.star },
        card_ids: lesson.cards,
        reward_xu: reward,
        first_time: reward > 0,
        balance: wallet.balance,
      };
    });
  }

  // ================================================================== Luyện công

  /** Luyện công mỗi ngày: săn nến một bài đã học, +20 xu một lần mỗi ngày (giờ Việt Nam), giữ chuỗi ngày. */
  async completeDrill(userId: string, input: DrillCompleteBody) {
    const exercises = this.content.exercises.get(input.lesson_id);
    if (!cdLesson(input.lesson_id) || !exercises) {
      throw new NotFoundException({ code: 'LESSON_NOT_FOUND', message: 'Không tìm thấy bài học' });
    }
    return this.database.transaction(async (tx) => {
      const wallet = await this.lockWallet(tx, userId);
      const progress = await this.repository.lockProgress(tx, userId);
      if (!isDrillUnlocked(progress.belt)) {
        throw conflict('DRILL_LOCKED', 'Luyện công mở từ khi bạn có đai vàng.');
      }
      const lessons = await this.repository.listLessons(tx, userId);
      if (!lessons.some((item) => item.lessonId === input.lesson_id)) {
        throw conflict('LESSON_LOCKED', 'Chỉ luyện công với bài đã học xong.');
      }
      const hunt = gradeHunt(exercises.hunt, input.taps);
      const today = vietnamDay(this.clock.now());
      let reward = 0;
      let streak = progress.streakDays;
      // Phải tìm được ít nhất một mẫu thì mới tính là đã luyện (không nhận xu bằng lượt nộp trống).
      if (hunt.found >= 1) {
        reward = await this.grantReward(tx, userId, wallet, `drill:${today}`, CD_REWARD_XU.drill, {
          source: 'drill',
          lesson_id: input.lesson_id,
          day: today,
        });
        if (reward > 0) {
          streak = nextStreak(progress.lastDrillDay, today, progress.streakDays);
          await this.repository.saveProgress(tx, userId, {
            streakDays: streak,
            bestStreak: Math.max(progress.bestStreak, streak),
            lastDrillDay: today,
            drillsTotal: progress.drillsTotal + 1,
          });
        }
      }
      return {
        lesson_id: input.lesson_id,
        found: hunt.found,
        total: hunt.total,
        miss: hunt.miss,
        streak_days: streak,
        reward_xu: reward,
        first_time: reward > 0,
        balance: wallet.balance,
      };
    });
  }

  // ================================================================== Thi đai

  /** Mở một lượt thi đai: server chọn 8 câu, giữ đáp án; lượt đang mở trước đó bị bỏ. */
  async startExam(userId: string, dojo: number) {
    const exam = this.content.exams.get(dojo);
    if (!exam) {
      throw new NotFoundException({ code: 'EXAM_NOT_FOUND', message: 'Không có đề thi này' });
    }
    return this.database.transaction(async (tx) => {
      await this.lockWallet(tx, userId);
      const progress = await this.repository.lockProgress(tx, userId);
      const lessons = await this.repository.listLessons(tx, userId);
      const done = new Set(lessons.map((item) => item.lessonId));
      if (!isExamReady(dojo, progress.belt, done)) {
        throw conflict('EXAM_LOCKED', 'Học xong mọi bài của Dojo này để mở bài thi đai.');
      }
      await this.repository.abandonOpenAttempts(tx, userId, dojo);
      const order = shuffle(exam.qs.map((_, index) => index));
      const records: ExamQuestionRecord[] = order.map((qid) => {
        const question = exam.qs[qid]!;
        return { qid, options: shuffle(question.opts), answer: question.ans };
      });
      const attempt = await this.repository.insertAttempt(tx, {
        id: randomUUID(),
        userId,
        dojo,
        questions: records,
        passMark: CD_EXAM.passMark,
      });
      return {
        attempt_id: attempt.id,
        dojo,
        belt_name: beltName(dojo) ?? '',
        pass_mark: attempt.passMark,
        total: records.length,
        questions: records.map((record, index) => {
          const question = exam.qs[record.qid]!;
          return {
            index,
            n: question.n,
            bars: question.bars.map((bar) => ({
              o: bar.o,
              h: bar.h,
              l: bar.l,
              c: bar.c,
              v: bar.v ?? 1,
            })),
            options: [...record.options],
          };
        }),
      };
    });
  }

  /**
   * Trả lời một câu: server nói đúng hay sai và lộ đáp án của câu đó. Câu cuối chốt điểm; từ 6/8 là qua:
   * lên đai (không bao giờ hạ) và +300 xu lần đầu của Dojo đó.
   */
  async answerExam(userId: string, attemptId: string, input: ExamAnswerBody) {
    return this.database.transaction(async (tx) => {
      const wallet = await this.lockWallet(tx, userId);
      const attempt = await this.repository.findAttempt(tx, attemptId, userId, true);
      if (!attempt) {
        throw new NotFoundException({ code: 'EXAM_NOT_FOUND', message: 'Không tìm thấy lượt thi' });
      }
      if (attempt.status !== 'open') {
        throw conflict('EXAM_CLOSED', 'Lượt thi này đã kết thúc. Hãy mở lượt thi mới.');
      }
      const question = attempt.questions[input.index];
      if (!question) {
        throw new UnprocessableEntityException({
          code: 'EXAM_QUESTION_INVALID',
          message: 'Không có câu hỏi này',
        });
      }
      if (attempt.answers[input.index] !== null && attempt.answers[input.index] !== undefined) {
        throw conflict('EXAM_ALREADY_ANSWERED', 'Câu này đã được trả lời.');
      }
      if (!question.options.includes(input.option)) {
        throw new UnprocessableEntityException({
          code: 'EXAM_OPTION_INVALID',
          message: 'Lựa chọn không thuộc câu hỏi này',
        });
      }
      const answers = attempt.questions.map((_, index) =>
        index === input.index ? input.option : (attempt.answers[index] ?? null),
      );
      const correct = input.option === question.answer;
      const answered = answers.filter((answer) => answer !== null).length;
      if (answered < attempt.questions.length) {
        await this.repository.updateAttempt(tx, attemptId, { answers });
        return {
          attempt_id: attemptId,
          index: input.index,
          correct,
          answer: question.answer,
          answered,
          finished: false,
          result: null,
        };
      }
      const result = await this.finishExam(tx, userId, wallet, attempt, answers);
      return {
        attempt_id: attemptId,
        index: input.index,
        correct,
        answer: question.answer,
        answered,
        finished: true,
        result,
      };
    });
  }

  private async finishExam(
    tx: SqlClient,
    userId: string,
    wallet: WalletCursor,
    attempt: ExamAttemptRow,
    answers: readonly (string | null)[],
  ) {
    const score = attempt.questions.filter((q, index) => answers[index] === q.answer).length;
    const passed = score >= attempt.passMark;
    const progress = await this.repository.lockProgress(tx, userId);
    let beltUp = false;
    let reward = 0;
    let belt = progress.belt;
    if (passed && progress.belt < attempt.dojo) {
      belt = attempt.dojo;
      beltUp = true;
      await this.repository.saveProgress(tx, userId, { belt });
      reward = await this.grantReward(
        tx,
        userId,
        wallet,
        `belt:${attempt.dojo}`,
        CD_REWARD_XU.belt,
        { source: 'belt', dojo: attempt.dojo, belt: CD_DOJOS[attempt.dojo]?.belt },
      );
    }
    await this.repository.updateAttempt(tx, attempt.id, {
      answers,
      status: passed ? 'passed' : 'failed',
      score,
      beltAwarded: beltUp,
      finishedAt: this.clock.now(),
    });
    return {
      score,
      total: attempt.questions.length,
      pass_mark: attempt.passMark,
      passed,
      belt,
      belt_up: beltUp,
      reward_xu: reward,
      balance: wallet.balance,
    };
  }

  // ================================================================== Mua thẻ

  /**
   * Mua một thẻ nến (spec §8.2): bài của thẻ đã học xong, chưa có thẻ, đủ xu. Một API cho cả màn kết thúc
   * bài và Shop. Sổ xu: kind `card_purchase`, unique_key `card:<user>:<card>`, số tiền âm.
   */
  async purchaseCard(userId: string, cardId: string, input: CardPurchaseBody) {
    const card = cdCard(cardId);
    if (!card) {
      throw new NotFoundException({ code: 'CARD_NOT_FOUND', message: 'Không tìm thấy thẻ nến' });
    }
    if (input.catalog_version !== CD_CATALOG_VERSION) {
      throw conflict('CATALOG_CHANGED', 'Bộ thẻ đã thay đổi, vui lòng tải lại và xác nhận lại', [
        { catalog_version: CD_CATALOG_VERSION },
      ]);
    }
    const price = cdCardPrice(card);
    if (input.expected_price_xu !== price) {
      throw conflict(
        'PRICE_CHANGED',
        `Giá đã thay đổi, hiện là ${price} xu. Vui lòng xác nhận lại`,
        [{ current_price_xu: price, catalog_version: CD_CATALOG_VERSION }],
      );
    }
    return this.database.transaction(async (tx) => {
      const wallet = await this.lockWallet(tx, userId);
      if (await this.repository.hasCard(tx, userId, cardId)) {
        throw conflict('CARD_OWNED', 'Bạn đã có thẻ này. Không trừ thêm xu.');
      }
      const lessons = await this.repository.listLessons(tx, userId);
      const done = new Set(lessons.map((item) => item.lessonId));
      if (!isCardUnlocked(card.lessonId, done)) {
        throw conflict('CARD_LOCKED', 'Học xong bài ở Candle Dojo để mở thẻ này.');
      }
      if (wallet.balance < price) {
        throw conflict('INSUFFICIENT_XU', 'Số xu hiện tại không đủ. Không thực hiện giao dịch.', [
          {
            balance_xu: wallet.balance,
            price_xu: price,
            shortfall_xu: price - wallet.balance,
          },
        ]);
      }
      const ledgerId = randomUUID();
      const seq = wallet.lastSeq + 1;
      const balanceAfter = wallet.balance - price;
      await this.shop.appendLedger(tx, {
        id: ledgerId,
        userId,
        seq,
        kind: 'card_purchase',
        delta: -price,
        balanceAfter,
        uniqueKey: cardLedgerKey(userId, cardId),
        ref: { card_id: cardId, card_name: card.name, tier: card.tier, price_xu: price },
        policyVersion: COIN_POLICY_VERSION,
      });
      const row = await this.repository.insertCard(tx, {
        userId,
        cardId,
        priceXu: price,
        ledgerId,
      });
      if (!row) throw conflict('CARD_OWNED', 'Bạn đã có thẻ này. Không trừ thêm xu.');
      await this.shop.saveWallet(tx, userId, balanceAfter, seq);
      return {
        status: 'purchased' as const,
        card_id: cardId,
        name: card.name,
        price_xu: price,
        balance: balanceAfter,
        acquired_at: ISO(row.acquiredAt),
      };
    });
  }

  // ================================================================== nội bộ

  private async lockWallet(tx: SqlClient, userId: string): Promise<WalletCursor> {
    const wallet = await this.shop.lockWallet(tx, userId);
    return { balance: wallet.balance, lastSeq: wallet.lastSeq };
  }

  private async grantReward(
    tx: SqlClient,
    userId: string,
    wallet: WalletCursor,
    rewardKey: string,
    xu: number,
    label: Record<string, unknown>,
  ): Promise<number> {
    const ledgerId = randomUUID();
    const inserted = await this.repository.insertRewardIfAbsent(tx, {
      userId,
      rewardKey,
      xu,
      ledgerId,
    });
    if (!inserted) return 0;
    const seq = wallet.lastSeq + 1;
    const balanceAfter = wallet.balance + xu;
    await this.shop.appendLedger(tx, {
      id: ledgerId,
      userId,
      seq,
      kind: 'dojo_reward',
      delta: xu,
      balanceAfter,
      uniqueKey: rewardLedgerKey(userId, rewardKey),
      ref: { reward_key: rewardKey, ...label },
      policyVersion: COIN_POLICY_VERSION,
    });
    await this.shop.saveWallet(tx, userId, balanceAfter, seq);
    wallet.balance = balanceAfter;
    wallet.lastSeq = seq;
    return xu;
  }

  private lessonView(lesson: LessonProgressRow) {
    return {
      lesson_id: lesson.lessonId,
      dojo: cdLesson(lesson.lessonId)?.dojo ?? 0,
      stars: lesson.stars,
      hunt_star: lesson.huntStar,
      twin_star: lesson.twinStar,
      attempts: lesson.attempts,
      completed_at: ISO(lesson.firstCompletedAt),
    };
  }
}
