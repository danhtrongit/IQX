import { describe, expect, it } from 'vitest';

import {
  charLength,
  cleanHeadline,
  isBodyEmpty,
  sanitizePostHtml,
  truncateChars,
} from '../../src/modules/trading-floor/post-html.js';

const IMG = '/api/v2/trading-floor/post-images/0b7e6c1e-2f55-4d0a-9d4e-6f0d1b6f5a11';

describe('sanitizePostHtml: giữ định dạng cho phép', () => {
  it('giữ tiêu đề, đoạn, đậm nghiêng gạch chân gạch ngang, danh sách, trích dẫn, đường kẻ', () => {
    const html =
      '<h1>A</h1><h2>B</h2><h3>C</h3><p>x <strong>đậm</strong> <b>b</b> <em>n</em> <i>i</i> <u>u</u> <s>s</s><br></p>' +
      '<blockquote><p>q</p></blockquote><ul><li>a</li></ul><ol><li>b</li></ol><hr>';
    const out = sanitizePostHtml(html);
    for (const part of [
      '<h1>A</h1>',
      '<h2>B</h2>',
      '<h3>C</h3>',
      '<strong>đậm</strong>',
      '<u>u</u>',
      '<s>s</s>',
      '<br />',
      '<blockquote>',
      '<ul><li>a</li></ul>',
      '<ol><li>b</li></ol>',
      '<hr />',
    ])
      expect(out).toContain(part);
  });

  it('giữ màu chữ trên span và căn lề trên khối, bỏ style khác', () => {
    const out = sanitizePostHtml(
      '<p style="text-align:center;font-size:30px;mso-line-height-rule:exactly">x</p>' +
        '<span style="color:#ff0000;font-family:Arial">r</span>' +
        '<span style="color:rgb(10, 20, 30)">g</span>' +
        '<span style="color:red;background:url(javascript:1)">n</span>',
    );
    expect(out).toContain('<p style="text-align:center">x</p>');
    expect(out).toContain('<span style="color:#ff0000">r</span>');
    expect(out).toContain('<span style="color:rgb(10, 20, 30)">g</span>');
    expect(out).not.toContain('font-size');
    expect(out).not.toContain('font-family');
    expect(out).not.toContain('background');
    expect(out).not.toContain('javascript');
    expect(sanitizePostHtml('<p style="text-align:justify">x</p>')).toBe('<p>x</p>');
  });

  it('giữ bảng với colspan rowspan', () => {
    const out = sanitizePostHtml(
      '<table class="x" width="100"><thead><tr><th colspan="2" style="text-align:right">H</th></tr></thead>' +
        '<tbody><tr><td rowspan="3" onclick="a()">1</td><td colspan="x">2</td></tr></tbody></table>',
    );
    expect(out).toContain('<table>');
    expect(out).toContain('<th style="text-align:right" colspan="2">H</th>');
    expect(out).toContain('<td rowspan="3">1</td>');
    expect(out).toContain('<td>2</td>');
    expect(out).not.toContain('class');
    expect(out).not.toContain('onclick');
  });

  it('giữ figure với data-align, data-width hợp lệ, ảnh của khu giao dịch và chú thích', () => {
    const out = sanitizePostHtml(
      `<figure data-align="center" data-width="60" class="z"><img src="${IMG}" alt="a" width="900" onerror="x()"><figcaption>Chú thích</figcaption></figure>`,
    );
    expect(out).toContain('<figure data-align="center" data-width="60">');
    expect(out).toContain(`<img src="${IMG}" alt="a" />`);
    expect(out).toContain('<figcaption>Chú thích</figcaption>');
    expect(out).not.toContain('onerror');
    expect(out).not.toContain('width="900"');
  });

  it('bỏ data-align và data-width sai miền giá trị', () => {
    expect(sanitizePostHtml('<figure data-align="top" data-width="5"></figure>')).toBe(
      '<figure></figure>',
    );
    expect(sanitizePostHtml('<figure data-width="101"></figure>')).toBe('<figure></figure>');
    expect(sanitizePostHtml('<figure data-align="right" data-width="15"></figure>')).toBe(
      '<figure data-align="right" data-width="15"></figure>',
    );
  });

  it('liên kết https tự thêm target và rel', () => {
    const out = sanitizePostHtml('<a href="https://iqx.vn/x?a=1&b=2" onclick="x()">xem</a>');
    expect(out).toContain('href="https://iqx.vn/x?a=1&amp;b=2"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
    expect(out).not.toContain('onclick');
  });
});

describe('sanitizePostHtml: bỏ phần không an toàn', () => {
  it('bỏ script, iframe, style, chú thích HTML và trình xử lý sự kiện', () => {
    const out = sanitizePostHtml(
      '<p onmouseover="a()">hi</p><script>alert(1)</script><iframe src="https://evil.test">kept?</iframe>' +
        '<style>p{color:red}</style><!-- ghi chú --><p>ok</p>',
    );
    expect(out).toBe('<p>hi</p><p>ok</p>');
  });

  it('bỏ thẻ font nhưng giữ chữ, bỏ class và mso- của Word', () => {
    const out = sanitizePostHtml(
      '<p class="MsoNormal" style="mso-margin-top-alt:auto;margin:0"><font face="Arial" size="5" color="red">Chữ</font><o:p></o:p></p>',
    );
    expect(out).toBe('<p>Chữ</p>');
  });

  it('liên kết http, javascript, protocol-relative mất liên kết nhưng giữ chữ', () => {
    for (const href of ['http://a.test', 'javascript:alert(1)', '//a.test', 'data:text/html,x'])
      expect(sanitizePostHtml(`<a href="${href}">chữ</a>`)).toBe('<span>chữ</span>');
  });

  it('bỏ ảnh có nguồn ngoài hoặc data URI, ảnh không src', () => {
    expect(sanitizePostHtml('<img src="https://evil.test/a.png">')).toBe('');
    expect(sanitizePostHtml('<img src="http://evil.test/a.png">')).toBe('');
    expect(sanitizePostHtml('<img src="data:image/png;base64,AAAA">')).toBe('');
    expect(sanitizePostHtml('<img alt="x">')).toBe('');
    expect(sanitizePostHtml('<img src="/api/v2/trading-floor/post-images/../../etc/passwd">')).toBe(
      '',
    );
    expect(sanitizePostHtml('<img src="/api/v2/media/abc">')).toBe('');
  });

  it('chuỗi rỗng và không đổi khi lọc lần hai', () => {
    expect(sanitizePostHtml('')).toBe('');
    const once = sanitizePostHtml(
      `<h2 style="text-align:left">T</h2><figure data-align="left" data-width="40"><img src="${IMG}" alt=""><figcaption>c</figcaption></figure><a href="https://a.test">l</a>`,
    );
    expect(sanitizePostHtml(once)).toBe(once);
  });
});

describe('isBodyEmpty', () => {
  it('rỗng khi không chữ và không ảnh', () => {
    expect(isBodyEmpty('')).toBe(true);
    expect(isBodyEmpty('<p></p>')).toBe(true);
    expect(isBodyEmpty('<p>&nbsp; </p><p><br></p>')).toBe(true);
    expect(isBodyEmpty('<p>​</p><hr>')).toBe(true);
    expect(isBodyEmpty('<script>alert(1)</script>')).toBe(true);
  });

  it('không rỗng khi có chữ hoặc ảnh', () => {
    expect(isBodyEmpty('<p>a</p>')).toBe(false);
    expect(isBodyEmpty(`<figure><img src="${IMG}"></figure>`)).toBe(false);
    expect(isBodyEmpty('<table><tr><td>1</td></tr></table>')).toBe(false);
  });
});

describe('câu tiêu điểm', () => {
  it('bỏ ký tự điều khiển, gộp khoảng trắng, cắt hai đầu', () => {
    expect(cleanHeadline('  VN-Index\u0000 \n\t giữ   mốc  1.250 \u0007 ')).toBe(
      'VN-Index giữ mốc 1.250',
    );
  });

  it('đếm theo điểm mã và cắt không làm hỏng ký tự', () => {
    expect(charLength('abc😀')).toBe(4);
    expect(truncateChars('ab😀cd', 3)).toBe('ab😀');
    expect(truncateChars('ab', 3)).toBe('ab');
  });
});
