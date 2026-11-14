/** Đồng hồ của Khu giao dịch, thay được trong test (giờ nghi lễ, mốc tin nhắn, mốc chấm điểm). */

export const FLOOR_CLOCK = Symbol('FLOOR_CLOCK');

export interface FloorClock {
  now(): Date;
}

export const systemFloorClock: FloorClock = { now: () => new Date() };
