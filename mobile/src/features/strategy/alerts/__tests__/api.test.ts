import { mockFetch } from '@/test-utils/fetch';
import { listAlertEvents, listAlerts, listConfigRevisions, listRunsForAlerts, previewAlertSource } from '../api';

jest.mock('@/lib/auth/token-store', () => ({
  getAccessToken: async () => 'tok',
  getRefreshToken: async () => null,
  saveTokens: async () => {},
  clearTokens: async () => {},
}));

describe('alerts api adapters', () => {
  it('unwraps alert list items and tolerates missing items', async () => {
    mockFetch(() => ({ body: { items: [{ id: 'a' }] } }));
    expect(await listAlerts()).toEqual([{ id: 'a' }]);
    mockFetch(() => ({ body: {} }));
    expect(await listAlerts()).toEqual([]);
  });
  it('revisions accept array or {items}', async () => {
    mockFetch(() => ({ body: [{ revision: 1 }] }));
    expect(await listConfigRevisions(50)).toEqual([{ revision: 1 }]);
    mockFetch(() => ({ body: { data: { items: [{ revision: 2 }] } } }));
    expect(await listConfigRevisions(50)).toEqual([{ revision: 2 }]);
  });
  it('runs list and events query string', async () => {
    const { calls } = mockFetch(() => ({ body: { items: [], total: 0 } }));
    expect(await listRunsForAlerts(50)).toEqual([]);
    await listAlertEvents({ side: 'buy', offset: 25, limit: 25 });
    expect(calls[0].url).toContain('/strategy/backtests?limit=50');
    expect(calls[1].url).toContain('side=buy');
    expect(calls[1].url).toContain('offset=25');
  });
  it('source preview posts the source', async () => {
    const { calls } = mockFetch(() => ({ body: { sides_detail: {}, suggested_symbol: null } }));
    await previewAlertSource({ kind: 'shared_config', revision: 1 });
    expect(calls[0].init.method).toBe('POST');
    expect(JSON.parse(calls[0].init.body)).toEqual({ source: { kind: 'shared_config', revision: 1 } });
  });
});
