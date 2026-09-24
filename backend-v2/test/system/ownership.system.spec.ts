import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  authHeader,
  registerAndLogin,
  startSystemStack,
  type SystemStack,
} from './system-stack.js';

describe('system acceptance: ownership boundaries', () => {
  let stack: SystemStack;

  beforeAll(async () => {
    stack = await startSystemStack();
  });
  afterAll(async () => {
    await stack?.close();
  });

  it('isolates watchlists and chart drawings between users', async () => {
    const owner = await registerAndLogin(stack.app, 'owner');
    const other = await registerAndLogin(stack.app, 'other');
    const add = await stack.app.inject({
      method: 'POST',
      url: '/api/v2/watchlists',
      headers: authHeader(owner.accessToken),
      payload: { symbol: 'VCB' },
    });
    expect(add.statusCode).toBe(201);
    const ownerList = await stack.app.inject({
      method: 'GET',
      url: '/api/v2/watchlists',
      headers: authHeader(owner.accessToken),
    });
    expect(ownerList.statusCode).toBe(200);
    expect(ownerList.json().data.map((item: { symbol: string }) => item.symbol)).toContain('VCB');
    const otherList = await stack.app.inject({
      method: 'GET',
      url: '/api/v2/watchlists',
      headers: authHeader(other.accessToken),
    });
    expect(otherList.statusCode).toBe(200);
    expect(otherList.json().data).toEqual([]);
    const otherDelete = await stack.app.inject({
      method: 'DELETE',
      url: '/api/v2/watchlists/VCB',
      headers: authHeader(other.accessToken),
    });
    expect(otherDelete.statusCode).toBe(404);

    const drawing = await stack.app.inject({
      method: 'PUT',
      url: '/api/v2/chart-drawings/VCB',
      headers: authHeader(owner.accessToken),
      payload: { state: { lines: [{ x: 1, y: 2 }] } },
    });
    expect(drawing.statusCode).toBe(200);
    const foreignRead = await stack.app.inject({
      method: 'GET',
      url: '/api/v2/chart-drawings/VCB',
      headers: authHeader(other.accessToken),
    });
    expect(foreignRead.statusCode).toBe(200);
    expect(foreignRead.json().data.state).toBeNull();
    const foreignDelete = await stack.app.inject({
      method: 'DELETE',
      url: '/api/v2/chart-drawings/VCB',
      headers: authHeader(other.accessToken),
    });
    expect(foreignDelete.statusCode).toBe(204);
    const ownerRead = await stack.app.inject({
      method: 'GET',
      url: '/api/v2/chart-drawings/VCB',
      headers: authHeader(owner.accessToken),
    });
    expect(ownerRead.json().data.state).toMatchObject({ lines: [{ x: 1, y: 2 }] });
  });

  it('does not expose private learning content to an unauthenticated or non-entitled user', async () => {
    const admin = await registerAndLogin(stack.app, 'course-admin');
    await stack.query("UPDATE users SET role = 'admin', is_email_verified = true WHERE id = $1", [
      admin.id,
    ]);
    const adminLogin = await stack.app.inject({
      method: 'POST',
      url: '/api/v2/auth/login',
      payload: { email: admin.email, password: 'System!Passw0rd' },
    });
    const adminToken = (adminLogin.json() as { access_token: string }).access_token;
    const course = await stack.app.inject({
      method: 'POST',
      url: '/api/v2/admin/lessons/courses',
      headers: authHeader(adminToken),
      payload: {
        slug: `premium-${Date.now()}`,
        title: 'Private course',
        description: 'System',
        level: 'beginner',
        category: 'system',
        is_premium: true,
        is_published: true,
      },
    });
    expect(course.statusCode).toBe(201);
    const courseId =
      (course.json() as { id?: string; data?: { id: string } }).id ??
      (course.json() as { data: { id: string } }).data.id;
    const episode = await stack.app.inject({
      method: 'POST',
      url: `/api/v2/admin/lessons/courses/${courseId}/episodes`,
      headers: authHeader(adminToken),
      payload: { title: 'PDF', content_type: 'pdf', sort_order: 1 },
    });
    expect([200, 201]).toContain(episode.statusCode);
    const episodeId =
      (episode.json() as { id?: string; data?: { id: string } }).id ??
      (episode.json() as { data: { id: string } }).data.id;
    const anonymous = await stack.app.inject({
      method: 'GET',
      url: `/api/v2/lessons/episodes/${episodeId}/content`,
    });
    expect([401, 403]).toContain(anonymous.statusCode);
    const freeUser = await registerAndLogin(stack.app, 'free-course');
    // Registration may provision a trial grant. Remove it explicitly so this
    // assertion verifies the private-content entitlement boundary itself.
    await stack.query('DELETE FROM billing_entitlement_grants WHERE user_id = $1', [freeUser.id]);
    const forbidden = await stack.app.inject({
      method: 'GET',
      url: `/api/v2/lessons/episodes/${episodeId}/content`,
      headers: authHeader(freeUser.accessToken),
    });
    expect([403, 404]).toContain(forbidden.statusCode);
  });
});
