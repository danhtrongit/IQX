/**
 * Local seed for Học viện v3.2 content review (run via `scripts/dev-academy-v32.sh seed`).
 *
 * Creates, through the real HTTP API of a running local backend:
 *   (a) a fresh learner (only ch01-l01 open), new on every run;
 *   (b) a review learner with every published item passed: all lessons, chapter exams, the optional
 *       practice, and a scenario choice wherever an item has one. Reused (and topped up) across runs.
 *
 * Answers are read here, on the Node side, from the private banks and matched by stable option id;
 * nothing is sent to a browser. Refuses any API that is not on localhost.
 */
import { access, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = (process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v2').replace(/\/$/, '');
const PASSWORD = process.env.SEED_PASSWORD ?? 'Academy32!Passw0rd';
const REVIEW_EMAIL = process.env.SEED_REVIEW_EMAIL ?? 'academy.review@iqx.local';
const REVIEW_USERNAME = process.env.SEED_REVIEW_USERNAME ?? 'academy_review';

type Session = { access_token: string };
type CatalogItem = { id: string; optional: boolean; has_scenario: boolean };
type Catalog = { catalog_version: string; chapters: { items: CatalogItem[] }[] };
type Progress = { items: { id: string; state: string }[] };
type Attempt = { attempt_id: string; questions: { id: string }[] };
type Bank = { questions: { id: string; correct_option_id: string }[] };

class ApiError extends Error {
  constructor(
    readonly status: number,
    body: string,
    route: string,
  ) {
    super(`${route} -> HTTP ${status}: ${body.slice(0, 300)}`);
  }
}

const unwrap = <T>(payload: unknown): T =>
  payload && typeof payload === 'object' && 'data' in payload
    ? (payload as { data: T }).data
    : (payload as T);

async function call<T>(method: string, route: string, body?: unknown, token?: string): Promise<T> {
  const response = await fetch(`${API}${route}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new ApiError(response.status, text, `${method} ${route}`);
  return unwrap<T>(text ? JSON.parse(text) : undefined);
}

async function banksDirectory(): Promise<string> {
  const here = dirname(fileURLToPath(import.meta.url));
  const relative = join('src', 'modules', 'academy', 'content', 'v3', 'questions');
  for (const root of [join(here, '..'), join(here, '..', '..')]) {
    const candidate = join(root, relative);
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the compiled-script layout next.
    }
  }
  throw new Error('Academy question banks not found');
}

async function correctAnswers(directory: string, itemId: string): Promise<Map<string, string>> {
  const bank = JSON.parse(
    await readFile(join(directory, `${itemId}.private.json`), 'utf8'),
  ) as Bank;
  return new Map(bank.questions.map((question) => [question.id, question.correct_option_id]));
}

const stamp = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const phone = () => `09${String(Date.now()).slice(-8)}`;

async function register(email: string, username: string, fullName: string): Promise<void> {
  await call('POST', '/auth/register', {
    email,
    password: PASSWORD,
    full_name: fullName,
    username,
    phone_number: phone(),
  });
}

const login = (identifier: string) =>
  call<Session>('POST', '/auth/login', { identifier, password: PASSWORD });

async function reviewSession(): Promise<Session> {
  try {
    return await login(REVIEW_EMAIL);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status >= 500) throw error;
  }
  await register(REVIEW_EMAIL, REVIEW_USERNAME, 'Reviewer Học viện');
  return login(REVIEW_EMAIL);
}

async function passItem(
  token: string,
  banks: string,
  catalogVersion: string,
  item: CatalogItem,
): Promise<void> {
  if (item.has_scenario) {
    await call('POST', `/academy/lessons/${item.id}/scenario`, { choice: 0 }, token);
  }
  const attempt = await call<Attempt>(
    'POST',
    '/academy/attempts',
    {
      lesson_id: item.id,
      catalog_version: catalogVersion,
      idempotency_key: `seed-${item.id}-${stamp()}`,
    },
    token,
  );
  const correct = await correctAnswers(banks, item.id);
  const answers = attempt.questions.map((question) => {
    const option = correct.get(question.id);
    if (!option) throw new Error(`No key for ${item.id}/${question.id} in the private bank`);
    return { question_id: question.id, option_id: option };
  });
  const result = await call<{ passed: boolean }>(
    'POST',
    `/academy/attempts/${attempt.attempt_id}/submit`,
    { answers },
    token,
  );
  if (!result.passed) throw new Error(`${item.id}: submitted the bank answers but did not pass`);
}

async function main(): Promise<void> {
  const host = new URL(API).hostname;
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host)) {
    throw new Error(`Refusing to seed a non-local API (${API})`);
  }
  const banks = await banksDirectory();

  const freshId = stamp();
  const freshEmail = `academy.fresh.${freshId}@iqx.local`;
  await register(freshEmail, `hv_${freshId}`, 'Học viên mới');
  await login(freshEmail);

  const review = await reviewSession();
  const catalog = await call<Catalog>('GET', '/academy/catalog', undefined, review.access_token);
  let passedNow = 0;
  // Chain order: every item (practice included) unlocks the next, so walk the catalog in order.
  for (const item of catalog.chapters.flatMap((chapter) => chapter.items)) {
    const progress = await call<Progress>(
      'GET',
      '/academy/progress',
      undefined,
      review.access_token,
    );
    if (progress.items.find((entry) => entry.id === item.id)?.state === 'passed') continue;
    await passItem(review.access_token, banks, catalog.catalog_version, item);
    passedNow += 1;
  }
  const progress = await call<Progress>('GET', '/academy/progress', undefined, review.access_token);
  const notPassed = progress.items.filter((entry) => entry.state !== 'passed').map((e) => e.id);

  console.log(`API: ${API}  catalog: ${catalog.catalog_version}`);
  console.log(`Fresh user:   ${freshEmail} / ${PASSWORD}`);
  console.log(
    `Review user:  ${REVIEW_EMAIL} (username ${REVIEW_USERNAME}) / ${PASSWORD}` +
      `  — ${progress.items.length - notPassed.length}/${progress.items.length} items passed (${passedNow} this run)`,
  );
  if (notPassed.length > 0) console.log(`Not passed: ${notPassed.join(', ')}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
