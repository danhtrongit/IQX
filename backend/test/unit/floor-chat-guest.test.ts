import { describe, expect, it } from 'vitest';

import { FloorChatService } from '../../src/modules/trading-floor/floor-chat.service.js';
import type {
  ChatConvView,
  FloorChatRepository,
} from '../../src/modules/trading-floor/floor-chat.repository.js';
import { FloorEvents, type FloorMessage, type FloorTarget } from '../../src/modules/trading-floor/floor-events.js';
import { FloorPresence } from '../../src/modules/trading-floor/floor-presence.js';
import type { FloorSacoRepository, FloorSacoRow } from '../../src/modules/trading-floor/floor-saco.repository.js';

const GUEST = 'g:11111111-1111-4111-8111-111111111111';
const ACCOUNT = '22222222-2222-4222-8222-222222222222';
const SACO_USER = '33333333-3333-4333-8333-333333333333';
const SACO_ID = '44444444-4444-4444-8444-444444444444';
const CONV_ID = '55555555-5555-4555-8555-555555555555';

const saco: FloorSacoRow = {
  id: SACO_ID,
  userId: SACO_USER,
  leadUserId: 'lead',
  name: 'Sư Tử Vàng',
  icon: '🦁',
  active: true,
  onDuty: true,
  rank: 1,
  leadName: 'Trưởng nhóm',
  email: 'saco@example.test',
  removedAt: null,
};

const view = (owner: string, guest: boolean, side: 'user' | 'saco'): ChatConvView => ({
  id: CONV_ID,
  userId: owner,
  sacoId: SACO_ID,
  matched: false,
  matchedAt: null,
  direct: true,
  lastAt: new Date(0),
  userReadAt: null,
  sacoReadAt: null,
  sacoName: saco.name,
  sacoIcon: saco.icon,
  sacoActive: true,
  sacoOnDuty: true,
  sacoUserId: SACO_USER,
  userName: 'Minh Anh',
  userGuest: guest,
  last: null,
  unread: side === 'user' ? 0 : 1,
});

function makeService(owner: string) {
  const guest = owner.startsWith('g:');
  const calls = {
    userConvs: [] as string[],
    matchedConv: [] as string[],
    ensureConv: [] as string[],
    findByUser: [] as string[],
    inserted: [] as Array<{ sender: string; text: string; image?: unknown }>,
    recalled: [] as number[],
    removed: [] as string[],
    saved: [] as string[],
  };
  let nowMs = 1_000_000;
  /** Message 7 from the guest (with an image), 8 from the SACO, 9 a system line, 10 already recalled. */
  const stored: Record<number, { from: string; imageId: string | null; recalled: boolean }> = {
    7: { from: 'u', imageId: 'img-7', recalled: false },
    8: { from: 's', imageId: null, recalled: false },
    9: { from: 'x', imageId: null, recalled: false },
    10: { from: 'u', imageId: null, recalled: true },
  };
  const chat = {
    convView: async (_db: unknown, _id: string, side: 'user' | 'saco') => view(owner, guest, side),
    userConvs: async (_db: unknown, ownerId: string) => {
      calls.userConvs.push(ownerId);
      return [view(owner, guest, 'user')];
    },
    sacoConvs: async () => [],
    matchedConv: async (_db: unknown, ownerId: string) => {
      calls.matchedConv.push(ownerId);
      return null;
    },
    ensureConv: async (_db: unknown, ownerId: string) => {
      calls.ensureConv.push(ownerId);
      return CONV_ID;
    },
    insertMessage: async (
      _db: unknown,
      _id: string,
      sender: string,
      text: string,
      at: Date,
      image?: { id: string; w: number; h: number },
    ) => {
      calls.inserted.push(image ? { sender, text, image } : { sender, text });
      return { id: 1, from: sender, text, at: at.getTime(), ...(image ? { image } : {}) };
    },
    markRead: async () => undefined,
    messages: async () => [],
    findMessage: async (_db: unknown, _conv: string, id: number) => {
      const row = stored[id];
      return row ? { id, ...row } : null;
    },
    recallMessage: async (_db: unknown, _conv: string, id: number) => {
      const row = stored[id];
      if (!row || row.recalled) return null;
      row.recalled = true;
      calls.recalled.push(id);
      return { imageId: row.imageId };
    },
    chatImage: async (_db: unknown, imageId: string) =>
      imageId === 'img-7' ? { convId: CONV_ID, recalled: stored[7]!.recalled } : null,
  } as unknown as FloorChatRepository;
  const sacos = {
    findByUser: async (_db: unknown, userId: string) => {
      calls.findByUser.push(userId);
      return userId === SACO_USER ? saco : null;
    },
    findById: async () => saco,
    listActive: async () => [saco],
  } as unknown as FloorSacoRepository;
  const events = new FloorEvents();
  const emitted: Array<{ target: FloorTarget; message: FloorMessage }> = [];
  events.subscribe((target, message) => emitted.push({ target, message }));
  const presence = new FloorPresence();
  const service = new FloorChatService(
    { transaction: async (fn: (tx: unknown) => unknown) => fn({}) } as never,
    chat,
    sacos,
    { displayName: async () => 'Minh Anh' } as never,
    presence,
    events,
    { now: () => new Date(nowMs) },
    {
      compress: async () => ({ data: Buffer.from('webp'), width: 800, height: 600 }),
      save: async (_conv: string, id: string) => void calls.saved.push(id),
      remove: async (_conv: string, id: string) => void calls.removed.push(id),
      open: async (_conv: string, id: string) => ({ path: `/media/${id}.webp`, size: 4 }),
      read: () => null,
    } as never,
  );
  const tick = (ms = 1000) => {
    nowMs += ms;
  };
  return { service, calls, emitted, presence, tick };
}

describe('FloorChatService with guests', () => {
  it('builds a guest inbox from the owner id without looking up a SACO account', async () => {
    const { service, calls } = makeService(GUEST);
    const inbox = await service.inbox(GUEST);
    expect(inbox.saco).toBeNull();
    expect(inbox.asSaco).toEqual([]);
    expect(inbox.asUser).toHaveLength(1);
    expect(calls.findByUser).toEqual([]);
    expect(calls.userConvs).toEqual([GUEST]);
    expect(calls.matchedConv).toEqual([GUEST]);
  });

  it('opens a direct chat for a guest under the guest owner id', async () => {
    const { service, calls } = makeService(GUEST);
    const conv = await service.openDirect(GUEST, SACO_ID);
    expect(conv).toMatchObject({ id: CONV_ID, side: 'user', peerName: 'Sư Tử Vàng' });
    expect(calls.ensureConv).toEqual([GUEST]);
  });

  it('marks a guest in the SACO view, but not an account', async () => {
    const guestConv = await makeService(GUEST).service.conversation(SACO_USER, CONV_ID);
    expect(guestConv).toMatchObject({ side: 'saco', peerName: 'Minh Anh (khách)' });
    const accountConv = await makeService(ACCOUNT).service.conversation(SACO_USER, CONV_ID);
    expect(accountConv).toMatchObject({ side: 'saco', peerName: 'Minh Anh' });
  });

  it('sends a guest message and routes the event to the guest key and to the SACO', async () => {
    const { service, emitted, calls } = makeService(GUEST);
    const message = await service.send(GUEST, CONV_ID, '  Xin chào  ');
    expect(message).toMatchObject({ from: 'u', text: 'Xin chào' });
    expect(calls.inserted).toEqual([{ sender: 'u', text: 'Xin chào' }]);
    const targets = emitted.map((entry) => entry.target);
    expect(targets).toContainEqual({ kind: 'user', userId: GUEST });
    expect(targets).toContainEqual({ kind: 'saco', sacoId: SACO_ID });
  });

  it('rate limits a guest by owner id', async () => {
    const { service } = makeService(GUEST);
    await service.send(GUEST, CONV_ID, 'một');
    await expect(service.send(GUEST, CONV_ID, 'hai')).rejects.toMatchObject({
      response: { code: 'SEND_TOO_FAST' },
    });
  });

  it('relays guest typing to the SACO and SACO typing to the guest key', async () => {
    const guest = makeService(GUEST);
    await guest.service.typing(GUEST, CONV_ID);
    expect(guest.emitted).toEqual([
      {
        target: { kind: 'saco', sacoId: SACO_ID },
        message: { type: 'chat:typing', convId: CONV_ID, side: 'user' },
      },
    ]);
    const saco = makeService(GUEST);
    await saco.service.typing(SACO_USER, CONV_ID);
    expect(saco.emitted).toEqual([
      {
        target: { kind: 'user', userId: GUEST },
        message: { type: 'chat:typing', convId: CONV_ID, side: 'saco' },
      },
    ]);
  });

  it('shows a guest as online in the SACO inbox while their socket is open', async () => {
    const { service, presence } = makeService(GUEST);
    expect((await service.conversation(SACO_USER, CONV_ID)).online).toBe(false);
    presence.connected(GUEST);
    expect((await service.conversation(SACO_USER, CONV_ID)).online).toBe(true);
  });

  it('sends an image message for a guest and limits images per conversation', async () => {
    const { service, calls, emitted, tick } = makeService(GUEST);
    const message = await service.sendImage(GUEST, CONV_ID, (async function* () {})());
    expect(message).toMatchObject({ from: 'u', text: '', image: { w: 800, h: 600 } });
    expect(calls.saved).toHaveLength(1);
    expect(calls.inserted[0]).toMatchObject({ sender: 'u', text: '', image: { id: calls.saved[0] } });
    expect(emitted.some((e) => e.message.type === 'chat:msg')).toBe(true);
    for (let i = 0; i < 9; i += 1) {
      tick();
      await service.sendImage(GUEST, CONV_ID, (async function* () {})());
    }
    tick();
    await expect(service.sendImage(GUEST, CONV_ID, (async function* () {})())).rejects.toMatchObject({
      response: { code: 'IMAGE_RATE_LIMIT' },
    });
    // Ten minutes later the window has moved on.
    tick(10 * 60_000);
    await service.sendImage(GUEST, CONV_ID, (async function* () {})());
    expect(calls.saved).toHaveLength(11);
  });

  it('recalls only the sender’s own messages, deletes the image and tells both sides once', async () => {
    const { service, calls, emitted } = makeService(GUEST);
    await expect(service.recall(GUEST, CONV_ID, 8)).rejects.toMatchObject({
      response: { code: 'RECALL_FORBIDDEN' },
    });
    await expect(service.recall(SACO_USER, CONV_ID, 9)).rejects.toMatchObject({
      response: { code: 'RECALL_FORBIDDEN' },
    });
    await expect(service.recall(GUEST, CONV_ID, 99)).rejects.toMatchObject({
      response: { code: 'MESSAGE_NOT_FOUND' },
    });
    await service.recall(GUEST, CONV_ID, 7);
    await service.recall(GUEST, CONV_ID, 7);
    await service.recall(GUEST, CONV_ID, 10);
    expect(calls.recalled).toEqual([7]);
    expect(calls.removed).toEqual(['img-7']);
    const recalls = emitted.filter((e) => e.message.type === 'chat:recall');
    expect(recalls.map((e) => e.target)).toEqual([
      { kind: 'user', userId: GUEST },
      { kind: 'saco', sacoId: SACO_ID },
    ]);
    expect(recalls[0]!.message).toEqual({ type: 'chat:recall', convId: CONV_ID, messageId: 7 });
    // The recalled image is no longer served.
    await expect(service.openImage('img-7')).rejects.toMatchObject({
      response: { code: 'IMAGE_NOT_FOUND' },
    });
    await service.recall(SACO_USER, CONV_ID, 8);
    expect(calls.recalled).toEqual([7, 8]);
  });

  it('serves an image that was not recalled and refuses unknown ones', async () => {
    const { service } = makeService(GUEST);
    expect(await service.openImage('img-7')).toEqual({ path: '/media/img-7.webp', size: 4 });
    await expect(service.openImage('nope')).rejects.toMatchObject({
      response: { code: 'IMAGE_NOT_FOUND' },
    });
  });
});
