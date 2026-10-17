import { DEFAULT_SOURCE, SOURCE_SHA256 } from './paths.js';
import { CHART_BUILDERS, ICONS, TEXT_FIGURES } from './charts/index.js';
import { extract } from './extract.js';
import { verify } from './verify.js';

const USAGE = `usage:
  main.js extract [--source <IQX-Hoc-Vien-MAU.html>] [--retired-from <catalog-13ch.v1.json>]
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
    const source = arg(rest, '--source') ?? process.env.ACADEMY_V32_SOURCE ?? DEFAULT_SOURCE;
    const m = extract(source, arg(rest, '--retired-from'), { write: true }).manifest;
    const errors = verify();
    console.log(
      `extracted ${m.counts.lessons} lessons, ${m.counts.banks} banks (${m.counts.questions} questions), ` +
        `${m.counts.charts} charts, ${m.counts.sections} sections from ${m.source.file} (${SOURCE_SHA256.slice(0, 8)})`,
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
    console.log(
      `verify ok: ${Object.keys(CHART_BUILDERS).length} chart builders, ${Object.keys(TEXT_FIGURES).length} text figures, ${Object.keys(ICONS).length} icons`,
    );
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
