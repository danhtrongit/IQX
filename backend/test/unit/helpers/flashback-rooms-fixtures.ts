/**
 * Dụng cụ dùng chung của các test đơn vị của FlashbackRoomsService: bộ nến giả lập, dịch vụ dựng
 * trên kho trong bộ nhớ với đồng hồ giả, và vài hàm dựng phòng / chơi tới một phiên.
 */

import type { FlashbackBar } from '../../../src/modules/flashback/flashback.types.js';
import {
  FlashbackRoomsService,
  type FbDatasetPort,
  type FbMatchDataset,
} from '../../../src/modules/flashback/flashback-rooms.service.js';
import { MemoryRoomsRepository, memoryDatabase } from './flashback-rooms-memory.js';

export const T0 = new Date('2026-10-30T03:00:00.000Z');
export const CASH = 10_000_000n;

/** Nến có ngày thật năm 2015 và mã FPT/VNM: không được xuất hiện trong phản hồi trước khi hết ván. */
export function makeDataset(
  symbol: string,
  viewBars: number,
  playBars: number,
  close: (index: number) => number,
): FbMatchDataset {
  const bar = (index: number, offset: number): FlashbackBar => {
    const c = close(index);
    return {
      d: new Date(Date.UTC(2015, 0, 1) + (index + offset) * 86_400_000).toISOString().slice(0, 10),
      o: c,
      h: c,
      l: c,
      c,
      v: 1_000_000,
    };
  };
  return {
    symbol,
    warmupBars: Array.from({ length: 252 }, (_, index) => bar(0, index - 400)),
    bars: Array.from({ length: viewBars + playBars }, (_, index) => bar(index, 0)),
    priceSource: 'VCI:dong:adjusted',
    fallbackLevel: 0,
  };
}

/** Giá theo phiên chơi: phiên k (k = index − view + 1) đóng cửa 10.000 + 100·k. */
export const rising = (viewBars: number) => (index: number) =>
  10_000 + Math.max(0, index - (viewBars - 1)) * 100;

export function setup(options: { close?: (viewBars: number) => (index: number) => number } = {}) {
  const repository = new MemoryRoomsRepository();
  const clock = { at: new Date(T0) };
  const symbols = ['FPT', 'VNM', 'HPG', 'MWG'];
  const picks: string[] = [];
  const dataset: FbDatasetPort = {
    pick: async (_now, viewBars, playBars) => {
      const symbol = symbols[picks.length % symbols.length]!;
      picks.push(symbol);
      return makeDataset(symbol, viewBars, playBars, (options.close ?? rising)(viewBars));
    },
  };
  const service = new FlashbackRoomsService(memoryDatabase(), repository, dataset, {
    now: () => clock.at,
  });
  const advance = (ms: number) => {
    clock.at = new Date(clock.at.getTime() + ms);
  };
  return { repository, service, clock, advance, picks };
}

export type Harness = ReturnType<typeof setup>;

export async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as { status: number; response: { code: string; message: string } };
  }
  throw new Error('expected a rejection');
}

export const code = (error: { response: { code: string } }) => error.response.code;

/** Tạo phòng với người đầu là chủ phòng, những người còn lại lần lượt vào phòng. */
export async function roomOf(
  h: Harness,
  users: readonly string[],
  settings: Record<string, unknown> = { stake_xu: 100, play_bars: 30, view_bars: 60 },
  balance = 1000,
) {
  for (const id of users) h.repository.addUser(id, `user-${id}`, balance);
  const room = await h.service.createRoom(users[0]!, { max_players: 4, ...settings });
  for (const id of users.slice(1)) {
    h.advance(10);
    await h.service.joinRoom(id, room.id, null);
  }
  return room;
}

/** Cho một người chơi tới phiên `step` (gọi `next` đủ số lần). */
export async function playTo(h: Harness, userId: string, matchId: string, step: number) {
  let current = (await h.service.state(userId, matchId)).my_step;
  while (current < step) {
    current = (await h.service.next(userId, matchId)).me.step;
  }
}
