import { fileURLToPath } from 'node:url';

import PDFDocument from 'pdfkit';

/**
 * Be Vietnam Pro (OFL, đủ ký tự tiếng Việt trong một file) là font duy nhất của bản tin. Cả đo chữ để xuống dòng
 * lẫn nhúng vào PDF đều dùng đúng các file này; xem trước SVG gọi cùng tên font trên trình duyệt.
 */
export const FONT_DIR = fileURLToPath(new URL('./fonts/', import.meta.url));

export type FontFace = 'regular' | 'semibold' | 'bold' | 'extrabold';

const FILES: Readonly<Record<FontFace, string>> = {
  regular: 'BeVietnamPro-Regular.ttf',
  semibold: 'BeVietnamPro-SemiBold.ttf',
  bold: 'BeVietnamPro-Bold.ttf',
  extrabold: 'BeVietnamPro-ExtraBold.ttf',
};

export const FONT_FACES = Object.keys(FILES) as FontFace[];

export const fontFile = (face: FontFace): string => `${FONT_DIR}${FILES[face]}`;

/** Độ đậm CSS → file font: 400 và 500 dùng Regular, 600 SemiBold, 700 Bold, từ 800 ExtraBold. */
export function faceOf(weight: number): FontFace {
  if (weight >= 800) return 'extrabold';
  if (weight >= 700) return 'bold';
  if (weight >= 600) return 'semibold';
  return 'regular';
}

/** Tên họ font cho SVG: file thật trùng độ đậm 400, 600, 700, 800 của font web; 500 rơi về 400. */
export const SVG_FONT_FAMILY = "'Be Vietnam Pro', 'Segoe UI', Roboto, Arial, sans-serif";

let metricsDoc: InstanceType<typeof PDFDocument> | null = null;
const widthCache = new Map<string, number>();

function measureDoc(): InstanceType<typeof PDFDocument> {
  if (metricsDoc) return metricsDoc;
  const doc = new PDFDocument({ autoFirstPage: false });
  for (const face of FONT_FACES) doc.registerFont(face, fontFile(face));
  doc.addPage({ size: [100, 100], margin: 0 });
  metricsDoc = doc;
  return doc;
}

/** Bề rộng (px) của chuỗi ở cỡ `size` px, độ đậm `weight`, giãn chữ `spacing` px mỗi ký tự. */
export function measure(text: string, size: number, weight = 400, spacing = 0): number {
  if (!text) return 0;
  const face = faceOf(weight);
  const key = `${face}|${text}`;
  let unit = widthCache.get(key);
  if (unit === undefined) {
    const doc = measureDoc();
    doc.font(face).fontSize(1000);
    unit = doc.widthOfString(text) / 1000;
    widthCache.set(key, unit);
  }
  return unit * size + spacing * [...text].length;
}

/** Chuẩn hoá chuỗi để chữ có dấu dựng sẵn (NFC), tránh dấu rời lệch chỗ trong PDF. */
export const nfc = (text: string): string => text.normalize('NFC');

/**
 * Xuống dòng tham lam theo từ trong bề rộng `maxWidth`. Từ dài hơn cả dòng bị cắt theo ký tự. Chuỗi rỗng
 * cho 0 dòng. Dòng trống do xuống dòng cứng (`\n`) được bỏ.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  size: number,
  weight = 400,
  spacing = 0,
): string[] {
  const lines: string[] = [];
  for (const paragraph of nfc(text).split(/\n+/)) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    let line = '';
    const push = () => {
      if (line) lines.push(line);
      line = '';
    };
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate, size, weight, spacing) <= maxWidth) {
        line = candidate;
        continue;
      }
      push();
      if (measure(word, size, weight, spacing) <= maxWidth) {
        line = word;
        continue;
      }
      // Từ quá dài: cắt theo ký tự.
      let piece = '';
      for (const char of word) {
        if (measure(piece + char, size, weight, spacing) > maxWidth && piece) {
          lines.push(piece);
          piece = char;
        } else piece += char;
      }
      line = piece;
    }
    push();
  }
  return lines;
}
