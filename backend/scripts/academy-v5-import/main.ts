/**
 * Học viện v5 importer (plan HV v5 T1, D15). Writes `src/modules/academy/content/v5/` from the frozen `content/v4/`
 * files and the approved mockup `IQX-Hoc-Vien-v5-MAU.html` (sha pinned in paths.ts):
 *   - 117 v4 lesson files copied (only `order` changes in Chương 10-12), Chương 8 / 9 patched with "Ở các ngành"
 *   - 87 new lesson files extracted from the mockup (FIG drawings -> `figure` charts, REPD -> `fundamental` charts)
 *   - 116 v4 lesson banks, the practice bank and the Chương 1-9 exam banks copied; 87 lesson banks and the Chương 10-17
 *     exam banks built from the mockup `IT` (salts in overrides/salts.json)
 * Fixes never go into the output by hand: `overrides/text.json` (exact source text -> replacement, every entry must be
 * used) and a re-run.
 *
 *   cd backend && npm run build
 *   node dist/scripts/academy-v5-import/main.js extract [--source <IQX-Hoc-Vien-v5-MAU.html>]
 *   node dist/scripts/academy-v5-import/main.js verify
 */
import { extract } from './extract.js';
import { defaultSource, SOURCE_SHA256 } from './paths.js';
import { verify } from './verify.js';

const USAGE = `usage:
  main.js extract [--source <IQX-Hoc-Vien-v5-MAU.html>]
  main.js verify`;

function arg(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i < 0) return undefined;
  const v = argv[i + 1];
  if (!v || v.startsWith('--')) throw new Error(`${name} needs a value`);
  return v;
}

function main(argv: string[]): number {
  const [cmd, ...rest] = argv;
  if (cmd === 'extract') {
    const source = arg(rest, '--source') ?? process.env.ACADEMY_V5_SOURCE ?? defaultSource();
    const m = extract(source, { write: true }).manifest;
    const errors = verify(undefined, { reextract: false });
    console.log(
      `extracted ${m.counts.chapters} chapters, ${m.counts.required_lessons} lessons (${m.counts.lesson_files} files: ` +
        `${Object.entries(m.counts.origins)
          .map(([k, n]) => `${n} ${k}`)
          .join(', ')}), ${m.counts.banks} banks ` +
        `(${m.counts.questions} questions), ${m.counts.figures} figures, ${m.counts.rep_charts} representative charts ` +
        `from ${m.source.file} (${SOURCE_SHA256.slice(0, 8)})`,
    );
    if (m.warnings.length) console.log(`${m.warnings.length} warnings (see import-manifest.json)`);
    if (errors.length) {
      console.error(`verify failed:\n  ${errors.join('\n  ')}`);
      return 1;
    }
    console.log('verify ok');
    return 0;
  }
  if (cmd === 'verify') {
    const errors = verify();
    if (errors.length) {
      console.error(`verify failed:\n  ${errors.join('\n  ')}`);
      return 1;
    }
    console.log('verify ok');
    return 0;
  }
  console.error(USAGE);
  return 2;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
}
