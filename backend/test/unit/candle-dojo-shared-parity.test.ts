import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Bộ nhận diện, danh mục thẻ, danh mục bài và luật chấm là MỘT bộ mã dùng chung cho backend (server chấm lại,
 * Flashback) và frontend (màn học, Flashback): bản gốc ở `backend/src/modules/candle-dojo/shared/`, bản sao
 * nguyên văn ở `frontend/src/lib/candle-dojo/`. Test này giữ hai bản giống từng byte; sửa bản gốc rồi chép sang.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const backendShared = join(root, 'backend', 'src', 'modules', 'candle-dojo', 'shared');
const frontendShared = join(root, 'frontend', 'src', 'lib', 'candle-dojo');
const hasFrontend = existsSync(frontendShared);

describe.skipIf(!hasFrontend)('bản sao chung backend và frontend giống từng byte', () => {
  for (const file of ['detector.ts', 'cards.ts', 'lessons.ts', 'grading.ts']) {
    it(file, () => {
      expect(readFileSync(join(frontendShared, file), 'utf8')).toBe(
        readFileSync(join(backendShared, file), 'utf8'),
      );
    });
  }

  it('bài tập (exercises.json) giống nhau', () => {
    expect(readFileSync(join(frontendShared, 'content', 'exercises.json'), 'utf8')).toBe(
      readFileSync(
        join(root, 'backend', 'src', 'modules', 'candle-dojo', 'content', 'exercises.json'),
        'utf8',
      ),
    );
  });
});
