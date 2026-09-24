import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AuthService } from '../../src/modules/auth/auth.service.js';
import {
  authHeader,
  registerAndLogin,
  startSystemStack,
  type SystemStack,
} from './system-stack.js';

describe('system acceptance: atomic password reset', () => {
  let stack: SystemStack;
  let app: NestFastifyApplication;

  beforeAll(async () => {
    stack = await startSystemStack();
    app = stack.app;
  });

  afterAll(async () => {
    await stack?.close();
  });

  it('consumes one reset token exactly once under concurrent PostgreSQL requests', async () => {
    const user = await registerAndLogin(app, 'reset-race');
    const auth = app.get(AuthService);
    const { token } = await auth.createPasswordResetToken(user.id);
    const passwords = ['AtomicPassword1!', 'AtomicPassword2!'] as const;

    const responses = await Promise.all(
      passwords.map((new_password) =>
        app.inject({
          method: 'POST',
          url: '/api/v2/auth/reset-password',
          payload: { token, new_password },
        }),
      ),
    );

    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 400]);
    const rejected = responses.find((response) => response.statusCode === 400);
    expect(rejected?.json()).toMatchObject({ error: { code: 'TOKEN_INVALID' } });

    const successfulIndex = responses.findIndex((response) => response.statusCode === 200);
    const failedIndex = successfulIndex === 0 ? 1 : 0;
    const successfulLogin = await app.inject({
      method: 'POST',
      url: '/api/v2/auth/login',
      payload: { email: user.email, password: passwords[successfulIndex] },
    });
    expect(successfulLogin.statusCode).toBe(200);
    const unsuccessfulLogin = await app.inject({
      method: 'POST',
      url: '/api/v2/auth/login',
      payload: { email: user.email, password: passwords[failedIndex] },
    });
    expect(unsuccessfulLogin.statusCode).toBe(401);

    const oldAccess = await app.inject({
      method: 'GET',
      url: '/api/v2/auth/me',
      headers: authHeader(user.accessToken),
    });
    expect(oldAccess.statusCode).toBe(401);
    const oldRefresh = await app.inject({
      method: 'POST',
      url: '/api/v2/auth/refresh',
      payload: { refresh_token: user.refreshToken },
    });
    expect(oldRefresh.statusCode).toBe(401);

    const reuse = await app.inject({
      method: 'POST',
      url: '/api/v2/auth/reset-password',
      payload: { token, new_password: 'ThirdPassword3!' },
    });
    expect(reuse.statusCode).toBe(400);
    expect(reuse.json()).toMatchObject({ error: { code: 'TOKEN_INVALID' } });
  });
});
