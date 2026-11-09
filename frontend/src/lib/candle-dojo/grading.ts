/**
 * Chấm bài Candle Dojo (spec v1.2 §5): một bộ luật dùng chung cho màn học (hiện kết quả tức thời) và
 * server (chấm lại từ dữ liệu người học gửi lên, quyết định sao, đai và thưởng xu).
 *
 * Sao nguyên văn từ backend sang frontend (`src/lib/candle-dojo/`); xem `detector.ts`.
 */

import type { CdBar } from './detector.js';

/** Chạm trúng khi lệch tối đa ±1 nến so với mẫu (§5.1 bước Săn nến). */
export const CD_HUNT_TOLERANCE = 1;

/** Săn nến: số lần chạm nhầm tối đa để vẫn được sao (đủ mẫu và nhầm ≤ 1). */
export const CD_HUNT_MAX_MISS = 1;

/** Song sinh: 3 câu, đúng từ 2 câu là được sao. */
export const CD_TWINS_QUESTIONS = 3;
export const CD_TWINS_PASS = 2;

/** Thời gian bước Săn nến (giây). */
export const CD_HUNT_SECONDS = 30;

export type CdSide = 'a' | 'b';

/** Dữ liệu biểu đồ có kèm mẫu: nến cuối của biểu đồ là nến cuối của mẫu. */
export interface CdChart {
  readonly bars: readonly CdBar[];
  /** Số nến của mẫu (nằm cuối biểu đồ). */
  readonly n?: number;
  /** Tên bộ nhận diện gọi (chỉ để hiển thị). */
  readonly name?: string;
}

export interface CdHuntSpec {
  readonly bars: readonly CdBar[];
  /** [nến đầu, nến cuối] của từng mẫu cần tìm. */
  readonly targets: readonly (readonly [number, number])[];
  /** Mồi nhử: [nến đầu, nến cuối, tên bộ nhận diện gọi hoặc null]. */
  readonly decoys: readonly (readonly [number, number, string | null])[];
  /** Tên bộ nhận diện gọi ở từng nến (khoá là chỉ số nến). */
  readonly names: Readonly<Record<string, string>>;
}

export interface CdTwin {
  /** Biểu đồ có mẫu và biểu đồ biến thể gần giống. */
  readonly good: readonly CdBar[];
  readonly gn: number;
  readonly bad: readonly CdBar[];
  readonly bn: number;
  readonly badName: string | null;
  readonly why: string;
  /** Biểu đồ có mẫu nằm bên nào ('a' hoặc 'b'). */
  readonly goodSide: CdSide;
}

export interface CdPlaceItem {
  readonly card: string;
  readonly D: CdChart;
  readonly T: CdChart;
  /** 'D' sau nhịp giảm, 'T' sau nhịp tăng, 'both' ở đâu cũng được. */
  readonly ans: 'D' | 'T' | 'both';
}

export interface CdVolume {
  readonly A: readonly CdBar[];
  readonly B: readonly CdBar[];
  /** Chỉ số nến cuối của mẫu. */
  readonly idx: number;
  /** 0 = mẫu trung tính (so hai cú bứt phá), khác 0 = so hai lần cùng mẫu. */
  readonly dir: number;
}

/** Bộ bài tập của một bài (một "bộ đề"). */
export interface CdLessonExercises {
  readonly story: readonly CdBar[];
  readonly place: readonly CdPlaceItem[];
  readonly twins: readonly CdTwin[];
  readonly vol: CdVolume;
  readonly hunt: CdHuntSpec;
}

export interface CdHuntResult {
  /** Chỉ số (trong `targets`) của các mẫu đã tìm thấy. */
  readonly foundTargets: number[];
  readonly found: number;
  readonly total: number;
  /** Số lần chạm nhầm. */
  readonly miss: number;
  /** Tìm đủ và nhầm ≤ 1: được sao Săn nến. */
  readonly star: boolean;
}

/**
 * Chấm bước Săn nến từ danh sách chỗ người học chạm (chỉ số nến). Chạm lại vào mẫu đã tìm thấy không bị
 * tính là nhầm; chạm ra ngoài biểu đồ bị bỏ qua.
 */
export function gradeHunt(
  hunt: Pick<CdHuntSpec, 'bars' | 'targets'>,
  taps: readonly number[],
): CdHuntResult {
  const foundTargets: number[] = [];
  let miss = 0;
  const near = (index: number, [start, end]: readonly [number, number]) =>
    index >= start - CD_HUNT_TOLERANCE && index <= end + CD_HUNT_TOLERANCE;
  for (const tap of taps) {
    if (!Number.isInteger(tap) || tap < 0 || tap >= hunt.bars.length) continue;
    const open = hunt.targets.findIndex((t, k) => !foundTargets.includes(k) && near(tap, t));
    if (open >= 0) {
      foundTargets.push(open);
      continue;
    }
    if (hunt.targets.some((t) => near(tap, t))) continue;
    miss += 1;
  }
  const found = foundTargets.length;
  return {
    foundTargets,
    found,
    total: hunt.targets.length,
    miss,
    star: found === hunt.targets.length && miss <= CD_HUNT_MAX_MISS,
  };
}

export interface CdTwinsResult {
  readonly right: number;
  readonly total: number;
  readonly star: boolean;
  readonly correct: boolean[];
}

/** Chấm bước Song sinh: mỗi phần tử là bên người học chọn ('a' hoặc 'b'), thiếu = sai. */
export function gradeTwins(
  twins: readonly Pick<CdTwin, 'goodSide'>[],
  picks: readonly (CdSide | null | undefined)[],
): CdTwinsResult {
  const correct = twins.map((twin, k) => picks[k] === twin.goodSide);
  const right = correct.filter(Boolean).length;
  return { right, total: twins.length, star: right >= CD_TWINS_PASS, correct };
}

export interface CdLessonStars {
  readonly stars: 1 | 2 | 3;
  readonly huntStar: boolean;
  readonly twinStar: boolean;
}

/** Sao của một lần học: 1 sao khi đi hết bài, +1 Săn nến, +1 Song sinh (§5.1). */
export function lessonStars(huntStar: boolean, twinStar: boolean): CdLessonStars {
  return {
    stars: (1 + (huntStar ? 1 : 0) + (twinStar ? 1 : 0)) as 1 | 2 | 3,
    huntStar,
    twinStar,
  };
}

/** Chấm một bài thi đai: số câu đúng. Thiếu câu trả lời = sai. */
export function gradeExam(
  answers: readonly string[],
  chosen: readonly (string | null | undefined)[],
): { score: number; correct: boolean[] } {
  const correct = answers.map((answer, k) => chosen[k] === answer);
  return { score: correct.filter(Boolean).length, correct };
}
