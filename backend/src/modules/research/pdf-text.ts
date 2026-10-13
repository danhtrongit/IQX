import { extractText, getDocumentProxy } from 'unpdf';

export type PdfTextErrorCode = 'unreadable' | 'no_text';

/** Thrown for corrupt/encrypted PDFs ('unreadable') and scanned PDFs without a text layer ('no_text'). */
export class PdfTextError extends Error {
  constructor(
    readonly code: PdfTextErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PdfTextError';
  }
}

/** A text layer shorter than this (all pages together) is treated as a scanned document. */
const MIN_TEXT_CHARS = 200;

/** Extracts text with `\n[[page N]]\n` markers so claims can cite `source_page`. */
export async function extractPdfText(bytes: Uint8Array): Promise<{ text: string; pages: number }> {
  let pages: string[];
  try {
    // unpdf transfers the buffer to its worker; pass a copy so the caller keeps its bytes.
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const result = await extractText(pdf, { mergePages: false });
    pages = result.text;
  } catch (error) {
    throw new PdfTextError('unreadable', `Cannot read PDF: ${(error as Error).message}`);
  }
  const cleaned = pages.map((page) =>
    page
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  );
  const total = cleaned.reduce((sum, page) => sum + page.length, 0);
  if (total < MIN_TEXT_CHARS)
    throw new PdfTextError('no_text', 'PDF has no extractable text (scanned?)');
  const text = cleaned.map((page, index) => `\n[[page ${index + 1}]]\n${page}`).join('\n');
  return { text, pages: cleaned.length };
}
