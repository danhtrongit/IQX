/**
 * Luật mở khoá của Candle Dojo (spec v1.2 §2, §5): thuần tuý, không I/O. Server dùng để từ chối việc làm
 * bài, thi đai hay mua thẻ khi chưa đủ điều kiện; màn học dùng cùng luật để vẽ trạng thái khoá.
 */
import { CD_DOJOS, CD_LESSONS, cdLesson, cdLessonsOfDojo } from './shared/lessons.js';

/** Đai khi chưa qua bậc nào. */
export const NO_BELT = -1;

export const MAX_BELT = 5;

/** Dojo N mở khi đã có đai N-1 (Dojo 1 mở sau Nhập môn, tức đai trắng). */
export function isDojoUnlocked(dojo: number, belt: number): boolean {
  return dojo >= 1 && dojo <= MAX_BELT && belt >= dojo - 1;
}

export type DoneLessons = ReadonlySet<string>;

/** Bài đã học xong luôn mở lại được; bài đầu của Dojo mở sẵn; bài sau mở khi bài trước có ≥ 1 sao. */
export function isLessonOpen(lessonId: string, belt: number, done: DoneLessons): boolean {
  const lesson = cdLesson(lessonId);
  if (!lesson) return false;
  if (!isDojoUnlocked(lesson.dojo, belt)) return false;
  if (done.has(lessonId)) return true;
  const lessons = cdLessonsOfDojo(lesson.dojo);
  const position = lessons.findIndex((item) => item.id === lessonId);
  return position <= 0 || done.has(lessons[position - 1]!.id);
}

/** Thi đai Dojo N mở khi Dojo N đã mở và mọi bài của nó có ≥ 1 sao. */
export function isExamReady(dojo: number, belt: number, done: DoneLessons): boolean {
  if (!isDojoUnlocked(dojo, belt)) return false;
  return cdLessonsOfDojo(dojo).every((lesson) => done.has(lesson.id));
}

/** Luyện công mỗi ngày mở từ khi có đai vàng (spec §5.4). */
export function isDrillUnlocked(belt: number): boolean {
  return belt >= 1;
}

export function beltName(belt: number): string | null {
  return belt >= 0 && belt <= MAX_BELT ? `Đai ${CD_DOJOS[belt]!.belt.toLowerCase()}` : null;
}

/** Thẻ mua được khi bài của thẻ đã học xong (không cần đủ sao). */
export function isCardUnlocked(lessonId: string, done: DoneLessons): boolean {
  return done.has(lessonId);
}

/** Số bài đã xong của từng Dojo (để vẽ thanh tiến độ và hiển thị trạng thái). */
export function dojoSummary(belt: number, done: DoneLessons) {
  return CD_DOJOS.filter((dojo) => dojo.n >= 1).map((dojo) => {
    const lessons = cdLessonsOfDojo(dojo.n);
    return {
      n: dojo.n,
      unlocked: isDojoUnlocked(dojo.n, belt),
      lessons_total: lessons.length,
      lessons_done: lessons.filter((lesson) => done.has(lesson.id)).length,
      exam_ready: isExamReady(dojo.n, belt, done),
      passed: belt >= dojo.n,
    };
  });
}

export const ALL_LESSON_IDS: readonly string[] = CD_LESSONS.map((lesson) => lesson.id);

// ------------------------------------------------------------------ ngày và chuỗi luyện công

const VN_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Ngày dương lịch ở Việt Nam, YYYY-MM-DD. */
export function vietnamDay(at: Date): string {
  return VN_DAY.format(at);
}

function previousDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/** Chuỗi ngày luyện công sau lần luyện hôm nay: liền ngày hôm qua thì cộng thêm, ngoài ra bắt đầu lại từ 1. */
export function nextStreak(lastDay: string | null, today: string, current: number): number {
  if (lastDay === today) return Math.max(current, 1);
  return lastDay === previousDay(today) ? current + 1 : 1;
}
