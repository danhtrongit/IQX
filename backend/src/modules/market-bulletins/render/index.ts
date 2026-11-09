import type { BulletinVariant } from '../bulletin.constants.js';
import { dmy } from '../bulletin.format.js';
import { renderBulletin, type BulletinRenderInput, type RenderedBulletin } from './pages.js';
import { renderPdf } from './pdf.js';
import { pageToSvg } from './svg.js';

export type { BulletinRenderInput, RenderedBulletin } from './pages.js';
export { renderBulletin } from './pages.js';
export { pageToSvg } from './svg.js';
export type { PageDoc } from './canvas.js';

/** SVG từng trang để xem trước trong trang quản trị (cùng mô hình vẽ với PDF). */
export function renderBulletinSvgs(
  input: BulletinRenderInput,
  variant: BulletinVariant,
): { svgs: string[]; overflow: RenderedBulletin['overflow'] } {
  const rendered = renderBulletin(input, variant);
  return { svgs: rendered.pages.map(pageToSvg), overflow: rendered.overflow };
}

/** File PDF Public của một bản (máy tính hoặc điện thoại). */
export async function renderBulletinPdf(
  input: BulletinRenderInput,
  variant: BulletinVariant,
  createdAt: Date,
): Promise<{ pdf: Buffer; overflow: RenderedBulletin['overflow'] }> {
  const rendered = renderBulletin(input, variant);
  const pdf = await renderPdf(rendered.pages, {
    title: `Bản tin thị trường ${dmy(input.date)} (${variant === 'desktop' ? 'máy tính' : 'điện thoại'})`,
    createdAt,
  });
  return { pdf, overflow: rendered.overflow };
}
