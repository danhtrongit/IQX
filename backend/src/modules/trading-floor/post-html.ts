/**
 * Bộ lọc HTML của bài SACO nhận định (spec "SACO nhận định", mục Dán từ Word và trang web).
 * Chạy ở máy chủ khi lưu, khi đăng và lần nữa khi đọc ra, nên dù trình duyệt gửi gì lên, người đọc
 * chỉ nhận đúng tập thẻ và thuộc tính dưới đây. Hàm thuần, không đụng tới cơ sở dữ liệu.
 *
 * Giữ: h1 h2 h3 p br strong b em i u s span[style=color] blockquote ul ol li
 * a[href=https://…, target=_blank, rel=noopener noreferrer nofollow] hr table thead tbody tr th td
 * [colspan, rowspan] figure[data-align, data-width 15..100] img[src là ảnh của khu giao dịch, alt]
 * figcaption, và `style="text-align:left|center|right"` trên các khối.
 * Bỏ: font, cỡ chữ, class, style khác, script, iframe, chú thích HTML, trình xử lý sự kiện.
 */

import sanitizeHtml from 'sanitize-html';

/** Tiền tố đường dẫn ảnh bài viết; chỉ ảnh do chính máy chủ này lưu mới được nhúng. */
export const POST_IMAGE_URL_PREFIX = '/api/v2/trading-floor/post-images/';

const IMAGE_SRC = /^\/api\/v2\/trading-floor\/post-images\/[0-9a-fA-F-]{8,64}$/;
const HTTPS_URL = /^https:\/\/[^\s"'<>]+$/i;
const ALIGN = /^(left|center|right)$/;
const COLOR = [
  /^#[0-9a-f]{3,8}$/i,
  /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/i,
];
const BLOCK_TAGS_WITH_ALIGN = ['h1', 'h2', 'h3', 'p', 'blockquote', 'li', 'th', 'td'] as const;

/** Số nguyên dương nhỏ cho colspan / rowspan; trả undefined nếu không hợp lệ. */
function span(value: string | undefined): string | undefined {
  if (!value || !/^\d{1,2}$/.test(value)) return undefined;
  const n = Number(value);
  return n >= 1 && n <= 50 ? String(n) : undefined;
}

const options: sanitizeHtml.IOptions = {
  allowedTags: [
    'h1',
    'h2',
    'h3',
    'p',
    'br',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'span',
    'blockquote',
    'ul',
    'ol',
    'li',
    'a',
    'hr',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'figure',
    'img',
    'figcaption',
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    span: ['style'],
    th: ['style', 'colspan', 'rowspan'],
    td: ['style', 'colspan', 'rowspan'],
    figure: ['data-align', 'data-width'],
    img: ['src', 'alt'],
    ...Object.fromEntries(
      BLOCK_TAGS_WITH_ALIGN.filter((tag) => tag !== 'th' && tag !== 'td').map((tag) => [
        tag,
        ['style'],
      ]),
    ),
  },
  allowedStyles: {
    span: { color: COLOR },
    ...Object.fromEntries(BLOCK_TAGS_WITH_ALIGN.map((tag) => [tag, { 'text-align': [ALIGN] }])),
  },
  // Nội dung của các thẻ này bị bỏ hẳn thay vì giữ phần chữ bên trong.
  nonTextTags: ['script', 'style', 'textarea', 'option', 'iframe', 'noscript', 'object', 'embed'],
  allowedSchemes: ['https'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  transformTags: {
    a: (_tagName, attribs) => {
      const href = (attribs.href ?? '').trim();
      // Liên kết không phải https: giữ chữ, bỏ liên kết.
      const attributes: Record<string, string> = HTTPS_URL.test(href)
        ? { href, target: '_blank', rel: 'noopener noreferrer nofollow' }
        : {};
      return { tagName: HTTPS_URL.test(href) ? 'a' : 'span', attribs: attributes };
    },
    figure: (_tagName, attribs) => {
      const out: Record<string, string> = {};
      const align = (attribs['data-align'] ?? '').trim();
      if (ALIGN.test(align)) out['data-align'] = align;
      const width = (attribs['data-width'] ?? '').trim();
      if (/^\d{2,3}$/.test(width) && Number(width) >= 15 && Number(width) <= 100)
        out['data-width'] = String(Number(width));
      return { tagName: 'figure', attribs: out };
    },
    img: (_tagName, attribs) => {
      const src = (attribs.src ?? '').trim();
      // Ảnh ngoài bị bỏ ở exclusiveFilter: ở đây chỉ chuẩn hoá thuộc tính.
      const out: Record<string, string> = {};
      if (IMAGE_SRC.test(src)) out.src = src;
      if (attribs.alt) out.alt = attribs.alt.slice(0, 300);
      return { tagName: 'img', attribs: out };
    },
    th: (_tagName, attribs) => ({ tagName: 'th', attribs: spanAttribs(attribs) }),
    td: (_tagName, attribs) => ({ tagName: 'td', attribs: spanAttribs(attribs) }),
  },
  exclusiveFilter: (frame) => frame.tag === 'img' && !frame.attribs.src,
};

function spanAttribs(attribs: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  if (attribs.style) out.style = attribs.style;
  const colspan = span(attribs.colspan);
  if (colspan) out.colspan = colspan;
  const rowspan = span(attribs.rowspan);
  if (rowspan) out.rowspan = rowspan;
  return out;
}

/** Lọc HTML của một bài; luôn trả HTML an toàn, chuỗi rỗng khi đầu vào rỗng. */
export function sanitizePostHtml(html: string): string {
  if (!html) return '';
  return sanitizeHtml(html, options);
}

const INVISIBLE = new RegExp('[\\s\\u200b-\\u200d\\u2060\\ufeff]', 'g');

/** Không có chữ nào và không có ảnh: "Nội dung bài đang trống". */
export function isBodyEmpty(html: string): boolean {
  if (!html) return true;
  if (/<img\b/i.test(html)) return false;
  const text = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;|&#160;|&#xa0;/gi, ' ')
    // Ký tự vô hình cũng không tính là chữ (khoảng trắng, zero-width, word joiner, BOM).
    .replace(INVISIBLE, '');
  return text.length === 0;
}

/** Câu tiêu điểm: bỏ ký tự điều khiển, gộp khoảng trắng, cắt hai đầu. */
export function cleanHeadline(value: string): string {
  return (
    value
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** Số ký tự người dùng nhìn thấy (theo điểm mã, không theo đơn vị UTF-16). */
export function charLength(value: string): number {
  let count = 0;
  for (const _ of value) count += 1;
  return count;
}

export function truncateChars(value: string, max: number): string {
  const chars = Array.from(value);
  return chars.length <= max ? value : chars.slice(0, max).join('');
}
