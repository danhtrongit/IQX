import { describe, expect, it } from 'vitest';

import { loadCandleDojoContent } from '../../src/modules/candle-dojo/candle-dojo.content.js';
import { CD_CARDS, cdCard } from '../../src/modules/candle-dojo/shared/cards.js';
import { prep, rawMatches, type CdBar } from '../../src/modules/candle-dojo/shared/detector.js';
import { CD_EXAM, CD_LESSONS, cdLesson } from '../../src/modules/candle-dojo/shared/lessons.js';

/**
 * Kiểm tra nội dung bài tập (spec v1.2 §7). Các biểu đồ trong bản mẫu là CỬA SỔ 13-52 nến cắt từ chuỗi dài
 * hơn, còn bộ nhận diện chỉ xét bối cảnh khi có ít nhất 25 nến đứng trước (`ctx`, j >= 25). Vì vậy các thẻ phụ
 * thuộc bối cảnh (Hammer, Engulfing...) KHÔNG thể được nhận lại từ riêng cửa sổ; build của bản mẫu đã kiểm
 * chúng trên chuỗi đầy đủ. Ở đây ta kiểm những gì kiểm được từ cửa sổ:
 *  - cấu trúc dữ liệu (số câu, đáp án nằm trong lựa chọn, chỉ số nằm trong biểu đồ);
 *  - với thẻ KHÔNG phụ thuộc bối cảnh: bộ nhận diện gọi đúng thẻ tại nến cuối của mẫu.
 * Ngân hàng bài tập dựng lại từ kho VN100 (theo §7) phải lưu kèm kết quả nhận diện trên chuỗi đầy đủ.
 */
const content = loadCandleDojoContent();
const hasMatch = (bars: readonly CdBar[], index: number, id: string) =>
  rawMatches(prep(bars), index).some((match) => match.id === id);
const contextFree = (id: string) => cdCard(id)?.ctx === 'F';

describe('cấu trúc nội dung bài tập', () => {
  for (const lesson of CD_LESSONS) {
    it(`${lesson.id}: đủ Săn nến, Song sinh, Đặt đúng chỗ, Khối lượng; chỉ số nằm trong biểu đồ`, () => {
      const exercises = content.exercises.get(lesson.id)!;
      const { hunt, twins, place, vol } = exercises;
      expect(hunt.bars.length).toBeLessThanOrEqual(52);
      expect(hunt.targets.length).toBeGreaterThan(0);
      for (const [start, end] of hunt.targets) {
        expect(start).toBeGreaterThanOrEqual(0);
        expect(end).toBeGreaterThanOrEqual(start);
        expect(end).toBeLessThan(hunt.bars.length);
        expect(hunt.names[String(end)]).toBeTruthy();
      }
      for (const [start, end] of hunt.decoys) {
        expect(start).toBeGreaterThanOrEqual(0);
        expect(end).toBeLessThan(hunt.bars.length);
        // Mồi nhử không chồng lên mẫu thật.
        expect(hunt.targets.some(([s, e]) => start <= e + 1 && end >= s - 1)).toBe(false);
      }
      expect(twins).toHaveLength(3);
      for (const twin of twins) {
        expect(['a', 'b']).toContain(twin.goodSide);
        expect(twin.why.length).toBeGreaterThan(0);
        expect(twin.good.length).toBeGreaterThan(twin.gn);
        expect(twin.bad.length).toBeGreaterThan(twin.bn);
      }
      expect(place.length).toBeGreaterThan(0);
      for (const item of place) {
        expect(lesson.cards).toContain(item.card);
        expect(['D', 'T', 'both']).toContain(item.ans);
        expect(item.D.bars.length).toBeGreaterThan(0);
        expect(item.T.bars.length).toBeGreaterThan(0);
      }
      expect(exercises.story.length).toBeGreaterThanOrEqual(10);
      expect(vol.idx).toBeGreaterThanOrEqual(0);
      expect(vol.idx).toBeLessThan(vol.A.length);
      expect(vol.idx).toBeLessThan(vol.B.length);
    });
  }

  it('27 bài đều có bài tập và không bài nào thiếu thẻ của mình', () => {
    expect(content.exercises.size).toBe(27);
    for (const lesson of CD_LESSONS) expect(lesson.cards.length).toBeGreaterThan(0);
  });
});

describe('thẻ không phụ thuộc bối cảnh được bộ nhận diện gọi đúng', () => {
  it('Săn nến: mẫu của thẻ không phụ thuộc bối cảnh được nhận ra tại nến cuối của mẫu', () => {
    let checked = 0;
    for (const lesson of CD_LESSONS) {
      const cards = lesson.cards.filter(contextFree);
      if (!cards.length) continue;
      const { hunt } = content.exercises.get(lesson.id)!;
      for (const [, end] of hunt.targets) {
        const series = prep(hunt.bars);
        const found = rawMatches(series, end).map((match) => match.id);
        // Lấy mọi thẻ (bất kể bối cảnh): mẫu cần tìm phải có tên trong `names`, và nếu nó là thẻ không phụ
        // thuộc bối cảnh của bài thì bộ nhận diện phải gọi ra đúng thẻ đó.
        const named = cards.filter((id) => cdCard(id)!.name === hunt.names[String(end)]);
        for (const id of named) {
          expect(found, `${lesson.id} nến ${end}`).toContain(id);
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('Thi đai: câu có đáp án là thẻ không phụ thuộc bối cảnh thì bộ nhận diện gọi ra đúng thẻ ở nến cuối', () => {
    let checked = 0;
    for (const exam of content.exams.values()) {
      for (const question of exam.qs) {
        if (!contextFree(question.ans)) continue;
        expect(hasMatch(question.bars, question.bars.length - 1, question.ans), question.ans).toBe(
          true,
        );
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('đề thi đai', () => {
  for (const exam of content.exams.values()) {
    it(`Dojo ${exam.dojo}: ${CD_EXAM.questions} câu, 3-4 lựa chọn khác nhau, đáp án thuộc Dojo và nằm trong lựa chọn`, () => {
      expect(exam.qs).toHaveLength(CD_EXAM.questions);
      expect(exam.pass).toBe(CD_EXAM.passMark);
      const dojoCards = new Set(
        CD_CARDS.filter((card) => card.dojo === exam.dojo).map((card) => card.id),
      );
      for (const question of exam.qs) {
        expect(question.bars.length).toBeGreaterThan(question.n);
        // Dojo có ít thẻ cùng nhóm (Dojo 4) có thể chỉ có 3 lựa chọn.
        expect(question.opts.length).toBeGreaterThanOrEqual(3);
        expect(question.opts.length).toBeLessThanOrEqual(4);
        expect(new Set(question.opts).size).toBe(question.opts.length);
        expect(question.opts).toContain(question.ans);
        expect(dojoCards.has(question.ans)).toBe(true);
        // Đáp án của đề Dojo n chỉ lấy thẻ đã học tới Dojo n (không lộ thẻ chưa học).
        for (const option of question.opts)
          expect(cdCard(option)!.dojo).toBeLessThanOrEqual(exam.dojo);
        expect(cdLesson(cdCard(question.ans)!.lessonId)).toBeDefined();
      }
    });
  }
});
