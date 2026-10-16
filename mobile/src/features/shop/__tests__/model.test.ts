import { ApiError } from '@/lib/api';
import { classifyActivateError, classifyPurchaseError, parseShopState, type CatalogEntry, type ShopState } from '../api';
import { deriveCardState, formatSignedXu, insufficientMessage, newIdempotencyKey, priceChangedMessage, runPurchase, uuidV4 } from '../model';

const entry: CatalogEntry = { mascot_id: 'thanh_long', name: 'Thanh Long', price_xu: 500, for_sale: true, is_default: false, sort_order: 2, asset_root: '/x' };
const state: ShopState = {
  catalog_version: 'v1',
  catalog: [entry],
  wallet: { balance: 600, last_seq: 1 },
  owned: [{ mascot_id: 'bach_ho' }],
  active: { mascot_id: 'bach_ho', revision: 1 },
  owned_count: 1,
  total_count: 2,
};
const err = (status: number, code?: string, details?: unknown) => new ApiError('msg', status, { code, details });
const wallet = { balance: 100, last_seq: 2 };
const active = { mascot_id: 'bach_ho', revision: 1 };

describe('shop error mapping', () => {
  it('classifies purchase errors', () => {
    expect(classifyPurchaseError(err(409, 'INSUFFICIENT_XU', [{ balance_xu: 10, price_xu: 500 }]))).toEqual({ kind: 'insufficient', balance: 10, price: 500 });
    expect(classifyPurchaseError(err(409, 'PRICE_CHANGED', [{ current_price_xu: 700 }]))).toEqual({ kind: 'price_changed', currentPrice: 700 });
    expect(classifyPurchaseError(err(409, 'CATALOG_CHANGED')).kind).toBe('catalog_changed');
    expect(classifyPurchaseError(err(409, 'MASCOT_NOT_FOR_SALE')).kind).toBe('not_for_sale');
    expect(classifyPurchaseError(err(500)).kind).toBe('unknown_outcome');
    expect(classifyPurchaseError(err(0, 'TIMEOUT')).kind).toBe('unknown_outcome');
    expect(classifyPurchaseError(new Error('x')).kind).toBe('unknown_outcome');
    expect(classifyPurchaseError(err(422, 'X'))).toEqual({ kind: 'rejected', message: 'msg' });
  });

  it('classifies activation errors', () => {
    expect(classifyActivateError(err(409, 'REVISION_CONFLICT')).kind).toBe('revision_conflict');
    expect(classifyActivateError(err(409, 'MASCOT_NOT_OWNED')).kind).toBe('not_owned');
  });

  it('formats messages', () => {
    expect(insufficientMessage(10, 500)).toContain('bạn có 10 xu, cần 500 xu');
    expect(insufficientMessage(null, null)).toBe('Chưa đủ xu để mua linh thú này.');
    expect(priceChangedMessage(null)).toContain('Giá linh thú đã thay đổi');
    expect(formatSignedXu(-5)).toBe('−5');
    expect(formatSignedXu(20)).toBe('+20');
  });

  it('generates unique v4 keys', () => {
    expect(uuidV4()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(newIdempotencyKey()).not.toBe(newIdempotencyKey());
  });
});

describe('card state + parsing', () => {
  it('derives states from server data', () => {
    expect(deriveCardState(entry, state)).toBe('buy');
    expect(deriveCardState(entry, { ...state, wallet: { balance: 1, last_seq: 1 } })).toBe('short');
    expect(deriveCardState({ ...entry, for_sale: false }, state)).toBe('unavailable');
    expect(deriveCardState({ ...entry, mascot_id: 'bach_ho' }, state)).toBe('active');
  });

  it('rejects malformed shop state', () => {
    expect(() => parseShopState({ catalog_version: 'v', catalog: [{}], wallet: {}, owned: [], active: {} })).toThrow();
  });
});

describe('runPurchase', () => {
  const ok = { status: 'purchased' as const, wallet, owned: [], active };

  it('completes on success and sends the confirmed price + key', async () => {
    const post = jest.fn().mockResolvedValue(ok);
    const out = await runPurchase(entry, state, 'k1', { post, status: jest.fn() });
    expect(out).toEqual({ kind: 'done', status: 'purchased', balanceAfter: 100 });
    expect(post).toHaveBeenCalledWith({ mascot_id: 'thanh_long', catalog_version: 'v1', expected_price_xu: 500, idempotency_key: 'k1' });
  });

  it('polls the key after a 5xx and reports completed', async () => {
    const status = jest.fn().mockResolvedValue({ status: 'completed', wallet });
    const out = await runPurchase(entry, state, 'k1', { post: jest.fn().mockRejectedValue(err(503)), status });
    expect(status).toHaveBeenCalledWith('k1');
    expect(out).toEqual({ kind: 'done', status: 'purchased', balanceAfter: 100 });
  });

  it('reports retry when the key was not found, unverified when polling fails', async () => {
    const timeout = jest.fn().mockRejectedValue(err(0, 'TIMEOUT'));
    expect(await runPurchase(entry, state, 'k', { post: timeout, status: jest.fn().mockResolvedValue({ status: 'not_found', wallet }) })).toEqual({ kind: 'retry' });
    expect(await runPurchase(entry, state, 'k', { post: timeout, status: jest.fn().mockRejectedValue(err(500)) })).toEqual({ kind: 'unverified' });
  });

  it('maps business errors without polling', async () => {
    const status = jest.fn();
    const insufficient = await runPurchase(entry, state, 'k', { post: jest.fn().mockRejectedValue(err(409, 'INSUFFICIENT_XU', [{ balance_xu: 10, price_xu: 500 }])), status });
    expect(insufficient).toMatchObject({ kind: 'blocked', canLearn: true });
    const changed = await runPurchase(entry, state, 'k', { post: jest.fn().mockRejectedValue(err(409, 'PRICE_CHANGED', [{ current_price_xu: 700 }])), status });
    expect(changed).toMatchObject({ kind: 'notice', refresh: true });
    expect((changed as { message: string }).message).toContain('700');
    const reused = await runPurchase(entry, state, 'k', { post: jest.fn().mockRejectedValue(err(409, 'IDEMPOTENCY_KEY_REUSED')), status });
    expect(reused).toMatchObject({ kind: 'notice', newKey: true });
    expect(status).not.toHaveBeenCalled();
  });
});
