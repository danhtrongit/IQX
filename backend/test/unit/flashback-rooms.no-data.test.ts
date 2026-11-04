import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import type { FlashbackBar } from '../../src/modules/flashback/flashback.types.js';
import { FLASHBACK_NO_DATA_MESSAGE } from '../../src/modules/flashback/flashback-dataset.config.js';
import {
  FlashbackRoomsService,
  type FbDatasetPort,
  type FbMatchDataset,
} from '../../src/modules/flashback/flashback-rooms.service.js';
import { ApiExceptionFilter } from '../../src/platform/http/api-exception.filter.js';
import { MemoryRoomsRepository, memoryDatabase } from './helpers/flashback-rooms-memory.js';

// IQX-Flashback-SPEC-DuLieu.md §3.3 bước 7 và §7.9: không tìm được điểm cắt thì KHÔNG bắt đầu ván,
// KHÔNG trừ xu, chủ phòng nhận thông báo, ván bắt đầu được ngay khi kho có dữ liệu trở lại.

const T0 = new Date('2026-11-04T03:00:00.000Z');

function dataset(viewBars: number, playBars: number): FbMatchDataset {
  const bar = (index: number): FlashbackBar => ({
    d: new Date(Date.UTC(2015, 0, 1) + index * 86_400_000).toISOString().slice(0, 10),
    o: 10_000,
    h: 10_000,
    l: 10_000,
    c: 10_000,
    v: 1_000_000,
  });
  return {
    symbol: 'FPT',
    warmupBars: Array.from({ length: 252 }, (_, index) => bar(index - 400)),
    bars: Array.from({ length: viewBars + playBars }, (_, index) => bar(index)),
    priceSource: 'DNSE:x1000:adjusted',
    fallbackLevel: 0,
    datasetVersion: 7,
    startIdx: 1_234,
  };
}

function setup() {
  const repository = new MemoryRoomsRepository();
  const state: { next: 'none' | 'short' | 'ok'; picks: number } = { next: 'none', picks: 0 };
  const port: FbDatasetPort = {
    pick: async (_now, viewBars, playBars) => {
      state.picks += 1;
      if (state.next === 'none') return null;
      const full = dataset(viewBars, playBars);
      return state.next === 'short' ? { ...full, bars: full.bars.slice(0, -1) } : full;
    },
  };
  const service = new FlashbackRoomsService(memoryDatabase(), repository, port, { now: () => T0 });
  return { repository, service, state };
}

async function roomOf(h: ReturnType<typeof setup>, users: readonly string[]) {
  for (const id of users) h.repository.addUser(id, `user-${id}`, 1_000);
  const room = await h.service.createRoom(users[0]!, {
    max_players: 4,
    stake_xu: 100,
    play_bars: 30,
    view_bars: 60,
  });
  for (const id of users.slice(1)) await h.service.joinRoom(id, room.id, null);
  return room;
}

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected a rejection');
}

/** Chạy lỗi qua bộ lọc lỗi chung đúng như API thật để biết người dùng nhận được gì. */
function sendThroughFilter(exception: unknown) {
  let status = 0;
  let body: Record<string, unknown> = {};
  const reply = {
    header: () => reply,
    type: () => reply,
    status: (code: number) => {
      status = code;
      return { send: (payload: Record<string, unknown>) => (body = payload) };
    },
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ id: 'req-1', url: '/api/v2/flashback/rooms/123456/start' }),
      getResponse: () => reply,
    }),
  };
  new ApiExceptionFilter().catch(exception, host as never);
  return { status, body: body as { error: { code: string; message: string } } };
}

describe('Flashback v2.2 · không cắt được đề thì không bắt đầu ván', () => {
  it('kho không có điểm cắt: chủ phòng nhận đúng câu thông báo của spec, qua cả bộ lọc lỗi chung', async () => {
    const h = setup();
    const room = await roomOf(h, ['a', 'b']);
    const error = await rejection(h.service.startRoom('a', room.id));

    const sent = sendThroughFilter(error);
    expect(sent.body.error.code).toBe('FLASHBACK_DATA_UNAVAILABLE');
    expect(sent.body.error.message).toBe('Chưa tạo được dữ liệu ván chơi, vui lòng thử lại sau');
    expect(sent.body.error.message).toBe(FLASHBACK_NO_DATA_MESSAGE);
    // Không phải 5xx: bộ lọc chung sẽ thay mọi thông báo 5xx bằng "Dịch vụ tạm thời không khả dụng".
    expect(sent.status).toBeGreaterThanOrEqual(400);
    expect(sent.status).toBeLessThan(500);
  });

  it('không trừ xu, không tạo ván, không ghi ledger, phòng vẫn đang chờ để thử lại', async () => {
    const h = setup();
    const room = await roomOf(h, ['a', 'b', 'c']);
    await rejection(h.service.startRoom('a', room.id));

    for (const id of ['a', 'b', 'c']) expect(h.repository.balanceOf(id)).toBe(1_000);
    expect(h.repository.state.ledger).toHaveLength(0);
    expect(h.repository.state.matches).toHaveLength(0);
    expect(h.repository.state.entries).toHaveLength(0);
    expect(h.repository.state.rooms[0]).toMatchObject({ status: 'waiting', currentMatchId: null });
    expect(h.repository.state.members.filter((member) => !member.leftAt)).toHaveLength(3);
  });

  it('bộ nến thiếu phiên (không đủ xem + chơi) bị coi như không có dữ liệu, không bắt đầu ván nửa chừng', async () => {
    const h = setup();
    h.state.next = 'short';
    const room = await roomOf(h, ['a', 'b']);
    const error = await rejection(h.service.startRoom('a', room.id));
    expect(sendThroughFilter(error).body.error.message).toBe(FLASHBACK_NO_DATA_MESSAGE);
    expect(h.repository.balanceOf('a')).toBe(1_000);
    expect(h.repository.state.matches).toHaveLength(0);
  });

  it('bấm lại sau khi kho có dữ liệu thì bắt đầu bình thường và trừ cược đúng một lần', async () => {
    const h = setup();
    const room = await roomOf(h, ['a', 'b']);
    await rejection(h.service.startRoom('a', room.id));
    await rejection(h.service.startRoom('a', room.id));
    expect(h.state.picks).toBe(2);
    expect(h.repository.state.ledger).toHaveLength(0);

    h.state.next = 'ok';
    const started = await h.service.startRoom('a', room.id);
    expect(started.match.history_bars).toHaveLength(60);
    expect(h.repository.balanceOf('a')).toBe(900);
    expect(h.repository.balanceOf('b')).toBe(900);
    expect(
      h.repository.state.ledger.filter((line) => line.kind === 'flashback_stake'),
    ).toHaveLength(2);
  });

  it('lý do dùng 4xx: cùng thông báo ném dưới dạng 503 sẽ bị bộ lọc chung thay bằng câu chung', () => {
    const masked = sendThroughFilter(
      new ServiceUnavailableException({
        code: 'FLASHBACK_DATA_UNAVAILABLE',
        message: FLASHBACK_NO_DATA_MESSAGE,
      }),
    );
    expect(masked.status).toBe(503);
    expect(masked.body.error.message).toBe('Dịch vụ tạm thời không khả dụng');
    expect(masked.body.error.message).not.toBe(FLASHBACK_NO_DATA_MESSAGE);
  });
});
