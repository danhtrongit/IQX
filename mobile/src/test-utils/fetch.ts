export type MockReply = { status?: number; body?: unknown; headers?: Record<string, string>; raw?: string };

export function reply({ status = 200, body, headers = {}, raw }: MockReply) {
  const text = raw ?? (body === undefined ? '' : JSON.stringify(body));
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => lower[k.toLowerCase()] ?? null },
    text: async () => text,
  };
}

export type Route = (req: { url: string; init: any }) => MockReply | Promise<MockReply> | undefined;

/** Install a global fetch mock; handlers are tried in order, first defined result wins. */
export function mockFetch(...handlers: Route[]) {
  const calls: { url: string; init: any }[] = [];
  const fn = jest.fn(async (url: string, init: any = {}) => {
    calls.push({ url, init });
    for (const h of handlers) {
      const r = await h({ url, init });
      if (r) return reply(r);
    }
    return reply({ status: 404, body: { error: { message: 'not mocked' } } });
  });
  (globalThis as any).fetch = fn;
  return { fn, calls };
}
