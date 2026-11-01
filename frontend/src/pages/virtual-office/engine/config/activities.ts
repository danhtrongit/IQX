import type { ActivityKind, ActivitySpec, Period, Role } from '../types';

const w = (trading: number, lunch: number, after: number): Record<Period, number> => ({ trading, lunch, after });

export const ACTIVITIES: ActivitySpec[] = [
  { kind: 'coffee', label: 'Pha cà phê', weight: w(3, 3, 3), roles: { boss: 1, it: 2, reception: 1 }, duration: [5000, 9000] },
  { kind: 'water', label: 'Uống nước', weight: w(2, 1, 1), roles: { it: 1, reception: 1 }, duration: [3000, 5000] },
  { kind: 'print', label: 'Lấy tài liệu in', weight: w(2, 0, 1), duration: [3000, 6000] },
  { kind: 'board', label: 'Xem bảng điện', weight: w(2, 0, 0), roles: { boss: 2 }, duration: [4000, 8000] },
  { kind: 'chat', label: 'Trao đổi với đồng nghiệp', weight: w(3, 2, 4), roles: { boss: 2 }, duration: [4000, 7000] },
  { kind: 'deskPhone', label: 'Gọi điện cho khách', weight: w(4, 0, 1), duration: [5000, 9000], inPlace: true },
  { kind: 'stretch', label: 'Vươn vai thư giãn', weight: w(1.5, 0.5, 1), roles: { it: 1 }, duration: [3000, 5000], inPlace: true },
  { kind: 'phoneBooth', label: 'Gọi điện riêng trong phòng cách âm', weight: w(1.5, 0.5, 1), roles: { boss: 0.5 }, duration: [7000, 12000] },
  { kind: 'restroom', label: 'Đi vệ sinh', weight: w(1, 1, 1), roles: { boss: 0.5, it: 1, reception: 0.7 }, duration: [5000, 8000] },
  { kind: 'lunch', label: 'Ăn trưa ở căng-tin', weight: w(0, 10, 0), roles: { boss: 0, it: 10 }, duration: [20000, 32000] },
  { kind: 'pingpong', label: 'Chơi bóng bàn', weight: w(0.3, 2, 4), roles: { it: 2 }, duration: [14000, 22000], pair: true },
  { kind: 'foosball', label: 'Chơi bi lắc', weight: w(0.3, 2, 3), roles: { it: 2 }, duration: [12000, 18000], pair: true },
  { kind: 'spectate', label: 'Xem đồng nghiệp chơi', weight: w(0, 1, 2), duration: [6000, 10000] },
  { kind: 'server', label: 'Kiểm tra phòng máy chủ', weight: w(0, 0, 0), roles: { it: 6 }, duration: [8000, 14000] },
  { kind: 'sneakyGame', label: 'Lén chơi game', weight: w(1.2, 1.5, 2), roles: { it: 2 }, duration: [8000, 15000], inPlace: true },
  { kind: 'scroll', label: 'Lướt điện thoại', weight: w(1.5, 2.5, 2), roles: { boss: 0.5, it: 1, reception: 1 }, duration: [5000, 9000], inPlace: true },
  { kind: 'nap', label: 'Ngủ gật', weight: w(0.2, 2.5, 0.5), roles: { it: 1 }, duration: [10000, 16000], inPlace: true },
  { kind: 'argue', label: 'Cãi nhau với đồng nghiệp', weight: w(0.35, 0.2, 0.4), duration: [6000, 9000], pair: true },
  { kind: 'patrol', label: 'Đi một vòng kiểm tra', weight: w(0, 0, 0), roles: { boss: 5 }, duration: [2500, 4000] },
  { kind: 'meeting', label: 'Họp chiến lược', weight: w(0, 0, 0), duration: [14000, 18000] },
  { kind: 'consult', label: 'Tư vấn khách hàng VIP', weight: w(0, 0, 0), duration: [18000, 26000] },
  { kind: 'wait', label: 'Chờ được tư vấn', weight: w(0, 0, 0), duration: [60000, 60000] },
];

export const activitySpec = (kind: ActivityKind): ActivitySpec => ACTIVITIES.find((a) => a.kind === kind)!;

/** Weight of an activity for a role in a period. */
export function activityWeight(a: ActivitySpec, role: Role, period: Period): number {
  if (role === 'staff') return a.weight[period];
  const r = a.roles?.[role];
  if (r === undefined) return role === 'boss' || role === 'it' ? a.weight[period] * 0.5 : 0;
  return period === 'lunch' && a.weight.lunch === 0 && a.kind !== 'lunch' ? 0 : r;
}

export function pickWeighted<T>(items: readonly T[], weight: (t: T) => number): T | null {
  const total = items.reduce((s, t) => s + weight(t), 0);
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (const t of items) {
    r -= weight(t);
    if (r <= 0) return t;
  }
  return items[items.length - 1];
}
