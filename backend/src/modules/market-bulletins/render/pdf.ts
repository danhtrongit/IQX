import PDFDocument from 'pdfkit';

import { PX_TO_PT } from '../bulletin.constants.js';
import type { PageDoc, Prim } from './canvas.js';
import { FONT_FACES, faceOf, fontFile, measure } from './fonts.js';

type Doc = InstanceType<typeof PDFDocument>;

const S = PX_TO_PT;

function dashOf(dash: string | undefined): [number, number] | null {
  if (!dash) return null;
  const parts = dash
    .split(/[\s,]+/)
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > 0);
  if (!parts.length) return null;
  return [parts[0]! * S, (parts[1] ?? parts[0]!) * S];
}

function strokeFill(
  doc: Doc,
  style: { fill?: string; stroke?: string; sw?: number; op?: number; dash?: string },
): void {
  const dash = dashOf(style.dash);
  doc.save();
  if (style.op !== undefined) doc.opacity(style.op);
  if (style.stroke) {
    doc
      .lineWidth((style.sw ?? 1) * S)
      .lineJoin('round')
      .lineCap('round');
    if (dash) doc.dash(dash[0], { space: dash[1] });
  }
  if (style.fill && style.stroke) doc.fillAndStroke(style.fill, style.stroke);
  else if (style.fill) doc.fill(style.fill);
  else if (style.stroke) doc.stroke(style.stroke);
  doc.restore();
}

function drawPrim(doc: Doc, prim: Prim): void {
  switch (prim.k) {
    case 'rect': {
      if (prim.rx) doc.roundedRect(prim.x * S, prim.y * S, prim.w * S, prim.h * S, prim.rx * S);
      else doc.rect(prim.x * S, prim.y * S, prim.w * S, prim.h * S);
      strokeFill(doc, prim);
      return;
    }
    case 'line': {
      doc.moveTo(prim.x1 * S, prim.y1 * S).lineTo(prim.x2 * S, prim.y2 * S);
      strokeFill(doc, { stroke: prim.stroke, sw: prim.sw, dash: prim.dash, op: prim.op });
      return;
    }
    case 'poly': {
      const [first, ...rest] = prim.pts;
      if (!first) return;
      doc.moveTo(first[0] * S, first[1] * S);
      for (const [x, y] of rest) doc.lineTo(x * S, y * S);
      if (prim.closed) doc.closePath();
      strokeFill(doc, prim);
      return;
    }
    case 'circle': {
      doc.circle(prim.cx * S, prim.cy * S, prim.r * S);
      strokeFill(doc, prim);
      return;
    }
    case 'text': {
      const face = faceOf(prim.weight);
      const width = measure(prim.text, prim.size, prim.weight, prim.spacing);
      const x =
        prim.anchor === 'middle'
          ? prim.x - width / 2
          : prim.anchor === 'end'
            ? prim.x - width
            : prim.x;
      const options = {
        lineBreak: false,
        baseline: 'alphabetic' as const,
        ...(prim.spacing ? { characterSpacing: prim.spacing * S } : {}),
      };
      doc.font(face).fontSize(prim.size * S);
      if (prim.halo) {
        doc.save();
        doc
          .fillColor(prim.halo.color)
          .strokeColor(prim.halo.color)
          .lineWidth(prim.halo.width * S)
          .lineJoin('round');
        doc.text(prim.text, x * S, prim.y * S, { ...options, fill: true, stroke: true });
        doc.restore();
      }
      doc.fillColor(prim.color).text(prim.text, x * S, prim.y * S, options);
      return;
    }
    case 'link': {
      doc.link(prim.x * S, prim.y * S, prim.w * S, prim.h * S, prim.url);
      return;
    }
  }
}

export type PdfMeta = { title: string; subject?: string; createdAt: Date };

/**
 * Các trang → một file PDF vector: chữ nhúng Be Vietnam Pro (có lớp chữ để chọn, sao chép), liên kết mã là
 * chú thích liên kết nên PDF.js dựng được lớp liên kết. Ngày tạo lấy theo `createdAt` để file lặp lại được.
 */
export function renderPdf(pages: readonly PageDoc[], meta: PdfMeta): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      autoFirstPage: false,
      compress: true,
      info: {
        Title: meta.title,
        Subject: meta.subject ?? 'Bản tin thị trường IQX',
        Author: 'IQX',
        Creator: 'IQX',
        Producer: 'IQX',
        CreationDate: meta.createdAt,
        ModDate: meta.createdAt,
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      for (const face of FONT_FACES) doc.registerFont(face, fontFile(face));
      for (const page of pages) {
        doc.addPage({ size: [page.width * S, page.height * S], margin: 0 });
        for (const prim of page.prims) drawPrim(doc, prim);
      }
      doc.end();
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
