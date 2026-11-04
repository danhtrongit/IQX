/**
 * Flashback v2 · Phòng chơi: "Sẵn sàng" và "Đuổi khỏi phòng" (migration 0042).
 *
 * Sẵn sàng: chủ phòng chỉ bắt đầu được khi mọi người trừ chủ phòng đã sẵn sàng; xoá khi ván bắt
 * đầu và khi về phòng chờ sau ván; người mới vào chỉ có trạng thái của riêng mình.
 * Đuổi: chỉ chủ phòng, chỉ phòng chờ, không tự đuổi mình; đi đúng đường rời phòng; người bị đuổi
 * nhận thông báo một lần (`kicked`) và không vào lại đúng phòng đó trong 10 phút.
 */

import { describe, expect, it } from 'vitest';

import { FB_KICK_BLOCK_MS } from '../../src/modules/flashback/flashback-rooms.logic.js';
import {
  playTo,
  readyAll,
  rejection,
  roomOf,
  setup,
  code,
} from './helpers/flashback-rooms-fixtures.js';

const readyOf = (members: readonly { user_id: string; ready: boolean }[]) =>
  Object.fromEntries(members.map((member) => [member.user_id, member.ready]));

describe('Flashback v2 · Sẵn sàng', () => {
  it('thành viên mới chưa sẵn sàng, chủ phòng luôn được tính là sẵn sàng', async () => {
    const h = setup();
    const room = await roomOf(h, ['a', 'b', 'c'], undefined, 1000, false);
    const view = await h.service.getRoom('b', room.id);
    expect(readyOf(view.members)).toEqual({ a: true, b: false, c: false });
  });

  it('bắt đầu khi còn người chưa sẵn sàng: 409 FB_PLAYERS_NOT_READY, không tạo ván, không trừ xu', async () => {
    const h = setup();
    const room = await roomOf(h, ['a', 'b', 'c'], undefined, 1000, false);
    await h.service.setReady('b', room.id, true);
    const error = await rejection(h.service.startRoom('a', room.id));
    expect(error).toMatchObject({
      status: 409,
      response: { code: 'FB_PLAYERS_NOT_READY', message: 'Còn 1 người chơi chưa sẵn sàng' },
    });
    expect(h.repository.state.matches).toHaveLength(0);
    expect(h.repository.state.ledger).toHaveLength(0);
    expect((await h.service.getRoom('a', room.id)).status).toBe('waiting');

    const none = await rejection(
      (async () => {
        await h.service.setReady('b', room.id, false);
        return h.service.startRoom('a', room.id);
      })(),
    );
    expect(none).toMatchObject({
      response: { code: 'FB_PLAYERS_NOT_READY', message: 'Còn 2 người chơi chưa sẵn sàng' },
    });
  });

  it('mọi người sẵn sàng thì bắt đầu được; phòng một người bắt đầu ngay không cần sẵn sàng', async () => {
    const h = setup();
    const solo = await roomOf(h, ['s'], undefined, 1000, false);
    expect((await h.service.startRoom('s', solo.id)).match.pot_xu).toBe(0);

    const room = await roomOf(h, ['a', 'b', 'c'], undefined, 1000, false);
    await readyAll(h, room.id, ['a', 'b', 'c']);
    const started = await h.service.startRoom('a', room.id);
    expect(started.match).toMatchObject({ stake_xu: 100, pot_xu: 300 });
    expect(h.repository.balanceOf('b')).toBe(900);
  });

  it('bấm lại là huỷ sẵn sàng và chặn lại việc bắt đầu', async () => {
    const h = setup();
    const room = await roomOf(h, ['a', 'b'], undefined, 1000, false);
    expect(readyOf((await h.service.setReady('b', room.id, true)).members).b).toBe(true);
    expect(readyOf((await h.service.setReady('b', room.id, false)).members).b).toBe(false);
    expect(code(await rejection(h.service.startRoom('a', room.id)))).toBe('FB_PLAYERS_NOT_READY');
    await h.service.setReady('b', room.id, true);
    expect((await h.service.startRoom('a', room.id)).match.pot_xu).toBe(200);
  });

  it('chủ phòng bấm sẵn sàng không đổi gì; người ngoài phòng bị từ chối; phòng đang chơi từ chối', async () => {
    const h = setup();
    const room = await roomOf(h, ['a', 'b'], undefined, 1000, false);
    const view = await h.service.setReady('a', room.id, false);
    expect(readyOf(view.members).a).toBe(true);
    h.repository.addUser('x', 'x', 1000);
    expect(await rejection(h.service.setReady('x', room.id, true))).toMatchObject({
      status: 403,
      response: { code: 'NOT_IN_ROOM' },
    });
    expect(code(await rejection(h.service.setReady('b', '12345', true)))).toBe('ROOM_ID_INVALID');
    await h.service.setReady('b', room.id, true);
    await h.service.startRoom('a', room.id);
    expect(await rejection(h.service.setReady('b', room.id, true))).toMatchObject({
      status: 409,
      response: { code: 'ROOM_PLAYING' },
    });
  });

  it('người mới vào chỉ có trạng thái của riêng mình: người đã sẵn sàng vẫn sẵn sàng; rời rồi vào lại thì chưa', async () => {
    const h = setup();
    const room = await roomOf(h, ['a', 'b'], undefined, 1000, false);
    await h.service.setReady('b', room.id, true);
    h.repository.addUser('c', 'c', 1000);
    h.advance(10);
    const afterJoin = await h.service.joinRoom('c', room.id, null);
    expect(readyOf(afterJoin.members)).toEqual({ a: true, b: true, c: false });
    await h.service.setReady('c', room.id, true);
    await h.service.leaveRoom('c', room.id);
    h.advance(10);
    const again = await h.service.joinRoom('c', room.id, null);
    expect(readyOf(again.members)).toEqual({ a: true, b: true, c: false });
  });

  it('ván bắt đầu thì xoá sẵn sàng của cả phòng; về phòng chờ sau ván phải bấm lại', async () => {
    const h = setup();
    const room = await roomOf(h, ['a', 'b'], undefined, 1000, false);
    await h.service.setReady('b', room.id, true);
    const started = await h.service.startRoom('a', room.id);
    expect(readyOf(started.room.members)).toEqual({ a: true, b: false });
    for (const id of ['a', 'b']) {
      await playTo(h, id, started.match.match_id, 30);
      await h.service.finish(id, started.match.match_id);
    }
    const replayed = await h.service.replayRoom('b', room.id);
    expect(readyOf(replayed.members)).toEqual({ a: true, b: false });
    expect(code(await rejection(h.service.startRoom('a', room.id)))).toBe('FB_PLAYERS_NOT_READY');
    await h.service.setReady('b', room.id, true);
    expect((await h.service.startRoom('a', room.id)).match.pot_xu).toBe(200);
  });

  it('chủ phòng rời thì người vào sớm nhất thành chủ phòng và được tính là sẵn sàng', async () => {
    const h = setup();
    const room = await roomOf(h, ['a', 'b', 'c'], undefined, 1000, false);
    await h.service.setReady('c', room.id, true);
    await h.service.leaveRoom('a', room.id);
    const view = await h.service.getRoom('b', room.id);
    expect(view.owner_id).toBe('b');
    expect(readyOf(view.members)).toEqual({ b: true, c: true });
    expect((await h.service.startRoom('b', room.id)).match.pot_xu).toBe(200);
  });

  it('người chưa sẵn sàng rời đi thì chủ phòng bắt đầu được', async () => {
    const h = setup();
    const room = await roomOf(h, ['a', 'b', 'c'], undefined, 1000, false);
    await h.service.setReady('b', room.id, true);
    expect(code(await rejection(h.service.startRoom('a', room.id)))).toBe('FB_PLAYERS_NOT_READY');
    await h.service.leaveRoom('c', room.id);
    expect((await h.service.startRoom('a', room.id)).match.pot_xu).toBe(200);
  });
});

describe('Flashback v2 · Đuổi khỏi phòng', () => {
  it('chỉ chủ phòng đuổi được; người ngoài phòng, tự đuổi mình, đuổi người không ở trong phòng bị từ chối', async () => {
    const h = setup();
    const room = await roomOf(h, ['a', 'b', 'c'], undefined, 1000, false);
    h.repository.addUser('x', 'x', 1000);
    expect(await rejection(h.service.kickMember('b', room.id, 'c'))).toMatchObject({
      status: 403,
      response: { code: 'NOT_ROOM_OWNER' },
    });
    expect(await rejection(h.service.kickMember('x', room.id, 'c'))).toMatchObject({
      status: 403,
      response: { code: 'NOT_IN_ROOM' },
    });
    expect(await rejection(h.service.kickMember('a', room.id, 'a'))).toMatchObject({
      status: 409,
      response: { code: 'FB_KICK_SELF' },
    });
    expect(await rejection(h.service.kickMember('a', room.id, 'x'))).toMatchObject({
      status: 404,
      response: { code: 'FB_MEMBER_NOT_FOUND' },
    });
    expect(code(await rejection(h.service.kickMember('a', '1234', 'c')))).toBe('ROOM_ID_INVALID');
    expect((await h.service.getRoom('a', room.id)).members).toHaveLength(3);
  });

  it('không đuổi được khi phòng đang chơi', async () => {
    const h = setup();
    const room = await roomOf(h, ['a', 'b']);
    await h.service.startRoom('a', room.id);
    expect(await rejection(h.service.kickMember('a', room.id, 'b'))).toMatchObject({
      status: 409,
      response: { code: 'ROOM_PLAYING' },
    });
    expect((await h.service.getRoom('a', room.id)).members).toHaveLength(2);
  });

  it('đuổi thành công: người đó rời phòng, thông báo một lần kèm cờ kicked, xu không đổi', async () => {
    const h = setup();
    const room = await roomOf(h, ['a', 'b', 'c'], undefined, 1000, false);
    await h.service.setReady('b', room.id, true);
    const after = await h.service.kickMember('a', room.id, 'b');
    expect(after.members.map((member) => member.user_id)).toEqual(['a', 'c']);
    // Đúng đường rời phòng ở phòng chờ: không có khoản xu nào, ví không đổi.
    expect(h.repository.state.ledger).toHaveLength(0);
    expect(h.repository.balanceOf('b')).toBe(1000);
    expect(h.repository.state.members.find((m) => m.userId === 'b')).toMatchObject({
      leftReason: 'kicked',
    });
    expect(await h.service.myRoom('b')).toEqual({
      room: null,
      notice: 'Bạn đã bị chủ phòng mời ra khỏi phòng.',
      kicked: true,
    });
    expect(await h.service.myRoom('b')).toEqual({ room: null, notice: null, kicked: false });
    // Bị đuổi khỏi một phòng không chặn tạo hay vào phòng khác.
    expect((await h.service.createRoom('b', {})).id).not.toBe(room.id);
  });

  it('người bị đuổi không vào lại phòng đó trong 10 phút, vào phòng khác ngay được, sau 10 phút vào lại được', async () => {
    const h = setup();
    const room = await roomOf(h, ['a', 'b'], undefined, 1000, false);
    h.advance(1000);
    const kickedAt = h.clock.at.getTime();
    await h.service.kickMember('a', room.id, 'b');
    const blocked = await rejection(h.service.joinRoom('b', room.id, null));
    expect(blocked).toMatchObject({ status: 409, response: { code: 'FB_KICKED' } });
    expect(blocked.response.message).toContain('10 phút');

    h.advance(FB_KICK_BLOCK_MS - 1);
    expect(code(await rejection(h.service.joinRoom('b', room.id, null)))).toBe('FB_KICKED');
    // Phòng khác không bị chặn.
    h.repository.addUser('o', 'o', 1000);
    const other = await h.service.createRoom('o', { stake_xu: 100 });
    const inOther = await h.service.joinRoom('b', other.id, null);
    expect(inOther.id).toBe(other.id);
    await h.service.leaveRoom('b', other.id);

    // Đủ 10 phút kể từ lúc bị đuổi thì vào lại được.
    h.advance(1);
    expect(h.clock.at.getTime() - kickedAt).toBe(FB_KICK_BLOCK_MS);
    const back = await h.service.joinRoom('b', room.id, null);
    expect(back.members.map((member) => member.user_id)).toEqual(['a', 'b']);
    expect(readyOf(back.members).b).toBe(false);
  });

  it('Chơi phòng bất kỳ bỏ qua phòng đã đuổi mình và vào phòng khác', async () => {
    const h = setup();
    const kickedFrom = await roomOf(h, ['a', 'b'], { stake_xu: 10 }, 1000, false);
    h.repository.addUser('o', 'o', 1000);
    await h.service.kickMember('a', kickedFrom.id, 'b');
    expect(code(await rejection(h.service.randomJoin('b')))).toBe('NO_ROOM_AVAILABLE');
    const open = await h.service.createRoom('o', { stake_xu: 10 });
    expect((await h.service.randomJoin('b')).id).toBe(open.id);
  });

  it('phòng cược: người bị đuổi không bị trừ cược, ván sau chỉ tính người còn lại', async () => {
    const h = setup();
    const room = await roomOf(h, ['a', 'b', 'c'], undefined, 1000, false);
    await readyAll(h, room.id, ['a', 'b', 'c']);
    await h.service.kickMember('a', room.id, 'c');
    const started = await h.service.startRoom('a', room.id);
    expect(started.match).toMatchObject({ stake_xu: 100, pot_xu: 200 });
    expect(h.repository.balanceOf('c')).toBe(1000);
    expect(h.repository.balanceOf('b')).toBe(900);
    expect(h.repository.state.ledger.filter((row) => row.userId === 'c')).toHaveLength(0);
  });

  it('đuổi hết người chưa sẵn sàng thì chủ phòng chơi một mình được ngay', async () => {
    const h = setup();
    const room = await roomOf(h, ['a', 'b'], undefined, 1000, false);
    expect(code(await rejection(h.service.startRoom('a', room.id)))).toBe('FB_PLAYERS_NOT_READY');
    await h.service.kickMember('a', room.id, 'b');
    const started = await h.service.startRoom('a', room.id);
    expect(started.match).toMatchObject({ stake_xu: 0, pot_xu: 0 });
  });
});
