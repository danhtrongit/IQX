import { afterEach, describe, expect, it } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';

import {
  guestActor,
  hashGuestToken,
  ownerIdOf,
  splitOwner,
  userActor,
  type FloorActor,
} from '../../src/modules/trading-floor/floor-actor.js';
import { FloorEvents } from '../../src/modules/trading-floor/floor-events.js';
import { FloorPresence } from '../../src/modules/trading-floor/floor-presence.js';
import { FloorProfileService } from '../../src/modules/trading-floor/floor-profile.service.js';
import type { FloorProfileRepository } from '../../src/modules/trading-floor/floor-profile.repository.js';
import { FloorHub, type FloorHubSocket } from '../../src/modules/trading-floor/floor.hub.js';
import type { FloorProfile } from '../../src/modules/trading-floor/floor-types.js';

const GUEST_ID = '11111111-1111-4111-8111-111111111111';
const GUEST_TOKEN = 'g'.repeat(43);

/** In-memory stand-in for the guest and account profile tables. */
function fakeProfiles() {
  const guests = new Map<string, FloorProfile>();
  const created: Array<{ tokenHash: string; profile: FloorProfile; ip: string | null }> = [];
  const repo: FloorProfileRepository = {
    find: async () => ({ name: 'Tài khoản', avatar: 'male01', color: 'default' }),
    upsert: async () => undefined,
    userBasics: async () => ({ id: 'u', fullName: 'Nguyễn An', username: 'an' }),
    findGuest: async (_db, id) => guests.get(id) ?? null,
    createGuest: async (_db, input) => {
      created.push(input);
      const id = `00000000-0000-4000-8000-${String(created.length).padStart(12, '0')}`;
      guests.set(id, input.profile);
      return id;
    },
    updateGuest: async (_db, id, profile) => {
      if (!guests.has(id)) return false;
      guests.set(id, profile);
      return true;
    },
  };
  return { repo, guests, created };
}

function makeService(presence = new FloorPresence()) {
  const profiles = fakeProfiles();
  const service = new FloorProfileService(
    {} as never,
    profiles.repo,
    { findByUser: async () => null } as never,
    presence,
  );
  return { service, presence, ...profiles };
}

describe('chat owner id', () => {
  it('is the raw account uuid for accounts and g:<uuid> for guests', () => {
    expect(ownerIdOf(userActor('acct-1'))).toBe('acct-1');
    expect(ownerIdOf(guestActor(GUEST_ID))).toBe(`g:${GUEST_ID}`);
  });

  it('splits into exactly one of user_id / guest_id', () => {
    expect(splitOwner('2f0b8c1e-0000-4000-8000-000000000001')).toEqual({
      userId: '2f0b8c1e-0000-4000-8000-000000000001',
      guestId: null,
    });
    expect(splitOwner(`g:${GUEST_ID}`)).toEqual({ userId: null, guestId: GUEST_ID });
    expect(splitOwner(ownerIdOf(guestActor(GUEST_ID)))).toEqual({
      userId: null,
      guestId: GUEST_ID,
    });
  });
});

describe('FloorProfileService guests', () => {
  it('creates a guest from a name and avatar, storing only the token hash', async () => {
    const { service, created } = makeService();
    const result = await service.createGuest('9.9.9.9', {
      name: '  Minh   Anh ',
      avatar: 'female02',
      color: 'navy',
    });
    expect(result.profile).toEqual({ name: 'Minh Anh', avatar: 'female02', color: 'navy' });
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{40,60}$/);
    expect(created).toHaveLength(1);
    expect(created[0]!.tokenHash).toBe(hashGuestToken(result.token));
    expect(created[0]!.tokenHash).not.toContain(result.token);
    expect(created[0]!.ip).toBe('9.9.9.9');
  });

  it('rejects a name shorter than 2 characters without spending the quota', async () => {
    const { service, created } = makeService();
    for (let i = 0; i < 20; i++) {
      await expect(
        service.createGuest('9.9.9.9', { name: 'A', avatar: 'male01', color: 'default' }),
      ).rejects.toMatchObject({ response: { code: 'INVALID_NAME' } });
    }
    expect(created).toHaveLength(0);
    await expect(
      service.createGuest('9.9.9.9', { name: 'An', avatar: 'male01', color: 'default' }),
    ).resolves.toBeDefined();
  });

  it('allows 10 creations per IP per hour then answers 429 GUEST_RATE_LIMIT', async () => {
    const { service } = makeService();
    const input = { name: 'Khách', avatar: 'male01', color: 'default' } as const;
    const t0 = 5_000_000;
    for (let i = 0; i < 10; i++) await service.createGuest('1.1.1.1', input, t0 + i);
    await expect(service.createGuest('1.1.1.1', input, t0 + 20)).rejects.toMatchObject({
      status: 429,
      response: { code: 'GUEST_RATE_LIMIT' },
    });
    await expect(service.createGuest('2.2.2.2', input, t0 + 20)).resolves.toBeDefined();
    await expect(service.createGuest('1.1.1.1', input, t0 + 3_600_001)).resolves.toBeDefined();
  });

  it('me() of a guest returns the guest profile, no SACO and no suggested name', async () => {
    const { service, guests } = makeService();
    guests.set(GUEST_ID, { name: 'Khách Vui', avatar: 'male03', color: 'teal' });
    await expect(service.me(guestActor(GUEST_ID))).resolves.toEqual({
      profile: { name: 'Khách Vui', avatar: 'male03', color: 'teal' },
      suggestedName: '',
      saco: null,
      guest: true,
    });
    await expect(service.me(userActor('u1'))).resolves.toMatchObject({
      guest: false,
      suggestedName: 'Nguyễn An',
    });
  });

  it('displayName() reads the guest name for g:<uuid> and the account profile otherwise', async () => {
    const { service, guests } = makeService();
    guests.set(GUEST_ID, { name: 'Khách Vui', avatar: 'male03', color: 'teal' });
    await expect(service.displayName(`g:${GUEST_ID}`)).resolves.toBe('Khách Vui');
    await expect(service.displayName(`g:${GUEST_ID.replace(/1/g, '2')}`)).resolves.toBe('Khách');
    await expect(service.displayName('acct-1')).resolves.toBe('Tài khoản');
  });

  it('me() of a guest that no longer exists is 401 GUEST_INVALID', async () => {
    const { service } = makeService();
    await expect(service.me(guestActor(GUEST_ID))).rejects.toMatchObject({
      response: { code: 'GUEST_INVALID' },
    });
  });

  it('a guest edits their own character and the hub is told under the guest key', async () => {
    const presence = new FloorPresence();
    const changes: Array<[string, FloorProfile]> = [];
    presence.onProfileChanged((key, profile) => changes.push([key, profile]));
    const { service, guests } = makeService(presence);
    guests.set(GUEST_ID, { name: 'Khách', avatar: 'male01', color: 'default' });

    const saved = await service.save(guestActor(GUEST_ID), {
      name: 'Bình',
      avatar: 'male05',
      color: 'gold',
    });
    expect(saved).toEqual({ name: 'Bình', avatar: 'male05', color: 'gold' });
    expect(guests.get(GUEST_ID)).toEqual(saved);
    expect(changes).toEqual([[`g:${GUEST_ID}`, saved]]);

    // Accounts keep the raw account id as the key.
    await service.save(userActor('u7'), { name: 'Cường', avatar: 'male02', color: 'default' });
    expect(changes[1]![0]).toBe('u7');
  });

  it('refuses to edit a guest that does not exist', async () => {
    const { service } = makeService();
    await expect(
      service.save(guestActor(GUEST_ID), { name: 'Bình', avatar: 'male01', color: 'default' }),
    ).rejects.toMatchObject({ response: { code: 'GUEST_INVALID' } });
  });
});

// ================================================================== hub

class FakeSocket implements FloorHubSocket {
  readonly sent: Array<Record<string, unknown>> = [];
  closedWith: number | null = null;
  send(data: string): void {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }
  close(code?: number): void {
    this.closedWith = code ?? 1005;
  }
  last(type: string): Record<string, unknown> | undefined {
    return [...this.sent].reverse().find((m) => m.type === type);
  }
}

function makeHub() {
  const calls = {
    findByUser: 0,
    bindSaco: 0,
    connected: 0,
    disconnected: 0,
    typing: 0,
    typingOwner: '',
  };
  const profileListeners: Array<(id: string, profile: FloorProfile) => void> = [];
  const guestProfile: FloorProfile = { name: 'Khách Vui', avatar: 'female01', color: 'plum' };
  const hub = new FloorHub(
    {} as never,
    {
      resolve: async ({
        accessToken,
        guestToken,
      }: {
        accessToken?: string;
        guestToken?: string;
      }): Promise<FloorActor | null> => {
        if (accessToken) return userActor(accessToken);
        if (guestToken === GUEST_TOKEN) return guestActor(GUEST_ID);
        if (guestToken) throw new UnauthorizedException({ code: 'GUEST_INVALID' });
        return null;
      },
    } as never,
    {
      connected: () => void (calls.connected += 1),
      disconnected: () => void (calls.disconnected += 1),
      onProfileChanged: (fn: (id: string, profile: FloorProfile) => void) => {
        profileListeners.push(fn);
        return () => undefined;
      },
      bindSaco: () => void (calls.bindSaco += 1),
    } as never,
    new FloorEvents(),
    {
      pendingInvite: () => null,
      typing: async (owner: string) => {
        calls.typing += 1;
        calls.typingOwner = owner;
      },
    } as never,
    {
      find: async () => ({ name: 'Tài khoản', avatar: 'male01', color: 'default' }),
      findGuest: async (_db: unknown, id: string) => (id === GUEST_ID ? guestProfile : null),
    } as never,
    {
      findByUser: async () => {
        calls.findByUser += 1;
        return null;
      },
    } as never,
    { authTimeoutMs: 60_000 },
  );
  return { hub, calls, profileListeners };
}

const HELLO = JSON.stringify({ type: 'hello', x: 900, y: 700, facing: 's', moving: false });

describe('FloorHub guests', () => {
  let stop: (() => void) | null = null;
  afterEach(() => stop?.());

  it('lets a guest in: ready says guest, no SACO lookup, the peer wears the guest character', async () => {
    const { hub, calls } = makeHub();
    stop = () => hub.shutdown();
    const socket = new FakeSocket();
    hub.connect(socket);
    await hub.message(socket, JSON.stringify({ type: 'auth', guest: GUEST_TOKEN }));
    expect(socket.last('ready')).toEqual({ type: 'ready', userId: `g:${GUEST_ID}`, guest: true });
    expect(calls.findByUser).toBe(0);
    // Guests are online like accounts: SACO sees them, and closing the tab cancels a running Chat SACO.
    expect(calls.connected).toBe(1);

    await hub.message(socket, HELLO);
    const welcome = socket.last('welcome') as { self: Record<string, unknown> };
    expect(welcome.self).toMatchObject({ name: 'Khách Vui', avatar: 'female01', color: 'plum' });
    expect(hub.stats.onFloor).toBe(1);

    hub.disconnect(socket);
    expect(calls.disconnected).toBe(1);
    expect(hub.stats.onFloor).toBe(0);
  });

  it('keeps accounts as before: ready says guest false and SACO is looked up', async () => {
    const { hub, calls } = makeHub();
    stop = () => hub.shutdown();
    const socket = new FakeSocket();
    hub.connect(socket);
    await hub.message(socket, JSON.stringify({ type: 'auth', token: 'acct-1' }));
    expect(socket.last('ready')).toEqual({ type: 'ready', userId: 'acct-1', guest: false });
    expect(calls.findByUser).toBe(1);
    expect(calls.connected).toBe(1);
    hub.disconnect(socket);
    expect(calls.disconnected).toBe(1);
  });

  it('closes a bad guest token with GUEST_INVALID and 4401', async () => {
    const { hub } = makeHub();
    stop = () => hub.shutdown();
    const socket = new FakeSocket();
    hub.connect(socket);
    await hub.message(socket, JSON.stringify({ type: 'auth', guest: 'x'.repeat(43) }));
    expect(socket.last('error')).toMatchObject({ code: 'GUEST_INVALID' });
    expect(socket.closedWith).toBe(4401);
    expect(socket.last('ready')).toBeUndefined();
  });

  it('passes a guest typing event to the chat service under the guest key, never as an error', async () => {
    const { hub, calls } = makeHub();
    stop = () => hub.shutdown();
    const socket = new FakeSocket();
    hub.connect(socket);
    await hub.message(socket, JSON.stringify({ type: 'auth', guest: GUEST_TOKEN }));
    await hub.message(
      socket,
      JSON.stringify({ type: 'chat:typing', convId: '22222222-2222-4222-8222-222222222222' }),
    );
    expect(socket.last('error')).toBeUndefined();
    expect(calls.typing).toBe(1);
    expect(calls.typingOwner).toBe(`g:${GUEST_ID}`);
  });

  it('guests walk like everyone else; public chat is off', async () => {
    const { hub } = makeHub();
    stop = () => hub.shutdown();
    const guest = new FakeSocket();
    const other = new FakeSocket();
    hub.connect(guest);
    hub.connect(other);
    await hub.message(guest, JSON.stringify({ type: 'auth', guest: GUEST_TOKEN }));
    await hub.message(other, JSON.stringify({ type: 'auth', token: 'acct-2' }));
    await hub.message(other, HELLO);
    await hub.message(guest, HELLO);
    await hub.message(
      guest,
      JSON.stringify({ type: 'state', x: 910, y: 700, facing: 'e', moving: true }),
    );
    await hub.message(guest, JSON.stringify({ type: 'emote', text: 'Chào mọi người' }));
    expect(other.last('peer:join')).toMatchObject({ peer: { name: 'Khách Vui' } });
    expect(other.last('peer:state')).toMatchObject({ x: 910, moving: true });
    // Chat chung đã tắt: lời nói công khai không tới ai.
    expect(other.last('peer:emote')).toBeUndefined();
  });

  it('dresses a standing guest in the new character when the profile changes', async () => {
    const { hub, profileListeners } = makeHub();
    stop = () => hub.shutdown();
    const guest = new FakeSocket();
    const other = new FakeSocket();
    hub.connect(guest);
    hub.connect(other);
    await hub.message(guest, JSON.stringify({ type: 'auth', guest: GUEST_TOKEN }));
    await hub.message(other, JSON.stringify({ type: 'auth', token: 'acct-2' }));
    await hub.message(guest, HELLO);
    await hub.message(other, HELLO);
    for (const fn of profileListeners)
      fn(`g:${GUEST_ID}`, { name: 'Tên Mới', avatar: 'male04', color: 'cobalt' });
    expect(other.last('peer:update')).toMatchObject({
      peer: { name: 'Tên Mới', avatar: 'male04', color: 'cobalt' },
    });
    expect(guest.last('peer:update')).toMatchObject({ peer: { name: 'Tên Mới' } });
  });
});
