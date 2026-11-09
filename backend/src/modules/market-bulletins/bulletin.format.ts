/** Định dạng số, ngày kiểu Việt Nam cho bản tin; tự viết để không phụ thuộc ICU của máy chủ. */

const WEEKDAYS = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

const group = (digits: string): string => digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** `1755.612` → `1.755,61`; thiếu số liệu → `—`. */
export function nf(value: number | null | undefined, minDigits = 1, maxDigits = minDigits): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const rounded = Number(Math.abs(value).toFixed(maxDigits));
  let text = rounded.toFixed(maxDigits);
  if (maxDigits > minDigits && text.includes('.')) {
    // Cắt bớt chữ số 0 thừa nhưng giữ tối thiểu `minDigits`.
    let end = text.length;
    const dot = text.indexOf('.');
    while (end > dot + 1 + minDigits && text[end - 1] === '0') end -= 1;
    text = text.slice(0, end);
    if (text.endsWith('.')) text = text.slice(0, -1);
  }
  const [whole = '0', fraction] = text.split('.');
  const body = fraction ? `${group(whole)},${fraction}` : group(whole);
  return value < 0 && rounded !== 0 ? `-${body}` : body;
}

/** Số có dấu: `+1,35` / `−0,52` / `0,00` (dấu trừ U+2212). */
export function sg(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const body = nf(Math.abs(value), digits);
  if (Number(Math.abs(value).toFixed(digits)) === 0) return body;
  return `${value > 0 ? '+' : '−'}${body}`;
}

export function dmy(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

export function dm(iso: string): string {
  return dmy(iso).slice(0, 5);
}

export function weekdayOf(iso: string): string {
  return WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()]!;
}

/** `Thứ Năm, 29/10/2026`. */
export function longDate(iso: string): string {
  return `${weekdayOf(iso)}, ${dmy(iso)}`;
}

/** Giờ Việt Nam `hh:mm` của một mốc thời gian. */
export function vnTime(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/** Làm tròn số điểm tới hàng đơn vị (gợi ý hỗ trợ, kháng cự). */
export const round0 = (value: number): number => Math.round(value);
