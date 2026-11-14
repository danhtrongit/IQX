import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { FloorEvents, type FloorMessage } from '../../src/modules/trading-floor/floor-events.js';
import { SACO_COMMENT_COOLDOWN_MS } from '../../src/modules/trading-floor/saco-posts.service.js';
import { vnDateString } from '../../src/modules/trading-floor/saco-posts.logic.js';
import {
  authHeader,
  registerAndLogin,
  startSystemStack,
  type SystemStack,
} from './system-stack.js';

// SACO nhận định trên PostgreSQL thật với migration 0047: nháp có phiên bản, đăng idempotent, bảng
// "hôm nay" theo ngày Việt Nam, tim và bình luận giữ số đếm nhất quán, ẩn bởi trưởng nhóm, bỏ ẩn chỉ
// quản trị viên, SACO bị gỡ quyền biến mất khỏi bảng, và ảnh được nén lại rồi phát công khai.
const BASE = '/api/v2/trading-floor';
const PASSWORD = 'System!Passw0rd';

const COOLDOWN_MS = 250;
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

type Session = Awaited<ReturnType<typeof registerAndLogin>>;
type Json = Record<string, unknown>;

function multipartFile(
  bytes: Buffer,
  mime: string,
  filename: string,
): { payload: Buffer; headers: Record<string, string> } {
  const boundary = `iqx-boundary-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const prefix = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`,
  );
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    payload: Buffer.concat([prefix, bytes, suffix]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

describe('system acceptance: SACO nhận định', () => {
  let stack: SystemStack;
  let app: NestFastifyApplication;
  let admin: Session;
  let lead: Session;
  let lead2: Session;
  let saco: Session;
  let saco2: Session;
  let u1: Session;
  let u2: Session;
  let u3: Session;
  let sacoId = '';
  let saco2Id = '';
  const events: FloorMessage[] = [];

  const call = (
    session: Session | null,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    payload?: unknown,
  ) =>
    app.inject({
      method,
      url: `${BASE}${path}`,
      headers: session ? authHeader(session.accessToken) : undefined,
      ...(payload === undefined ? {} : { payload: payload as Json }),
    });

  /** Gửi bình luận sau khi hết khoảng chờ giữa hai bình luận của cùng một người. */
  async function comment(session: Session, postId: string, text: string) {
    await sleep(COOLDOWN_MS + 60);
    return call(session, 'POST', `/posts/${postId}/comments`, { text });
  }

  async function relogin(user: Session): Promise<Session> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v2/auth/login',
      payload: { identifier: user.email, password: PASSWORD },
    });
    expect(response.statusCode, response.body).toBe(200);
    return { ...user, accessToken: (response.json() as { access_token: string }).access_token };
  }

  async function makeLead(suffix: string): Promise<Session> {
    const user = await registerAndLogin(app, suffix);
    await stack.query("update users set role = 'team_lead' where id = $1", [user.id]);
    await stack.query(
      "insert into team_lead_profiles (user_id, status, appointed_by) values ($1, 'active', $2)",
      [user.id, admin.id],
    );
    return relogin(user);
  }

  async function makeSaco(
    suffix: string,
    leadId: string,
    position: number,
    name: string,
  ): Promise<{ session: Session; id: string }> {
    const session = await registerAndLogin(app, suffix);
    const rows = await stack.query<{ id: string }>(
      `insert into tf_sacos (user_id, lead_user_id, display_name, icon, position, active, on_duty)
       values ($1, $2, $3, 'owl', $4, true, true) returning id`,
      [session.id, leadId, name, position],
    );
    return { session, id: rows[0]!.id };
  }

  /** Tạo một nháp, lưu nội dung rồi đăng; trả về id. */
  async function publishPost(
    author: Session,
    headline: string,
    bodyHtml = '<p>Thanh khoản cải thiện.</p>',
  ): Promise<string> {
    const created = await call(author, 'POST', '/saco/posts');
    expect(created.statusCode, created.body).toBe(200);
    const { id } = created.json() as { id: string };
    const published = await call(author, 'POST', `/saco/posts/${id}/publish`, {
      headline,
      bodyHtml,
      baseRevision: 0,
    });
    expect(published.statusCode, published.body).toBe(200);
    return id;
  }

  const errorOf = (response: { json(): unknown }) =>
    (response.json() as { error?: { code?: string } }).error?.code;

  beforeAll(async () => {
    stack = await startSystemStack(
      {},
      { overrideProviders: [{ token: SACO_COMMENT_COOLDOWN_MS, value: COOLDOWN_MS }] },
    );
    app = stack.app;
    const adminUser = await registerAndLogin(app, 'sp-admin');
    await stack.query("update users set role = 'admin', is_email_verified = true where id = $1", [
      adminUser.id,
    ]);
    admin = await relogin(adminUser);
    lead = await makeLead('sp-lead');
    lead2 = await makeLead('sp-lead2');
    const first = await makeSaco('sp-saco', lead.id, 1, 'Cú Đêm');
    saco = first.session;
    sacoId = first.id;
    const second = await makeSaco('sp-saco2', lead2.id, 2, 'Sói Già');
    saco2 = second.session;
    saco2Id = second.id;
    u1 = await registerAndLogin(app, 'sp-u1');
    u2 = await registerAndLogin(app, 'sp-u2');
    u3 = await registerAndLogin(app, 'sp-u3');
    await stack.query(
      "insert into tf_profiles (user_id, display_name, avatar, color) values ($1, 'Tên trên sàn', 'male01', 'default')",
      [u2.id],
    );
    app.get(FloorEvents, { strict: false }).subscribe((_target, message) => {
      events.push(message);
    });
  }, 180_000);

  afterAll(async () => {
    await stack?.close();
  });

  it('chỉ SACO còn quyền mới vào /saco/*, người chưa đăng nhập bị chặn ở mọi đường riêng tư', async () => {
    const plain = await call(u1, 'GET', '/saco/posts');
    expect(plain.statusCode).toBe(403);
    expect(errorOf(plain)).toBe('SACO_REQUIRED');
    expect((await call(null, 'GET', '/posts/today')).statusCode).toBe(401);
    expect((await call(null, 'GET', '/saco/posts')).statusCode).toBe(401);
    expect((await call(u1, 'GET', '/manage/posts')).statusCode).toBe(403);
  });

  describe('nháp', () => {
    let id = '';

    it('tạo nháp trống rồi lưu theo phiên bản, lọc HTML ở máy chủ', async () => {
      const created = await call(saco, 'POST', '/saco/posts');
      expect(created.statusCode, created.body).toBe(200);
      const draft = created.json() as Json;
      id = draft.id as string;
      expect(draft).toMatchObject({ status: 'draft', headline: '', bodyHtml: '', revision: 0 });

      const saved = await call(saco, 'PUT', `/saco/posts/${id}`, {
        headline: '  VN-Index \u0000 giữ   mốc 1.250  ',
        bodyHtml: '<h2>Tiêu đề</h2><p onclick="x()">Chữ</p><script>alert(1)</script>',
        baseRevision: 0,
      });
      expect(saved.statusCode, saved.body).toBe(200);
      expect(saved.json()).toMatchObject({ revision: 1 });

      const read = (await call(saco, 'GET', `/saco/posts/${id}`)).json() as Json;
      expect(read).toMatchObject({
        headline: 'VN-Index giữ mốc 1.250',
        bodyHtml: '<h2>Tiêu đề</h2><p>Chữ</p>',
        revision: 1,
        status: 'draft',
      });
    });

    it('nháp tối đa 200 ký tự tiêu điểm khi lưu; bản lưu theo phiên cũ bị từ chối', async () => {
      const long = await call(saco, 'PUT', `/saco/posts/${id}`, {
        headline: 'a'.repeat(250),
        bodyHtml: '<p>x</p>',
        baseRevision: 1,
      });
      expect(long.statusCode, long.body).toBe(200);
      const read = (await call(saco, 'GET', `/saco/posts/${id}`)).json() as { headline: string };
      expect(read.headline).toHaveLength(200);

      const stale = await call(saco, 'PUT', `/saco/posts/${id}`, {
        headline: 'cũ',
        bodyHtml: '<p>x</p>',
        baseRevision: 1,
      });
      expect(stale.statusCode).toBe(409);
      expect(stale.json()).toMatchObject({
        error: { code: 'DRAFT_STALE', message: 'Nháp đã được sửa ở nơi khác' },
      });
    });

    it('SACO khác và người thường không đọc hay sửa được nháp', async () => {
      expect((await call(saco2, 'GET', `/saco/posts/${id}`)).statusCode).toBe(404);
      const other = await call(saco2, 'PUT', `/saco/posts/${id}`, {
        headline: 'x',
        bodyHtml: '<p>x</p>',
        baseRevision: 2,
      });
      expect(other.statusCode).toBe(404);
      expect((await call(u1, 'GET', `/posts/${id}`)).statusCode).toBe(410);
      expect((await call(null, 'GET', `/post-images/${id}`)).statusCode).toBe(404);
      expect((await call(saco, 'GET', '/saco/posts/not-a-uuid')).statusCode).toBe(422);
      const missing = await call(saco, 'GET', '/saco/posts/00000000-0000-4000-8000-000000000000');
      expect(missing.statusCode).toBe(404);
    });

    it('kiểm tra khi đăng: thiếu tiêu điểm, tiêu điểm quá 90 ký tự, nội dung trống', async () => {
      const draft = (await call(saco, 'POST', '/saco/posts')).json() as { id: string };
      const publish = (headline: string, bodyHtml: string) =>
        call(saco, 'POST', `/saco/posts/${draft.id}/publish`, {
          headline,
          bodyHtml,
          baseRevision: 0,
        });
      const noHeadline = await publish('   ', '<p>x</p>');
      expect(noHeadline.statusCode).toBe(422);
      expect(noHeadline.json()).toMatchObject({
        error: { code: 'HEADLINE_REQUIRED', message: 'Cần nhập câu tiêu điểm' },
      });
      const tooLong = await publish('b'.repeat(91), '<p>x</p>');
      expect(tooLong.statusCode).toBe(422);
      expect(tooLong.json()).toMatchObject({
        error: { code: 'HEADLINE_TOO_LONG', message: 'Câu tiêu điểm tối đa 90 ký tự' },
      });
      const empty = await publish('Ổn', '<p>&nbsp;</p><script>x</script>');
      expect(empty.statusCode).toBe(422);
      expect(empty.json()).toMatchObject({
        error: { code: 'BODY_EMPTY', message: 'Nội dung bài đang trống' },
      });
      // 90 ký tự đúng thì được.
      const ok = await publish('c'.repeat(90), '<p>x</p>');
      expect(ok.statusCode, ok.body).toBe(200);
    });

    it('xoá được nháp, không xoá được bài đã đăng', async () => {
      const removed = await call(saco, 'DELETE', `/saco/posts/${id}`);
      expect(removed.statusCode, removed.body).toBe(200);
      expect((await call(saco, 'GET', `/saco/posts/${id}`)).statusCode).toBe(404);

      const postId = await publishPost(saco, 'Bài đã đăng');
      const blocked = await call(saco, 'DELETE', `/saco/posts/${postId}`);
      expect(blocked.statusCode).toBe(409);
      expect(errorOf(blocked)).toBe('POST_NOT_DRAFT');
    });
  });

  describe('đăng bài và bảng hôm nay', () => {
    let first = '';
    let second = '';

    it('đăng bài phát post:new, ghi nhật ký và không sửa được sau khi đăng', async () => {
      const before = events.length;
      first = await publishPost(saco, 'Dòng tiền quay lại nhóm ngân hàng');
      const pushed = events.slice(before).filter((message) => message.type === 'post:new');
      expect(pushed).toHaveLength(1);
      expect(pushed[0]).toMatchObject({
        post: {
          id: first,
          sacoId,
          sacoName: 'Cú Đêm',
          headline: 'Dòng tiền quay lại nhóm ngân hàng',
          hearts: 0,
          comments: 0,
          hearted: false,
        },
      });
      const logs = await stack.query(
        'select action, actor_role from tf_post_log where post_id = $1 order by id',
        [first],
      );
      expect(logs).toEqual([{ action: 'publish', actor_role: 'saco' }]);

      const edit = await call(saco, 'PUT', `/saco/posts/${first}`, {
        headline: 'sửa',
        bodyHtml: '<p>x</p>',
        baseRevision: 1,
      });
      expect(edit.statusCode).toBe(409);
      expect(edit.json()).toMatchObject({
        error: { code: 'POST_NOT_DRAFT', message: 'Bài đã đăng, không sửa được' },
      });
    });

    it('đăng lại và bấm Đăng hai lần song song chỉ tạo một lần đăng', async () => {
      const draft = (await call(saco, 'POST', '/saco/posts')).json() as { id: string };
      const body = { headline: 'Bấm hai lần', bodyHtml: '<p>nội dung</p>', baseRevision: 0 };
      const before = events.filter((message) => message.type === 'post:new').length;
      const [a, b] = await Promise.all([
        call(saco, 'POST', `/saco/posts/${draft.id}/publish`, body),
        call(saco, 'POST', `/saco/posts/${draft.id}/publish`, body),
      ]);
      expect(a.statusCode, a.body).toBe(200);
      expect(b.statusCode, b.body).toBe(200);
      expect((a.json() as Json).publishedAt).toBe((b.json() as Json).publishedAt);
      const again = await call(saco, 'POST', `/saco/posts/${draft.id}/publish`, body);
      expect((again.json() as Json).publishedAt).toBe((a.json() as Json).publishedAt);
      const logs = await stack.query('select id from tf_post_log where post_id = $1', [draft.id]);
      expect(logs).toHaveLength(1);
      expect(events.filter((message) => message.type === 'post:new').length - before).toBe(1);
    });

    it('bảng hôm nay: mới nhất trước, đúng ngày Việt Nam, kèm trạng thái tim của người xem', async () => {
      second = await publishPost(saco2, 'Thanh khoản thu hẹp cuối phiên');
      const today = await call(u1, 'GET', '/posts/today');
      expect(today.statusCode, today.body).toBe(200);
      const body = today.json() as { date: string; items: Array<{ id: string; hearted: boolean }> };
      expect(body.date).toBe(vnDateString(new Date()));
      const ids = body.items.map((item) => item.id);
      expect(ids.indexOf(second)).toBeGreaterThanOrEqual(0);
      expect(ids.indexOf(second)).toBeLessThan(ids.indexOf(first));
      expect(body.items.every((item) => !item.hearted)).toBe(true);
    });

    it('bài của hôm qua không lên bảng nhưng vẫn đọc được bằng id', async () => {
      const old = await publishPost(saco, 'Bài hôm qua');
      await stack.query(
        "update tf_posts set published_at = now() - interval '2 days' where id = $1",
        [old],
      );
      const today = (await call(u1, 'GET', '/posts/today')).json() as {
        items: Array<{ id: string }>;
      };
      expect(today.items.map((item) => item.id)).not.toContain(old);
      const read = await call(u1, 'GET', `/posts/${old}`);
      expect(read.statusCode).toBe(200);
    });

    it('chi tiết bài: HTML lọc lại khi đọc, trạng thái trực và quyền ẩn bình luận', async () => {
      await stack.query('update tf_posts set body_html = $2 where id = $1', [
        first,
        '<p>an toàn</p><script>alert(1)</script><img src="https://evil.test/a.png">',
      ]);
      await stack.query('update tf_sacos set on_duty = false where id = $1', [sacoId]);
      const asUser = (await call(u1, 'GET', `/posts/${first}`)).json() as Json;
      expect(asUser).toMatchObject({
        id: first,
        sacoName: 'Cú Đêm',
        bodyHtml: '<p>an toàn</p>',
        sacoOnDuty: false,
        sacoActive: true,
        canModerate: false,
        isAuthor: false,
      });
      const asAuthor = (await call(saco, 'GET', `/posts/${first}`)).json() as Json;
      expect(asAuthor).toMatchObject({ canModerate: true, isAuthor: true });
      expect(((await call(admin, 'GET', `/posts/${first}`)).json() as Json).canModerate).toBe(true);
      expect(((await call(lead, 'GET', `/posts/${first}`)).json() as Json).canModerate).toBe(true);
      expect(((await call(lead2, 'GET', `/posts/${first}`)).json() as Json).canModerate).toBe(
        false,
      );
      await stack.query('update tf_sacos set on_duty = true where id = $1', [sacoId]);
    });
  });

  describe('tim', () => {
    let id = '';
    beforeAll(async () => {
      id = await publishPost(saco, 'Bài để thả tim');
    });

    it('thả, thả lại và bỏ tim giữ số đếm khớp bảng tim; phát post:heart', async () => {
      const before = events.length;
      const on = await call(u1, 'POST', `/posts/${id}/heart`, { on: true });
      expect(on.json()).toEqual({ hearts: 1, hearted: true });
      const again = await call(u1, 'POST', `/posts/${id}/heart`, { on: true });
      expect(again.json()).toEqual({ hearts: 1, hearted: true });
      const two = await call(u2, 'POST', `/posts/${id}/heart`, { on: true });
      expect(two.json()).toEqual({ hearts: 2, hearted: true });
      expect(events.slice(before).filter((message) => message.type === 'post:heart')).toEqual([
        { type: 'post:heart', id, hearts: 1 },
        { type: 'post:heart', id, hearts: 2 },
      ]);

      const asU1 = (await call(u1, 'GET', `/posts/${id}`)).json() as {
        hearted: boolean;
        hearts: number;
      };
      expect(asU1).toMatchObject({ hearted: true, hearts: 2 });
      const asU3 = (await call(u3, 'GET', `/posts/${id}`)).json() as { hearted: boolean };
      expect(asU3.hearted).toBe(false);

      const off = await call(u1, 'POST', `/posts/${id}/heart`, { on: false });
      expect(off.json()).toEqual({ hearts: 1, hearted: false });
      const offAgain = await call(u1, 'POST', `/posts/${id}/heart`, { on: false });
      expect(offAgain.json()).toEqual({ hearts: 1, hearted: false });
      const rows = await stack.query<{ hearts: number; count: number }>(
        `select p.heart_count as hearts, (select count(*)::int from tf_post_hearts h where h.post_id = p.id) as count
           from tf_posts p where p.id = $1`,
        [id],
      );
      expect(rows[0]).toEqual({ hearts: 1, count: 1 });
    });

    it('thả tim song song vẫn giữ đúng một tim mỗi người', async () => {
      const results = await Promise.all(
        [1, 2, 3, 4].map(() => call(u3, 'POST', `/posts/${id}/heart`, { on: true })),
      );
      expect(results.every((response) => response.statusCode === 200)).toBe(true);
      const rows = await stack.query<{ hearts: number; count: number }>(
        `select p.heart_count as hearts, (select count(*)::int from tf_post_hearts h where h.post_id = p.id) as count
           from tf_posts p where p.id = $1`,
        [id],
      );
      expect(rows[0]).toEqual({ hearts: 2, count: 2 });
    });

    it('SACO tác giả không thả tim bài của mình', async () => {
      const own = await call(saco, 'POST', `/posts/${id}/heart`, { on: true });
      expect(own.statusCode).toBe(403);
      expect(errorOf(own)).toBe('OWN_POST');
      // SACO khác thì được.
      const other = await call(saco2, 'POST', `/posts/${id}/heart`, { on: true });
      expect(other.statusCode).toBe(200);
    });
  });

  describe('bình luận', () => {
    let id = '';
    let commentA = '';
    let commentB = '';
    let commentC = '';
    let commentD = '';
    beforeAll(async () => {
      id = await publishPost(saco, 'Bài để bình luận');
    });

    it('gửi bình luận: tên người viết, nhãn tác giả, giới hạn độ dài và tốc độ', async () => {
      const before = events.length;
      const a = await comment(u1, id, '  Đồng ý  ');
      expect(a.statusCode, a.body).toBe(200);
      const first = a.json() as Json;
      commentA = first.id as string;
      expect(first).toMatchObject({
        postId: id,
        authorName: 'System sp-u1',
        isAuthor: false,
        mine: true,
        text: 'Đồng ý',
        reported: false,
      });
      expect(events.slice(before).filter((message) => message.type === 'post:comment')).toEqual([
        { type: 'post:comment', postId: id, comments: 1 },
      ]);

      const quick = await call(u1, 'POST', `/posts/${id}/comments`, { text: 'Lại nữa' });
      expect(quick.statusCode).toBe(429);
      expect(errorOf(quick)).toBe('COMMENT_TOO_FAST');

      const b = await comment(u2, id, 'Có tên trên sàn');
      commentB = (b.json() as { id: string }).id;
      expect(b.json()).toMatchObject({ authorName: 'Tên trên sàn', isAuthor: false });
      const c = await comment(u3, id, 'Bình luận C');
      commentC = (c.json() as { id: string }).id;
      const d = await comment(saco, id, 'Cảm ơn mọi người');
      commentD = (d.json() as { id: string }).id;
      expect(d.json()).toMatchObject({ authorName: 'Cú Đêm', isAuthor: true });

      const empty = await call(admin, 'POST', `/posts/${id}/comments`, { text: '   ' });
      expect(empty.statusCode).toBe(422);
      expect(errorOf(empty)).toBe('COMMENT_EMPTY');
      const tooLong = await call(admin, 'POST', `/posts/${id}/comments`, { text: 'x'.repeat(501) });
      expect(tooLong.statusCode).toBe(422);
      expect(errorOf(tooLong)).toBe('COMMENT_TOO_LONG');
    });

    it('danh sách phẳng, mới nhất trước, đếm khớp, đánh dấu bình luận của mình', async () => {
      const list = await call(u1, 'GET', `/posts/${id}/comments`);
      const body = list.json() as { total: number; items: Array<{ id: string; mine: boolean }> };
      expect(body.total).toBe(4);
      expect(body.items.map((item) => item.id)).toEqual([commentD, commentC, commentB, commentA]);
      expect(body.items.map((item) => item.mine)).toEqual([false, false, false, true]);
      const card = (await call(u1, 'GET', `/posts/${id}`)).json() as { comments: number };
      expect(card.comments).toBe(4);
    });

    it('người viết xoá bình luận của mình, người khác thì không', async () => {
      const foreign = await call(u2, 'DELETE', `/posts/comments/${commentA}`);
      expect(foreign.statusCode).toBe(403);
      const own = await call(u1, 'DELETE', `/posts/comments/${commentA}`);
      expect(own.json()).toEqual({ ok: true });
      expect((await call(u1, 'DELETE', `/posts/comments/${commentA}`)).statusCode).toBe(200);
      const rows = await stack.query<{ comment_count: number }>(
        'select comment_count from tf_posts where id = $1',
        [id],
      );
      expect(rows[0]?.comment_count).toBe(3);
    });

    it('SACO tác giả, quản trị và trưởng nhóm ẩn bình luận; người thường và trưởng nhóm khác thì không', async () => {
      expect((await call(u3, 'POST', `/posts/comments/${commentB}/hide`)).statusCode).toBe(403);
      expect((await call(lead2, 'POST', `/posts/comments/${commentB}/hide`)).statusCode).toBe(403);
      const hidden = await call(saco, 'POST', `/posts/comments/${commentB}/hide`);
      expect(hidden.json()).toEqual({ ok: true });
      expect((await call(saco, 'POST', `/posts/comments/${commentB}/hide`)).statusCode).toBe(200);
      let rows = await stack.query<{ comment_count: number }>(
        'select comment_count from tf_posts where id = $1',
        [id],
      );
      expect(rows[0]?.comment_count).toBe(2);
      const list = (await call(u1, 'GET', `/posts/${id}/comments`)).json() as {
        total: number;
        items: Array<{ id: string }>;
      };
      expect(list.total).toBe(2);
      expect(list.items.map((item) => item.id)).toEqual([commentD, commentC]);
      // Trưởng nhóm của SACO ẩn được; quản trị cũng ẩn được.
      expect((await call(lead, 'POST', `/posts/comments/${commentD}/hide`)).statusCode).toBe(200);
      expect((await call(admin, 'POST', `/posts/comments/${commentC}/hide`)).statusCode).toBe(200);
      rows = await stack.query('select comment_count from tf_posts where id = $1', [id]);
      expect(rows[0]?.comment_count).toBe(0);
      const gone = await call(saco, 'POST', `/posts/comments/${commentA}/hide`);
      expect(gone.statusCode).toBe(404);
    });

    it('báo cáo một lần mỗi tài khoản, không báo cáo bình luận của mình, hiện ở danh sách báo cáo', async () => {
      const target = await comment(u2, id, 'Bình luận cần báo cáo');
      const reportedId = (target.json() as { id: string }).id;
      expect((await call(u2, 'POST', `/posts/comments/${reportedId}/report`)).statusCode).toBe(400);
      expect((await call(u1, 'POST', `/posts/comments/${reportedId}/report`)).json()).toEqual({
        ok: true,
      });
      expect((await call(u1, 'POST', `/posts/comments/${reportedId}/report`)).statusCode).toBe(200);
      const rows = await stack.query(
        'select 1 from tf_post_comment_reports where comment_id = $1',
        [reportedId],
      );
      expect(rows).toHaveLength(1);
      expect(
        (
          (await call(u1, 'GET', `/posts/${id}/comments`)).json() as { items: Array<Json> }
        ).items.find((item) => item.id === reportedId),
      ).toMatchObject({ reported: true });

      const shape = {
        commentId: reportedId,
        postId: id,
        headline: 'Bài để bình luận',
        sacoName: 'Cú Đêm',
        authorName: 'Tên trên sàn',
        text: 'Bình luận cần báo cáo',
        reports: 1,
      };
      for (const viewer of [admin, lead, saco]) {
        const path = viewer === saco ? '/saco/comment-reports' : '/manage/comment-reports';
        const list = (await call(viewer, 'GET', path)).json() as { items: Json[] };
        expect(list.items, path).toHaveLength(1);
        expect(list.items[0]).toMatchObject(shape);
      }
      const other = (await call(lead2, 'GET', '/manage/comment-reports')).json() as {
        items: Json[];
      };
      expect(other.items).toHaveLength(0);

      // Bình luận bị ẩn thì rời danh sách báo cáo.
      await call(saco, 'POST', `/posts/comments/${reportedId}/hide`);
      const after = (await call(admin, 'GET', '/manage/comment-reports')).json() as {
        items: Json[];
      };
      expect(after.items).toHaveLength(0);
      expect((await call(u3, 'POST', `/posts/comments/${reportedId}/report`)).statusCode).toBe(404);
    });

    it('bình luận mới của người khác đếm vào "Bài của tôi" tới khi tác giả đánh dấu đã xem', async () => {
      const fresh = await publishPost(saco, 'Bài đếm bình luận mới');
      await comment(u1, fresh, 'một');
      await comment(u2, fresh, 'hai');
      await comment(saco, fresh, 'của tác giả');
      const mine = (await call(saco, 'GET', '/saco/posts')).json() as {
        items: Array<{ id: string; newComments: number; comments: number }>;
      };
      expect(mine.items.find((item) => item.id === fresh)).toMatchObject({
        newComments: 2,
        comments: 3,
      });
      expect((await call(saco, 'POST', `/saco/posts/${fresh}/comments-seen`)).statusCode).toBe(200);
      const seen = (await call(saco, 'GET', `/saco/posts/${fresh}`)).json() as {
        newComments: number;
      };
      expect(seen.newComments).toBe(0);
      expect((await call(saco2, 'POST', `/saco/posts/${fresh}/comments-seen`)).statusCode).toBe(
        404,
      );
    });
  });

  describe('quản trị: ẩn và bỏ ẩn', () => {
    let id = '';
    beforeAll(async () => {
      id = await publishPost(saco, 'Bài sẽ bị ẩn');
    });

    it('danh sách quản trị theo phạm vi: quản trị thấy mọi nhóm, trưởng nhóm chỉ thấy nhóm mình', async () => {
      const all = (await call(admin, 'GET', '/manage/posts')).json() as {
        items: Array<{
          id: string;
          sacoName: string;
          leadName: string;
          status: string;
          reports: number;
        }>;
      };
      expect(all.items.find((item) => item.id === id)).toMatchObject({
        sacoName: 'Cú Đêm',
        status: 'published',
        reports: 0,
      });
      expect(all.items.some((item) => item.sacoName === 'Sói Già')).toBe(true);
      const mine = (await call(lead, 'GET', '/manage/posts')).json() as {
        items: Array<{ sacoName: string }>;
      };
      expect(mine.items.length).toBeGreaterThan(0);
      expect(mine.items.every((item) => item.sacoName === 'Cú Đêm')).toBe(true);
      const filtered = (await call(admin, 'GET', '/manage/posts?status=hidden')).json() as {
        items: unknown[];
      };
      expect(filtered.items).toHaveLength(0);
      expect((await call(lead, 'GET', '/manage/posts?status=draft')).statusCode).toBe(422);
    });

    it('trưởng nhóm của SACO ẩn bài: biến khỏi bảng, người đọc nhận 410, nhật ký và kiểm toán được ghi', async () => {
      const before = events.length;
      const hidden = await call(lead, 'POST', `/manage/posts/${id}/hide`);
      expect(hidden.statusCode, hidden.body).toBe(200);
      expect(hidden.json()).toEqual({ id, status: 'hidden' });
      expect(events.slice(before).filter((message) => message.type === 'post:hidden')).toEqual([
        { type: 'post:hidden', id },
      ]);

      const today = (await call(u1, 'GET', '/posts/today')).json() as {
        items: Array<{ id: string }>;
      };
      expect(today.items.map((item) => item.id)).not.toContain(id);
      const gone = await call(u1, 'GET', `/posts/${id}`);
      expect(gone.statusCode).toBe(410);
      expect(gone.json()).toMatchObject({
        error: { code: 'POST_UNAVAILABLE', message: 'Bài viết không còn hiển thị' },
      });
      expect((await call(u1, 'POST', `/posts/${id}/heart`, { on: true })).statusCode).toBe(410);
      expect((await call(u1, 'GET', `/posts/${id}/comments`)).statusCode).toBe(410);
      expect((await call(u1, 'POST', `/posts/${id}/comments`, { text: 'muộn' })).statusCode).toBe(
        410,
      );

      // SACO tác giả vẫn thấy bài ở "Bài của tôi" với trạng thái Đã ẩn.
      const mine = (await call(saco, 'GET', `/saco/posts/${id}`)).json() as { status: string };
      expect(mine.status).toBe('hidden');

      // Ẩn lần hai là bỏ qua: không thêm nhật ký, không phát lại sự kiện.
      const countAfter = events.length;
      expect((await call(lead, 'POST', `/manage/posts/${id}/hide`)).statusCode).toBe(200);
      expect(events.length).toBe(countAfter);
      const log = await stack.query(
        'select action, actor_role from tf_post_log where post_id = $1 order by id',
        [id],
      );
      expect(log).toEqual([
        { action: 'publish', actor_role: 'saco' },
        { action: 'hide', actor_role: 'team_lead' },
      ]);
      const audit = await stack.query(
        "select actor_role, action from admin_audit_log where target_id = $1 and action = 'trading_floor.post.hide'",
        [id],
      );
      expect(audit).toEqual([{ actor_role: 'team_lead', action: 'trading_floor.post.hide' }]);
    });

    it('trưởng nhóm khác không ẩn được; trưởng nhóm không bỏ ẩn được; người thường bị chặn', async () => {
      expect((await call(lead2, 'POST', `/manage/posts/${id}/hide`)).statusCode).toBe(404);
      expect((await call(lead2, 'GET', `/manage/posts/${id}`)).statusCode).toBe(404);
      const refused = await call(lead, 'POST', `/manage/posts/${id}/unhide`);
      expect(refused.statusCode).toBe(403);
      expect((await call(u1, 'POST', `/manage/posts/${id}/hide`)).statusCode).toBe(403);
      expect((await call(saco, 'POST', `/manage/posts/${id}/unhide`)).statusCode).toBe(403);
      const detail = (await call(lead, 'GET', `/manage/posts/${id}`)).json() as {
        status: string;
        log: Array<{ action: string; actorRole: string }>;
      };
      expect(detail.status).toBe('hidden');
      expect(detail.log.map((entry) => [entry.action, entry.actorRole])).toEqual([
        ['publish', 'saco'],
        ['hide', 'team_lead'],
      ]);
    });

    it('quản trị bỏ ẩn: bài trở lại bảng hôm nay với giờ đăng gốc và phát post:new', async () => {
      const original = await stack.query<{ published_at: Date }>(
        'select published_at from tf_posts where id = $1',
        [id],
      );
      const before = events.length;
      const restored = await call(admin, 'POST', `/manage/posts/${id}/unhide`);
      expect(restored.statusCode, restored.body).toBe(200);
      expect(restored.json()).toEqual({ id, status: 'published' });
      expect(events.slice(before).filter((message) => message.type === 'post:new')).toHaveLength(1);
      const after = await stack.query<{ published_at: Date }>(
        'select published_at from tf_posts where id = $1',
        [id],
      );
      expect(after[0]?.published_at).toEqual(original[0]?.published_at);
      const today = (await call(u1, 'GET', '/posts/today')).json() as {
        items: Array<{ id: string }>;
      };
      expect(today.items.map((item) => item.id)).toContain(id);
      const again = await call(admin, 'POST', `/manage/posts/${id}/unhide`);
      expect(again.statusCode).toBe(200);
      const log = await stack.query(
        'select action from tf_post_log where post_id = $1 order by id',
        [id],
      );
      expect(log.map((row) => row.action)).toEqual(['publish', 'hide', 'unhide']);
    });

    it('bỏ ẩn bài của ngày cũ không đẩy lên bảng hôm nay', async () => {
      const old = await publishPost(saco, 'Bài cũ bị ẩn');
      await stack.query(
        "update tf_posts set published_at = now() - interval '3 days' where id = $1",
        [old],
      );
      await call(admin, 'POST', `/manage/posts/${old}/hide`);
      const before = events.length;
      expect((await call(admin, 'POST', `/manage/posts/${old}/unhide`)).statusCode).toBe(200);
      expect(events.slice(before).filter((message) => message.type === 'post:new')).toHaveLength(0);
    });
  });

  describe('SACO bị gỡ quyền', () => {
    let id = '';
    beforeAll(async () => {
      id = await publishPost(saco2, 'Bài của SACO sắp bị gỡ');
    });

    it('bài biến khỏi bảng, đọc trả 410, mọi đường /saco/* trả 403, rồi trở lại khi khôi phục quyền', async () => {
      const visible = (await call(u1, 'GET', '/posts/today')).json() as {
        items: Array<{ id: string }>;
      };
      expect(visible.items.map((item) => item.id)).toContain(id);

      await stack.query('update tf_sacos set active = false, on_duty = false where id = $1', [
        saco2Id,
      ]);
      const today = (await call(u1, 'GET', '/posts/today')).json() as {
        items: Array<{ id: string }>;
      };
      expect(today.items.map((item) => item.id)).not.toContain(id);
      const read = await call(u1, 'GET', `/posts/${id}`);
      expect(read.statusCode).toBe(410);
      expect(errorOf(read)).toBe('POST_UNAVAILABLE');
      expect((await call(u1, 'POST', `/posts/${id}/comments`, { text: 'ok' })).statusCode).toBe(
        410,
      );

      for (const [method, path] of [
        ['GET', '/saco/posts'],
        ['POST', '/saco/posts'],
        ['GET', `/saco/posts/${id}`],
        ['GET', '/saco/comment-reports'],
      ] as const) {
        const response = await call(saco2, method, path);
        expect(response.statusCode, `${method} ${path}`).toBe(403);
        expect(response.json()).toMatchObject({
          error: { code: 'SACO_REQUIRED', message: 'Tài khoản này không còn quyền SACO' },
        });
      }

      await stack.query('update tf_sacos set active = true where id = $1', [saco2Id]);
      expect((await call(u1, 'GET', `/posts/${id}`)).statusCode).toBe(200);
    });
  });

  describe('ảnh trong bài', () => {
    let draftId = '';
    let imageId = '';

    async function png(width: number, height: number): Promise<Buffer> {
      return sharp({
        create: { width, height, channels: 3, background: { r: 200, g: 30, b: 30 } },
      })
        .png()
        .toBuffer();
    }

    const upload = (
      session: Session,
      postId: string,
      bytes: Buffer,
      mime: string,
      name: string,
    ) => {
      const { payload, headers } = multipartFile(bytes, mime, name);
      return app.inject({
        method: 'POST',
        url: `${BASE}/saco/posts/${postId}/images`,
        headers: { ...authHeader(session.accessToken), ...headers },
        payload,
      });
    };

    it('tải PNG lớn lên: nén thành WebP rộng tối đa 1600 px, phát công khai với cache dài', async () => {
      draftId = ((await call(saco, 'POST', '/saco/posts')).json() as { id: string }).id;
      const response = await upload(saco, draftId, await png(2400, 1200), 'image/png', 'a.png');
      expect(response.statusCode, response.body).toBe(200);
      const image = response.json() as { id: string; url: string; width: number; height: number };
      imageId = image.id;
      expect(image).toMatchObject({
        url: `${BASE}/post-images/${image.id}`,
        width: 1600,
        height: 800,
      });

      const served = await call(null, 'GET', `/post-images/${imageId}`);
      expect(served.statusCode, served.body).toBe(200);
      expect(served.headers['content-type']).toBe('image/webp');
      expect(served.headers['cache-control']).toBe('public, max-age=31536000, immutable');
      expect(served.headers['x-content-type-options']).toBe('nosniff');
      const meta = await sharp(served.rawPayload).metadata();
      expect(meta).toMatchObject({ format: 'webp', width: 1600, height: 800 });

      const mediaRoot = process.env.MEDIA_ROOT;
      if (mediaRoot)
        expect(
          existsSync(join(mediaRoot, 'trading-floor', 'posts', draftId, `${imageId}.webp`)),
        ).toBe(true);
    });

    it('ảnh nhỏ không bị phóng to; ảnh động, file lạ và ảnh quá 5 MB bị từ chối', async () => {
      const small = await upload(saco, draftId, await png(300, 200), 'image/png', 'small.png');
      expect(small.json()).toMatchObject({ width: 300, height: 200 });

      const text = await upload(saco, draftId, Buffer.from('không phải ảnh'), 'image/png', 'x.png');
      expect(text.statusCode).toBe(415);
      expect(errorOf(text)).toBe('IMAGE_UNSUPPORTED');
      const svg = await upload(
        saco,
        draftId,
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
        'image/svg+xml',
        'x.svg',
      );
      expect(svg.statusCode).toBe(415);

      const big = Buffer.concat([await png(10, 10), Buffer.alloc(5 * 1024 * 1024 + 1)]);
      const tooBig = await upload(saco, draftId, big, 'image/png', 'big.png');
      expect(tooBig.statusCode).toBe(413);
      expect(tooBig.json()).toMatchObject({
        error: { code: 'IMAGE_TOO_LARGE', message: 'Ảnh tối đa 5 MB' },
      });

      const notMultipart = await app.inject({
        method: 'POST',
        url: `${BASE}/saco/posts/${draftId}/images`,
        headers: authHeader(saco.accessToken),
        payload: {},
      });
      expect(notMultipart.statusCode).toBe(400);
    });

    it('chỉ SACO tác giả tải ảnh vào nháp của mình; người thường bị chặn', async () => {
      const bytes = await png(20, 20);
      expect((await upload(saco2, draftId, bytes, 'image/png', 'a.png')).statusCode).toBe(404);
      expect((await upload(u1, draftId, bytes, 'image/png', 'a.png')).statusCode).toBe(403);
      expect((await call(null, 'GET', `/post-images/${draftId}`)).statusCode).toBe(404);
    });

    it('bài chỉ có ảnh vẫn đăng được; ảnh ngoài bị lọc; không tải thêm ảnh vào bài đã đăng', async () => {
      const html = `<figure data-align="center" data-width="60"><img src="${BASE}/post-images/${imageId}" alt=""><figcaption>Biểu đồ</figcaption></figure><img src="https://evil.test/x.png">`;
      const published = await call(saco, 'POST', `/saco/posts/${draftId}/publish`, {
        headline: 'Bài chỉ có ảnh',
        bodyHtml: html,
        baseRevision: 0,
      });
      expect(published.statusCode, published.body).toBe(200);
      expect((published.json() as { bodyHtml: string }).bodyHtml).toBe(
        `<figure data-align="center" data-width="60"><img src="${BASE}/post-images/${imageId}" /><figcaption>Biểu đồ</figcaption></figure>`,
      );
      const detail = (await call(u1, 'GET', `/posts/${draftId}`)).json() as { bodyHtml: string };
      expect(detail.bodyHtml).toContain(`/post-images/${imageId}`);
      // Ảnh của bài đã đăng vẫn phát công khai.
      expect((await call(null, 'GET', `/post-images/${imageId}`)).statusCode).toBe(200);

      const late = await upload(saco, draftId, await png(20, 20), 'image/png', 'late.png');
      expect(late.statusCode).toBe(409);
      expect(errorOf(late)).toBe('POST_NOT_DRAFT');
    });

    it('xoá nháp xoá luôn ảnh của nháp (dòng dữ liệu và tệp)', async () => {
      const draft = ((await call(saco, 'POST', '/saco/posts')).json() as { id: string }).id;
      const response = await upload(saco, draft, await png(50, 50), 'image/png', 'b.png');
      const image = response.json() as { id: string };
      expect((await call(null, 'GET', `/post-images/${image.id}`)).statusCode).toBe(200);
      expect((await call(saco, 'DELETE', `/saco/posts/${draft}`)).statusCode).toBe(200);
      expect((await call(null, 'GET', `/post-images/${image.id}`)).statusCode).toBe(404);
      const mediaRoot = process.env.MEDIA_ROOT;
      if (mediaRoot)
        expect(existsSync(join(mediaRoot, 'trading-floor', 'posts', draft))).toBe(false);
    });
  });
});
