/** Hàm thuần của "SACO nhận định": ngày Việt Nam, làm sạch bình luận. */

const VN_OFFSET_MS = 7 * 3_600_000;
const DAY_MS = 86_400_000;

/** 00:00 giờ Việt Nam (UTC+7, không có giờ mùa hè) của ngày chứa `now`. */
export function vnDayStart(now: Date): Date {
  const shifted = now.getTime() + VN_OFFSET_MS;
  return new Date(Math.floor(shifted / DAY_MS) * DAY_MS - VN_OFFSET_MS);
}

/** 00:00 ngày kế tiếp theo giờ Việt Nam. */
export function vnNextDayStart(now: Date): Date {
  return new Date(vnDayStart(now).getTime() + DAY_MS);
}

/** `YYYY-MM-DD` theo giờ Việt Nam. */
export function vnDateString(now: Date): string {
  return new Date(now.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

/** Bình luận: bỏ ký tự điều khiển (giữ xuống dòng), gộp dòng trống thừa, cắt hai đầu. */
export function cleanComment(value: string): string {
  return (
    value
      .replace(/\r\n?/g, '\n')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]+/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}
