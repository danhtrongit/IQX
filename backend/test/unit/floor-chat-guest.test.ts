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
    inserted: [] as Array<{ sender: string; text: string }>,
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
    insertMessage: async (_db: unknown, _id: string, sender: string, text: string, at: Date) => {
      calls.inserted.push({ sender, text });
      return { id: 1, from: sender, text, at: at.getTime() };
    },
    markRead: async () => undefined,
    messages: async () => [],
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
    { now: () => new Date(1_000_000) },
  );
  return { service, calls, emitted, presence };
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
});
