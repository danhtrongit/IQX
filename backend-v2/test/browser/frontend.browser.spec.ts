import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerAndLogin, startSystemStack, type SystemStack } from '../system/system-stack.js';

const frontendRoot = fileURLToPath(new URL('../../../frontend-v2/', import.meta.url));

describe('frontend-v2 browser acceptance with isolated Nest/PostgreSQL/Redis', () => {
  let stack: SystemStack;
  let userEmail: string;
  let adminEmail: string;
  let address: string;

  beforeAll(async () => {
    stack = await startSystemStack({ COMPATIBILITY_V1_ENABLED: 'false', REALTIME_ENABLED: 'true' });
    const user = await registerAndLogin(stack.app, 'browser-user');
    const admin = await registerAndLogin(stack.app, 'browser-admin');
    userEmail = user.email;
    adminEmail = admin.email;
    await stack.query("update users set role='admin', is_email_verified=true where id=$1", [
      admin.id,
    ]);
    await stack.query('update users set is_email_verified=true where id=$1', [user.id]);
    await stack.app.listen(0, '127.0.0.1');
    address = await stack.app.getUrl();
  });

  afterAll(async () => {
    await stack?.close();
  });

  it('exercises canonical v2 browser routes without v1 compatibility', async () => {
    const output: string[] = [];
    const code = await new Promise<number | null>((resolve, reject) => {
      const child = spawn('npm', ['exec', '--', 'playwright', 'test', 'real-backend.spec.ts'], {
        cwd: frontendRoot,
        env: {
          ...process.env,
          API_PROXY_TARGET: address,
          VITE_API_URL: '/api/v2',
          VITE_WS_URL: '/api/v2/market-data/ws',
          E2E_REAL_BACKEND: '1',
          E2E_API_BASE_URL: `${address}/api/v2`,
          E2E_USER_EMAIL: userEmail,
          E2E_ADMIN_EMAIL: adminEmail,
          E2E_TEST_PASSWORD: 'System!Passw0rd',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error('Frontend browser suite exceeded its execution deadline'));
      }, 270_000);
      const capture = (chunk: Buffer) => {
        const value = chunk.toString();
        output.push(value);
        process.stdout.write(value);
      };
      child.stdout.on('data', capture);
      child.stderr.on('data', capture);
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on('exit', (exitCode) => {
        clearTimeout(timer);
        resolve(exitCode);
      });
    });
    expect(code, output.join('').slice(-12_000)).toBe(0);
  });
});
