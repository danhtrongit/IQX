/**
 * Nhận diện tài khoản phụ của Flashback (spec v1.1 §2.10.5, spec 22-10 FB-07).
 *
 * Hai tài khoản trở lên cùng tham gia một đề và dùng chung một dấu hiệu thì bị đánh dấu:
 * - `same_device`: cùng mã thiết bị do trình duyệt sinh (gửi kèm khi tham gia).
 * - `same_phone`: cùng số điện thoại.
 * - `same_ip`: cùng địa chỉ IP lúc tham gia.
 *
 * User-agent không còn dùng: nhiều máy cùng phiên bản trình duyệt có cùng user-agent.
 * Hàm thuần, dùng chung cho màn quản trị và bước trả thưởng của tác vụ.
 */

import type { FlashbackEntrySignal } from './flashback.types.js';

export type FlashbackSuspectReason = 'same_device' | 'same_phone' | 'same_ip';

/** Một nhóm tài khoản dùng chung một dấu hiệu. */
export interface FlashbackSuspectGroup {
  readonly reason: FlashbackSuspectReason;
  readonly shared: string;
  readonly userIds: readonly string[];
  readonly usernames: readonly string[];
}

const SIGNAL_OF: Record<FlashbackSuspectReason, (signal: FlashbackEntrySignal) => string | null> = {
  same_device: (signal) => signal.deviceId,
  same_phone: (signal) => signal.phone,
  same_ip: (signal) => signal.joinIp,
};

/** Các nhóm tài khoản bị đánh dấu trong một đề, nhóm đông nhất trước. */
export function flashbackSuspectGroups(
  signals: readonly FlashbackEntrySignal[],
): FlashbackSuspectGroup[] {
  const groups: FlashbackSuspectGroup[] = [];
  for (const reason of Object.keys(SIGNAL_OF) as FlashbackSuspectReason[]) {
    const buckets = new Map<string, Map<string, string>>();
    for (const signal of signals) {
      const value = SIGNAL_OF[reason](signal)?.trim();
      if (!value) continue;
      const bucket = buckets.get(value) ?? new Map<string, string>();
      bucket.set(signal.userId, signal.username);
      buckets.set(value, bucket);
    }
    for (const [shared, users] of buckets) {
      if (users.size < 2) continue;
      groups.push({ reason, shared, userIds: [...users.keys()], usernames: [...users.values()] });
    }
  }
  return groups.sort((left, right) => right.userIds.length - left.userIds.length);
}

/** Tài khoản bị đánh dấu trong một đề và các lý do (cách nhau dấu phẩy, sắp xếp ổn định). */
export function flashbackFlaggedUsers(
  signals: readonly FlashbackEntrySignal[],
): Map<string, string> {
  const reasons = new Map<string, Set<FlashbackSuspectReason>>();
  for (const group of flashbackSuspectGroups(signals)) {
    for (const userId of group.userIds) {
      const set = reasons.get(userId) ?? new Set<FlashbackSuspectReason>();
      set.add(group.reason);
      reasons.set(userId, set);
    }
  }
  return new Map([...reasons].map(([userId, set]) => [userId, [...set].sort().join(',')]));
}
