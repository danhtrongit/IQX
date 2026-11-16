import { afterEach, describe, expect, it } from 'vitest';

import { floorChatTiming } from '../../src/modules/trading-floor/floor-chat.logic.js';
import type {
  ChatConvView,
  FloorChatRepository,
} from '../../src/modules/trading-floor/floor-chat.repository.js';
import { FloorChatService } from '../../src/modules/trading-floor/floor-chat.service.js';
import {
  FloorEvents,
  type FloorMessage,
  type FloorTarget,
} from '../../src/modules/trading-floor/floor-events.js';
import { FloorPresence } from '../../src/modules/trading-floor/floor-presence.js';
import type {
  FloorSacoRepository,
  FloorSacoRow,
} from '../../src/modules/trading-floor/floor-saco.repository.js';

// Chat SACO nhắn trước: tin vào hàng đợi, lời mời kèm bản xem trước, không ai nhận thì tự chuyển.
const OWNER = 'g:11111111-1111-4111-8111-111111111111';
const CONV_ID = '55555555-5555-4555-8555-555555555555';

const sacoRow = (n: number, patch: Partial<FloorSacoRow> = {}): FloorSacoRow => ({
  id: `saco-${n}`,
  userId: `saco-user-${n}`,
  leadUserId: 'lead',
  name: `SACO ${n}`,
  icon: '',
  active: true,
  onDuty: false,
  rank: n,
  leadName: 'Trưởng nhóm',
  email: `saco${n}@example.test`,
  removedAt: null,
  ...patch,
});

const view = (sacoId: string): ChatConvView => ({
  id: CONV_ID,
  userId: OWNER,
  sacoId,
  matched: true,
  matchedAt: new Date(0),
  direct: false,
  lastAt: new Date(0),
  userReadAt: null,
  sacoReadAt: null,
  sacoName: 'SACO',
  sacoIcon: '',
  sacoActive: true,
  sacoOnDuty: false,
  sacoUserId: `saco-user-${sacoId.slice(5)}`,
  userName: 'Minh Anh',
  userGuest: true,
  last: null,
  unread: 0,
});

function makeService(sacos: FloorSacoRow[], options: { matched?: string } = {}) {
  let nowMs = 1_000_000;
  const log = {
    invites: [] as Array<{ sacoId: string; result: string }>,
    inserted: [] as Array<{ sender: string; text: string }>,
    ensured: [] as string[],
  };
  let msgId = 0;
  let matched: string | null = options.matched ?? null;
  const chat = {
    matchedConv: async () => (matched ? { id: CONV_ID, sacoId: matched } : null),
    convView: async () => view(matched ?? 'saco-1'),
    ensureConv: async (_db: unknown, _owner: string, sacoId: string) => {
      log.ensured.push(sacoId);
      return CONV_ID;
    },
    markMatched: async () => {
      matched = log.ensured.at(-1) ?? null;
    },
    insertMessage: async (_db: unknown, _id: string, sender: string, text: string, at: Date) => {
      log.inserted.push({ sender, text });
      msgId += 1;
      return { id: msgId, from: sender, text, at: at.getTime() };
    },
    markRead: async () => undefined,
    insertInvite: async (_db: unknown, input: { sacoId: string; result: string }) => {
      log.invites.push({ sacoId: input.sacoId, result: input.result });
    },
  } as unknown as FloorChatRepository;
  const repo = {
    listActive: async () => sacos.filter((s) => s.active),
    findById: async (_db: unknown, id: string) => sacos.find((s) => s.id === id) ?? null,
    findByUser: async (_db: unknown, userId: string) =>
      sacos.find((s) => s.userId === userId) ?? null,
  } as unknown as FloorSacoRepository;
  const events = new FloorEvents();
  const emitted: Array<{ target: FloorTarget; message: FloorMessage }> = [];
  events.subscribe((target, message) => emitted.push({ target, message }));
  const presence = new FloorPresence();
  const service = new FloorChatService(
    { transaction: async (fn: (tx: unknown) => unknown) => fn({}) } as never,
    chat,
    repo,
    { displayName: async () => 'Minh Anh' } as never,
    presence,
    events,
    { now: () => new Date(nowMs) },
    {} as never,
  );
  const tick = () => {
    nowMs += 1000;
  };
  const matchEvents = () =>
    emitted
      .filter((e) => e.message.type === 'chat:match')
      .map((e) => (e.message as unknown as { event: { state: string } }).event);
  const invitesTo = (sacoId: string) =>
    emitted
      .filter(
        (e) =>
          e.target.kind === 'saco' &&
          e.target.sacoId === sacoId &&
          e.message.type === 'chat:invite',
      )
      .map((e) => (e.message as unknown as { invite: Record<string, unknown> }).invite);
  return { service, presence, log, emitted, tick, matchEvents, invitesTo };
}

const until = async (check: () => boolean, label: string): Promise<void> => {
  const end = Date.now() + 3000;
  while (!check()) {
    if (Date.now() > end) throw new Error(`timeout: ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

const originalInviteMs = floorChatTiming.inviteMs;

describe('FloorChatService.start (Chat SACO nhắn trước)', () => {
  afterEach(() => {
    floorChatTiming.inviteMs = originalInviteMs;
  });

  it('answers at once and hands the conversation to the best connected SACO when nobody is on duty', async () => {
    const sacos = [sacoRow(1), sacoRow(2), sacoRow(3)];
    const t = makeService(sacos);
    // SACO 2 has the page open but forgot "Đang trực"; SACO 1 is away.
    t.presence.connected('saco-user-2');
    expect(await t.service.start(OWNER, '  Cho em hỏi về mã FPT  ')).toEqual({ pending: true });
    await until(() => t.matchEvents().some((e) => e.state === 'matched'), 'matched');
    expect(t.log.ensured).toEqual(['saco-2']);
    expect(t.log.inserted).toEqual([
      { sender: 'x', text: 'Minh Anh được chuyển tới SACO 2' },
      { sender: 'u', text: 'Cho em hỏi về mã FPT' },
    ]);
    expect(t.log.invites).toEqual([
      { sacoId: 'saco-1', result: 'skip-off' },
      { sacoId: 'saco-2', result: 'skip-off' },
      { sacoId: 'saco-3', result: 'skip-off' },
      { sacoId: 'saco-2', result: 'auto' },
    ]);
    // The SACO's inbox refreshes and both sides see the messages.
    expect(t.emitted).toContainEqual({
      target: { kind: 'saco', sacoId: 'saco-2' },
      message: { type: 'chat:inbox' },
    });
    const userMsgs = t.emitted.filter(
      (e) => e.target.kind === 'user' && e.message.type === 'chat:msg',
    );
    expect(userMsgs).toHaveLength(2);
  });

  it('falls back to the top-ranked SACO when no SACO has a socket', async () => {
    const t = makeService([sacoRow(1), sacoRow(2)]);
    await t.service.start(OWNER, 'Xin chào');
    await until(() => t.matchEvents().some((e) => e.state === 'matched'), 'matched');
    expect(t.log.ensured).toEqual(['saco-1']);
  });

  it('invites an on-duty SACO with a preview of the first message; accepting keeps the old notice', async () => {
    floorChatTiming.inviteMs = 1000;
    const t = makeService([sacoRow(1, { onDuty: true })]);
    t.presence.connected('saco-user-1');
    await t.service.start(OWNER, `Câu hỏi dài ${'x'.repeat(200)}`);
    await until(() => t.invitesTo('saco-1').length > 0, 'invite');
    const invite = t.invitesTo('saco-1')[0]!;
    expect(invite.userName).toBe('Minh Anh (khách)');
    expect(Array.from(String(invite.preview))).toHaveLength(120);
    expect(t.service.pendingInvite('saco-1')).toMatchObject({ preview: invite.preview });
    // Further messages while waiting join the queue, in order.
    t.tick();
    expect(await t.service.start(OWNER, 'Tin thứ hai')).toEqual({ pending: true });
    await t.service.answerInvite('saco-user-1', invite.id as number, true);
    await until(() => t.matchEvents().some((e) => e.state === 'matched'), 'matched');
    expect(t.log.inserted.map((m) => m.text)).toEqual([
      'Minh Anh được khớp với SACO 1 qua Chat SACO',
      `Câu hỏi dài ${'x'.repeat(200)}`,
      'Tin thứ hai',
    ]);
    expect(t.log.invites).toEqual([{ sacoId: 'saco-1', result: 'accept' }]);
  });

  it('assigns by ranking after every on-duty SACO declines', async () => {
    floorChatTiming.inviteMs = 1000;
    const t = makeService([sacoRow(1, { onDuty: true })]);
    t.presence.connected('saco-user-1');
    await t.service.start(OWNER, 'Có ai không?');
    await until(() => t.invitesTo('saco-1').length > 0, 'invite');
    await t.service.answerInvite('saco-user-1', t.invitesTo('saco-1')[0]!.id as number, false);
    await until(() => t.matchEvents().some((e) => e.state === 'matched'), 'matched');
    expect(t.log.invites).toEqual([
      { sacoId: 'saco-1', result: 'decline' },
      { sacoId: 'saco-1', result: 'auto' },
    ]);
    expect(t.log.inserted[0]).toEqual({ sender: 'x', text: 'Minh Anh được chuyển tới SACO 1' });
  });

  it('caps the queue at five messages', async () => {
    floorChatTiming.inviteMs = 1000;
    const t = makeService([sacoRow(1, { onDuty: true })]);
    t.presence.connected('saco-user-1');
    for (let i = 1; i <= 5; i += 1) {
      t.tick();
      expect(await t.service.start(OWNER, `tin ${i}`)).toEqual({ pending: true });
    }
    t.tick();
    await expect(t.service.start(OWNER, 'tin 6')).rejects.toMatchObject({
      response: { code: 'QUEUE_FULL' },
    });
    t.service.cancelMatch(OWNER);
    await until(() => t.matchEvents().some((e) => e.state === 'matched'), 'matched');
    // The visitor left: the queued messages still reach a SACO, nothing is lost.
    expect(t.log.inserted.filter((m) => m.sender === 'u')).toHaveLength(5);
  });

  it('applies the send rate limit and the text rules', async () => {
    const t = makeService([sacoRow(1)]);
    await expect(t.service.start(OWNER, '   ')).rejects.toMatchObject({
      response: { code: 'MESSAGE_INVALID' },
    });
    await t.service.start(OWNER, 'một');
    await expect(t.service.start(OWNER, 'hai')).rejects.toMatchObject({
      response: { code: 'SEND_TOO_FAST' },
    });
  });

  it('tells the visitor when there is no active SACO at all and keeps nothing', async () => {
    const t = makeService([sacoRow(1, { active: false })]);
    await t.service.start(OWNER, 'Có ai không?');
    await until(() => t.matchEvents().some((e) => e.state === 'none'), 'none');
    expect(t.log.inserted).toEqual([]);
    expect(t.log.ensured).toEqual([]);
  });

  it('never hands the conversation to the visitor when they are the only SACO', async () => {
    const t = makeService([sacoRow(1, { userId: OWNER })]);
    await t.service.start(OWNER, 'Tự hỏi mình');
    await until(() => t.matchEvents().some((e) => e.state === 'none'), 'none');
    expect(t.log.ensured).toEqual([]);
  });

  it('sends straight into the matched conversation when there is one', async () => {
    const t = makeService([sacoRow(1)], { matched: 'saco-1' });
    const result = await t.service.start(OWNER, 'Em hỏi tiếp');
    expect(result).toMatchObject({ convId: CONV_ID, message: { from: 'u', text: 'Em hỏi tiếp' } });
    expect(t.matchEvents()).toEqual([]);
  });

  it('a message arriving while the run writes the conversation lands in it', async () => {
    const t = makeService([sacoRow(1)]);
    await t.service.start(OWNER, 'Tin đầu');
    // The run closes synchronously after its (empty) asking loop; the next message waits for it.
    await until(() => t.log.invites.length > 0, 'skip logged');
    t.tick();
    const second = t.service.start(OWNER, 'Tin sau');
    await until(() => t.matchEvents().some((e) => e.state === 'matched'), 'matched');
    expect(await second).toMatchObject({ convId: CONV_ID });
    expect(t.log.inserted.map((m) => m.text)).toEqual([
      'Minh Anh được chuyển tới SACO 1',
      'Tin đầu',
      'Tin sau',
    ]);
  });
});
