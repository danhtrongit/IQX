import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  authHeader,
  registerAndLogin,
  startSystemStack,
  type SystemStack,
} from './system-stack.js';

type Course = { id: string; slug: string; is_premium: boolean };
type Episode = { id: string; file_url: string | null; sort_order: number };

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

describe('system acceptance: private lesson media', () => {
  let stack: SystemStack;
  let app: NestFastifyApplication;
  let adminToken: string;
  let userToken: string;
  let course: Course;
  let pdfEpisode: Episode;
  let textEpisode: Episode;

  beforeAll(async () => {
    stack = await startSystemStack();
    app = stack.app;
    const admin = await registerAndLogin(app, 'lesson-admin');
    await stack.query("update users set role='admin',is_email_verified=true where id=$1", [
      admin.id,
    ]);
    const adminLogin = await app.inject({
      method: 'POST',
      url: '/api/v2/auth/login',
      payload: { email: admin.email, password: 'System!Passw0rd' },
    });
    adminToken = (adminLogin.json() as { access_token: string }).access_token;

    const user = await registerAndLogin(app, 'lesson-user');
    await stack.query("update users set role='user' where id=$1", [user.id]);
    await stack.query('delete from premium_subscriptions where user_id=$1', [user.id]);
    await stack.query(
      "update billing_entitlement_grants set status='revoked',revoked_at=now(),revoke_reason='system lesson entitlement denial fixture' where user_id=$1",
      [user.id],
    );
    const userLogin = await app.inject({
      method: 'POST',
      url: '/api/v2/auth/login',
      payload: { email: user.email, password: 'System!Passw0rd' },
    });
    userToken = (userLogin.json() as { access_token: string }).access_token;
  });

  afterAll(async () => {
    await stack?.close();
  });

  it('validates query booleans and UUID route parameters instead of leaking PostgreSQL errors', async () => {
    const falseFilter = await app.inject({
      method: 'GET',
      url: '/api/v2/lessons/courses?is_premium=false',
    });
    expect(falseFilter.statusCode, falseFilter.body).toBe(200);
    const invalid = await app.inject({
      method: 'GET',
      url: '/api/v2/admin/lessons/courses/not-a-uuid',
      headers: authHeader(adminToken),
    });
    expect(invalid.statusCode).toBe(400);
    const missingMultipart = await app.inject({
      method: 'POST',
      url: '/api/v2/admin/lessons/courses/20000000-0000-4000-8000-000000000001/thumbnail',
      headers: authHeader(adminToken),
    });
    expect(missingMultipart.statusCode).toBe(400);
  });

  it('creates a premium course and episodes, uploads PDF media, and publishes safely', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v2/admin/lessons/courses',
      headers: authHeader(adminToken),
      payload: {
        slug: `secure-media-${Date.now()}`,
        title: 'Secure Media',
        level: 'beginner',
        category: 'security',
        is_premium: true,
        is_published: true,
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    course = created.json() as Course;

    const pdf = await app.inject({
      method: 'POST',
      url: `/api/v2/admin/lessons/courses/${course.id}/episodes`,
      headers: authHeader(adminToken),
      payload: { title: 'Private PDF', content_type: 'pdf', sort_order: 1 },
    });
    expect(pdf.statusCode, pdf.body).toBe(201);
    pdfEpisode = pdf.json() as Episode;
    const prematurePublish = await app.inject({
      method: 'PATCH',
      url: `/api/v2/admin/lessons/episodes/${pdfEpisode.id}`,
      headers: authHeader(adminToken),
      payload: { is_published: true },
    });
    expect(prematurePublish.statusCode).toBe(400);

    const upload = multipartFile(
      Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF'),
      'application/pdf',
      'lesson.pdf',
    );
    const uploaded = await app.inject({
      method: 'POST',
      url: `/api/v2/admin/lessons/episodes/${pdfEpisode.id}/file`,
      headers: { ...authHeader(adminToken), ...upload.headers },
      payload: upload.payload,
    });
    expect(uploaded.statusCode, uploaded.body).toBe(201);
    pdfEpisode = uploaded.json() as Episode;
    expect(pdfEpisode.file_url).toMatch(/^\/api\/v2\/media\//);
    const published = await app.inject({
      method: 'PATCH',
      url: `/api/v2/admin/lessons/episodes/${pdfEpisode.id}`,
      headers: authHeader(adminToken),
      payload: { is_published: true },
    });
    expect(published.statusCode, published.body).toBe(200);

    const text = await app.inject({
      method: 'POST',
      url: `/api/v2/admin/lessons/courses/${course.id}/episodes`,
      headers: authHeader(adminToken),
      payload: {
        title: 'Text lesson',
        content_type: 'text',
        markdown_body: '# Nội dung',
        sort_order: 2,
      },
    });
    expect(text.statusCode, text.body).toBe(201);
    textEpisode = text.json() as Episode;
    const publishText = await app.inject({
      method: 'PATCH',
      url: `/api/v2/admin/lessons/episodes/${textEpisode.id}`,
      headers: authHeader(adminToken),
      payload: { is_published: true },
    });
    expect(publishText.statusCode, publishText.body).toBe(200);
  });

  it('enforces entitlement before issuing a signed URL and never serves unsigned storage paths', async () => {
    const anonymous = await app.inject({
      method: 'GET',
      url: `/api/v2/lessons/episodes/${pdfEpisode.id}/content`,
    });
    expect(anonymous.statusCode).toBe(401);
    const denied = await app.inject({
      method: 'GET',
      url: `/api/v2/lessons/episodes/${pdfEpisode.id}/content`,
      headers: authHeader(userToken),
    });
    expect(denied.statusCode).toBe(403);
    const unsigned = await app.inject({ method: 'GET', url: '/api/v2/media/courses/anything.pdf' });
    expect([400, 404]).toContain(unsigned.statusCode);

    const content = await app.inject({
      method: 'GET',
      url: `/api/v2/lessons/episodes/${pdfEpisode.id}/content`,
      headers: authHeader(adminToken),
    });
    expect(content.statusCode, content.body).toBe(200);
    const signedUrl = (content.json() as { file_url: string }).file_url;
    const ranged = await app.inject({
      method: 'GET',
      url: signedUrl,
      headers: { range: 'bytes=0-4' },
    });
    expect(ranged.statusCode).toBe(206);
    expect(ranged.headers['content-range']).toMatch(/^bytes 0-4\//);
    expect(ranged.rawPayload.toString()).toBe('%PDF-');
    const invalidRange = await app.inject({
      method: 'GET',
      url: signedUrl,
      headers: { range: 'bytes=999999-' },
    });
    expect(invalidRange.statusCode).toBe(416);
  });

  it('rejects MIME spoofing without replacing the previously committed file', async () => {
    const before = (
      await stack.query<{ file_url: string }>('select file_url from episodes where id=$1', [
        pdfEpisode.id,
      ])
    )[0]!.file_url;
    const spoof = multipartFile(Buffer.from('not a PDF'), 'application/pdf', 'spoof.pdf');
    const rejected = await app.inject({
      method: 'POST',
      url: `/api/v2/admin/lessons/episodes/${pdfEpisode.id}/file`,
      headers: { ...authHeader(adminToken), ...spoof.headers },
      payload: spoof.payload,
    });
    expect(rejected.statusCode).toBe(415);
    const after = (
      await stack.query<{ file_url: string }>('select file_url from episodes where id=$1', [
        pdfEpisode.id,
      ])
    )[0]!.file_url;
    expect(after).toBe(before);
    const content = await app.inject({
      method: 'GET',
      url: `/api/v2/lessons/episodes/${pdfEpisode.id}/content`,
      headers: authHeader(adminToken),
    });
    const download = await app.inject({
      method: 'GET',
      url: (content.json() as { file_url: string }).file_url,
    });
    expect(download.statusCode).toBe(200);
    expect(download.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('atomically reorders episodes and persists user progress after the course becomes free', async () => {
    const reorder = await app.inject({
      method: 'POST',
      url: `/api/v2/admin/lessons/courses/${course.id}/reorder`,
      headers: authHeader(adminToken),
      payload: {
        items: [
          { episode_id: pdfEpisode.id, sort_order: 2 },
          { episode_id: textEpisode.id, sort_order: 1 },
        ],
      },
    });
    expect(reorder.statusCode, reorder.body).toBe(200);
    const ordered = await stack.query<{ id: string; sort_order: number }>(
      'select id,sort_order from episodes where course_id=$1 order by sort_order',
      [course.id],
    );
    expect(ordered).toEqual([
      { id: textEpisode.id, sort_order: 1 },
      { id: pdfEpisode.id, sort_order: 2 },
    ]);

    const free = await app.inject({
      method: 'PATCH',
      url: `/api/v2/admin/lessons/courses/${course.id}`,
      headers: authHeader(adminToken),
      payload: { is_premium: false },
    });
    expect(free.statusCode).toBe(200);
    const progress = await app.inject({
      method: 'POST',
      url: `/api/v2/lessons/episodes/${pdfEpisode.id}/progress`,
      headers: authHeader(userToken),
      payload: { completed: true, last_position_seconds: 42 },
    });
    expect(progress.statusCode, progress.body).toBe(201);
    expect(progress.json()).toMatchObject({
      episode_id: pdfEpisode.id,
      course_id: course.id,
      last_position_seconds: 42,
    });
    const mine = await app.inject({
      method: 'GET',
      url: `/api/v2/lessons/me/progress?course_id=${course.id}`,
      headers: authHeader(userToken),
    });
    expect(mine.statusCode, mine.body).toBe(200);
    expect(mine.json()).toEqual([
      expect.objectContaining({ episode_id: pdfEpisode.id, completed_at: expect.any(String) }),
    ]);
  });
});
