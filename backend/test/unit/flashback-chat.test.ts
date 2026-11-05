import { HttpException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  chatVisibleTo,
  compareChat,
  maskBannedWords,
  normalizeBannedWords,
  normalizeChatText,
} from '../../src/modules/flashback/flashback-chat.logic.js';
import { FlashbackChatService } from '../../src/modules/flashback/flashback-chat.service.js';
import { MemoryChatRepository } from './helpers/flashback-chat-memory.js';
import { setup, type Harness } from './helpers/flashback-rooms-fixtures.js';
import { memoryDatabase } from './helpers/flashback-rooms-memory.js';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const C = '00000000-0000-4000-8000-00000000000c';

/** Mã lỗi của một lời gọi bị từ chối. */
async function codeOf(run: Promise<unknown>): Promise<string> {
  try {
    await run;
  } catch (error) {
    if (error instanceof HttpException) return (error.getResponse() as { code: string }).code;
    throw error;
  }
  throw new Error('Lời gọi lẽ ra phải bị từ chối');
}

describe('chatVisibleTo (v2.4 §3.4)', () => {
  const viewer = { userId: B, liveMatchId: 'm1', step: 14 };

  it('tin phòng chờ và tin của chính mình luôn giao', () => {
    expect(chatVisibleTo({ userId: A, matchId: null, phien: 0 }, viewer)).toBe(true);
    expect(chatVisibleTo({ userId: B, matchId: 'm1', phien: 40 }, viewer)).toBe(true);
  });

  it('tin của ván đang chơi chỉ giao khi người nhận đã tới phiên của tin', () => {
    expect(chatVisibleTo({ userId: A, matchId: 'm1', phien: 22 }, viewer)).toBe(false);
    expect(chatVisibleTo({ userId: A, matchId: 'm1', phien: 14 }, viewer)).toBe(true);
    expect(chatVisibleTo({ userId: A, matchId: 'm1', phien: 22 }, { ...viewer, step: 22 })).toBe(
      true,
    );
  });

  it('người không có lượt trong ván đang chơi chưa nhận tin của ván đó', () => {
    expect(chatVisibleTo({ userId: A, matchId: 'm1', phien: 0 }, { ...viewer, step: null })).toBe(
      false,
    );
  });

  it('tin của ván đã kết thúc giao cho tất cả', () => {
    expect(chatVisibleTo({ userId: A, matchId: 'm0', phien: 60 }, viewer)).toBe(true);
    expect(
      chatVisibleTo(
        { userId: A, matchId: 'm1', phien: 60 },
        { userId: B, liveMatchId: null, step: null },
      ),
    ).toBe(true);
  });
});

describe('compareChat (v2.4 §3.4)', () => {
  const at = (minute: number) => new Date(Date.UTC(2026, 10, 5, 0, minute));
  const item = (id: string, minute: number, phien: number, startedAt: Date | null) => ({
    id,
    phien,
    createdAt: at(minute),
    matchStartedAt: startedAt,
  });

  it('trong một ván xếp theo phiên rồi giờ gửi, không theo giờ gửi đơn thuần', () => {
    const late = item('late-low', 9, 5, at(1));
    const early = item('early-high', 2, 22, at(1));
    const same = item('late-same', 3, 22, at(1));
    expect([early, same, late].sort(compareChat).map((row) => row.id)).toEqual([
      'late-low',
      'early-high',
      'late-same',
    ]);
  });

  it('qua "Chơi lại" số phiên bắt đầu lại nhưng luồng chat vẫn đúng thứ tự từng chặng', () => {
    const lobby1 = item('lobby-1', 0, 0, null);
    const match1 = item('match-1', 5, 30, at(1));
    const lobby2 = item('lobby-2', 12, 0, null);
    const match2 = item('match-2', 21, 3, at(20));
    expect([match2, lobby2, match1, lobby1].sort(compareChat).map((row) => row.id)).toEqual([
      'lobby-1',
      'match-1',
      'lobby-2',
      'match-2',
    ]);
  });
});

describe('lọc từ cấm (v2.4 §3.5)', () => {
  it('thay nguyên từ bằng ***, không phân biệt hoa thường', () => {
    expect(maskBannedWords('Đồ NGU quá', ['ngu'])).toBe('Đồ *** quá');
  });

  it('không đụng tới từ dài hơn có chứa từ cấm', () => {
    expect(maskBannedWords('nguồn tin', ['ngu'])).toBe('nguồn tin');
  });

  it('cụm từ được che trọn và ký tự đặc biệt trong từ cấm không phá biểu thức', () => {
    expect(maskBannedWords('a b c', ['a', 'a b'])).toBe('*** c');
    expect(maskBannedWords('x.y và xzy', ['x.y'])).toBe('*** và xzy');
  });

  it('danh sách trống thì giữ nguyên', () => {
    expect(maskBannedWords('bình thường', [])).toBe('bình thường');
  });

  it('chuẩn hoá danh sách: bỏ trùng và dòng trống, viết thường', () => {
    expect(normalizeBannedWords([' Ngu ', 'ngu', '', 'Điên'])).toEqual(['điên', 'ngu']);
  });

  it('chuẩn hoá tin: gộp khoảng trắng và bỏ ký tự điều khiển', () => {
    expect(normalizeChatText('  a\n\t b\u0000c  ')).toBe('a b c');
  });
});

describe('FlashbackChatService', () => {
  let h: Harness;
  let repo: MemoryChatRepository;
  let chat: FlashbackChatService;
  let code: string;

  /** A là chủ phòng; B và C vào phòng, mọi người sẵn sàng. */
  async function room(chatEnabled: boolean | undefined = undefined) {
    const created = await h.service.createRoom(A, {
      max_players: 4,
      stake_xu: 10,
      ...(chatEnabled === undefined ? {} : { chat_enabled: chatEnabled }),
    });
    code = created.id;
    await h.service.joinRoom(B, code, null);
    await h.service.joinRoom(C, code, null);
    return created;
  }

  async function start() {
    await h.service.setReady(B, code, true);
    await h.service.setReady(C, code, true);
    const started = await h.service.startRoom(A, code);
    return started.match.match_id;
  }

  async function step(userId: string, matchId: string, count: number) {
    for (let index = 0; index < count; index += 1) await h.service.next(userId, matchId);
  }

  async function say(userId: string, text: string) {
    const sent = await chat.send(userId, code, text);
    h.advance(2000);
    return sent;
  }

  const texts = async (userId: string) =>
    (await chat.list(userId, code)).messages.map((message) => message.text);

  beforeEach(() => {
    h = setup();
    h.repository.addUser(A, 'An', 1000);
    h.repository.addUser(B, 'Bình', 1000);
    h.repository.addUser(C, 'Chi', 1000);
    repo = new MemoryChatRepository(h.repository);
    chat = new FlashbackChatService(memoryDatabase(), h.repository, repo, h.service, {
      now: () => h.clock.at,
    });
  });

  it('A đi trước B 8 phiên: B không nhận tin của A tới khi B tới đúng phiên đó', async () => {
    await room();
    const matchId = await start();
    await step(A, matchId, 22);
    await step(B, matchId, 14);
    const sent = await say(A, 'Bollinger thắt lại rồi kìa');
    expect(sent.phien).toBe(22);
    expect(sent.waiting).toBe(false);

    // Không có gì trong phản hồi cho B, kể cả số đếm hay id.
    const hidden = await chat.list(B, code);
    expect(hidden.messages).toEqual([]);
    expect(JSON.stringify(hidden)).not.toContain('Bollinger');
    expect(JSON.stringify(hidden)).not.toContain(sent.id);

    await step(B, matchId, 7);
    expect(await texts(B)).toEqual([]);
    await step(B, matchId, 1);
    expect(await texts(B)).toEqual(['Bollinger thắt lại rồi kìa']);
    // Người đi sau nữa vẫn chưa nhận.
    expect(await texts(C)).toEqual([]);
  });

  it('báo cáo không dùng để dò được tin chưa tới lượt', async () => {
    await room();
    const matchId = await start();
    await step(A, matchId, 5);
    const sent = await say(A, 'tin phiên 5');
    expect(await codeOf(chat.report(B, code, sent.id))).toBe('CHAT_MESSAGE_NOT_FOUND');
  });

  it('người đã Hoàn thành mang phiên cuối: chỉ ai cũng xong mới thấy; hết ván thì giao hết', async () => {
    await room();
    const matchId = await start();
    await step(A, matchId, 30);
    await h.service.finish(A, matchId);
    const sent = await say(A, 'tôi xong rồi');
    expect(sent.phien).toBe(30);
    await step(B, matchId, 29);
    expect(await texts(B)).toEqual([]);
    await step(B, matchId, 1);
    await h.service.finish(B, matchId);
    expect(await texts(B)).toEqual(['tôi xong rồi']);
    expect(await texts(C)).toEqual([]);
    h.advance(11 * 60 * 1000);
    expect(await texts(C)).toEqual(['tôi xong rồi']);
  });

  it('tin phòng chờ giao ngay, còn nguyên khi vào ván và sau "Chơi lại"; rời phòng thì không đọc được', async () => {
    await room();
    const waiting = await say(A, 'chào cả phòng');
    expect(waiting).toMatchObject({ waiting: true, phien: 0 });
    expect(await texts(B)).toEqual(['chào cả phòng']);

    const matchId = await start();
    expect(await texts(C)).toEqual(['chào cả phòng']);
    await step(A, matchId, 3);
    await say(A, 'phiên 3 đây');
    h.advance(11 * 60 * 1000);
    await h.service.settleIfDue(matchId);

    const ended = await say(B, 'GG');
    expect(ended).toMatchObject({ waiting: false, phien: 30 });

    await h.service.replayRoom(C, code);
    const again = await say(C, 'ván nữa nhé');
    expect(again).toMatchObject({ waiting: true, phien: 0 });
    expect(await texts(B)).toEqual(['chào cả phòng', 'phiên 3 đây', 'GG', 'ván nữa nhé']);

    await h.service.leaveRoom(C, code);
    expect(await codeOf(chat.list(C, code))).toBe('NOT_IN_ROOM');
  });

  it('giới hạn 1 tin mỗi 2 giây, tối đa 200 ký tự, không gửi tin trống', async () => {
    await room();
    await chat.send(A, code, 'một');
    expect(await codeOf(chat.send(A, code, 'hai'))).toBe('CHAT_TOO_FAST');
    h.advance(1999);
    expect(await codeOf(chat.send(A, code, 'hai'))).toBe('CHAT_TOO_FAST');
    h.advance(1);
    await chat.send(A, code, 'hai');
    h.advance(2000);
    expect(await codeOf(chat.send(A, code, 'x'.repeat(201)))).toBe('CHAT_TOO_LONG');
    expect(await codeOf(chat.send(A, code, '   '))).toBe('CHAT_EMPTY');
    await chat.send(A, code, 'x'.repeat(200));
  });

  it('từ cấm thành *** trước khi lưu', async () => {
    await room();
    repo.words = ['ngu'];
    await say(A, 'đồ NGU');
    expect(repo.messages[0]!.text).toBe('đồ ***');
    expect(await texts(B)).toEqual(['đồ ***']);
  });

  it('tắt tiếng: chỉ mình không thấy, người kia không biết, giữ qua "Chơi lại", bỏ được', async () => {
    await room();
    await say(A, 'tin của An');
    await chat.setMuted(B, code, A, true);
    expect(await texts(B)).toEqual([]);
    expect((await chat.list(B, code)).muted).toEqual([{ user_id: A, name: 'An' }]);
    expect(await texts(C)).toEqual(['tin của An']);
    expect((await chat.list(A, code)).muted).toEqual([]);

    const matchId = await start();
    h.advance(11 * 60 * 1000);
    await h.service.settleIfDue(matchId);
    await h.service.replayRoom(A, code);
    expect(await texts(B)).toEqual([]);

    await chat.setMuted(B, code, A, false);
    expect(await texts(B)).toEqual(['tin của An']);
    expect(await codeOf(chat.setMuted(B, code, B, true))).toBe('CHAT_MUTE_SELF');
  });

  it('báo cáo kèm 10 tin trước, báo lại không tạo thêm và vẫn đọc được sau khi tin bị xoá', async () => {
    await room();
    for (let index = 1; index <= 12; index += 1) await say(A, `tin ${index}`);
    const target = await say(A, 'tin xấu');
    await chat.report(B, code, target.id);
    await chat.report(B, code, target.id);
    expect(repo.messages.at(-1)!.reported).toBe(true);

    await chat.purgeExpired(new Date(h.clock.at.getTime() + 8 * 86_400_000));
    expect(repo.messages).toHaveLength(0);

    const { reports } = await chat.reports('open');
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      text: 'tin xấu',
      reporter_name: 'Bình',
      reported_name: 'An',
    });
    expect(reports[0]!.context.map((item) => item.text)).toEqual(
      Array.from({ length: 10 }, (_, index) => `tin ${index + 3}`),
    );
    expect(await codeOf(chat.report(A, code, target.id))).toBe('CHAT_MESSAGE_NOT_FOUND');
  });

  it('không báo cáo được tin của chính mình', async () => {
    await room();
    const mine = await say(A, 'của tôi');
    expect(await codeOf(chat.report(A, code, mine.id))).toBe('CHAT_REPORT_SELF');
  });

  it('chủ phòng tắt chat: không gửi được và không có tin', async () => {
    const created = await room(false);
    expect(created.chat_enabled).toBe(false);
    expect(await codeOf(chat.send(A, code, 'alo'))).toBe('CHAT_DISABLED');
    expect(await chat.list(B, code)).toEqual({ enabled: false, messages: [], muted: [] });
  });

  it('mặc định bật chat', async () => {
    const created = await room();
    expect(created.chat_enabled).toBe(true);
  });

  it('chỉ giữ tin trong 7 ngày', async () => {
    await room();
    await say(A, 'cũ');
    h.advance(7 * 86_400_000 + 1000);
    await say(A, 'mới');
    expect(await chat.purgeExpired()).toBe(1);
    expect(await texts(B)).toEqual(['mới']);
  });

  it('không đủ xu cược thì không bấm Sẵn sàng được; huỷ thì vẫn được (§5.2)', async () => {
    h.repository.addUser(C, 'Chi', 100);
    const created = await h.service.createRoom(A, { max_players: 4, stake_xu: 100 });
    code = created.id;
    await h.service.joinRoom(C, code, null);
    await h.service.setReady(C, code, true);
    h.repository.state.wallets.set(C, { balance: 50, lastSeq: 0 });
    await h.service.setReady(C, code, false);
    expect(await codeOf(h.service.setReady(C, code, true))).toBe('XU_INSUFFICIENT');
  });
});
