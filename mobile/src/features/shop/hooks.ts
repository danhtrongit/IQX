import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';

import { fetchLedgerPage, fetchPurchaseStatus, fetchShopState, postPurchase, putActiveMascot, classifyActivateError, shopKeys, type CatalogEntry, type ShopState } from './api';
import { activateErrorMessage, newIdempotencyKey, runPurchase, verifyPurchase, type PurchaseOutcome } from './model';

export function useShopState() {
  return useQuery({ queryKey: shopKeys.state, queryFn: ({ signal }) => fetchShopState(signal), staleTime: 15_000, retry: false });
}

export function useShopLedger(enabled: boolean) {
  return useInfiniteQuery({
    queryKey: shopKeys.ledger,
    enabled,
    staleTime: 0,
    retry: false,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => fetchLedgerPage(pageParam, signal),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
}

export type PurchasePhase = { kind: 'idle' } | { kind: 'pending' } | { kind: 'verifying' } | PurchaseOutcome;

/** Purchase state machine; the same key is reused while the confirmed values are unchanged. */
export function usePurchase() {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<PurchasePhase>({ kind: 'idle' });
  const attempt = useRef<{ key: string; signature: string } | null>(null);
  const busy = phase.kind === 'pending' || phase.kind === 'verifying';

  const reread = useCallback(() => queryClient.invalidateQueries({ queryKey: shopKeys.root }), [queryClient]);

  const keyFor = (signature: string) => {
    if (!attempt.current || attempt.current.signature !== signature) attempt.current = { key: newIdempotencyKey(), signature };
    return attempt.current.key;
  };

  const settle = useCallback(
    async (outcome: PurchaseOutcome) => {
      if (outcome.kind === 'done') await reread();
      else if (outcome.kind === 'notice' && outcome.refresh) await queryClient.refetchQueries({ queryKey: shopKeys.state }).catch(() => undefined);
      else if (outcome.kind === 'blocked') await reread();
      if (outcome.kind === 'notice' && outcome.newKey) attempt.current = null;
      setPhase(outcome);
      return outcome;
    },
    [queryClient, reread],
  );

  const buy = useCallback(
    async (entry: CatalogEntry, state: ShopState) => {
      if (busy) return undefined;
      const key = keyFor(`${entry.mascot_id}|${entry.price_xu}|${state.catalog_version}`);
      setPhase({ kind: 'pending' });
      const outcome = await runPurchase(entry, state, key, { post: postPurchase, status: fetchPurchaseStatus });
      return settle(outcome);
    },
    [busy, settle],
  );

  const recheck = useCallback(async () => {
    if (!attempt.current) return undefined;
    setPhase({ kind: 'verifying' });
    return settle(await verifyPurchase(attempt.current.key, { status: fetchPurchaseStatus }));
  }, [settle]);

  return { phase, busy, buy, recheck, reset: () => setPhase({ kind: 'idle' }) };
}

export type ActivateOutcome = { ok: true; changed: boolean } | { ok: false; message: string };

export function useActivateMascot() {
  const queryClient = useQueryClient();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const activate = useCallback(
    async (target: { mascot_id: string; name: string }): Promise<ActivateOutcome> => {
      const known = queryClient.getQueryData<ShopState>(shopKeys.state);
      if (!known) return { ok: false, message: 'Chưa tải được trạng thái Shop nên chưa đổi được linh thú. Hãy thử lại.' };
      setPendingId(target.mascot_id);
      try {
        const result = await putActiveMascot(target.mascot_id, known.active.revision);
        void queryClient.invalidateQueries({ queryKey: shopKeys.root });
        return { ok: true, changed: result.changed };
      } catch (error) {
        const failure = classifyActivateError(error);
        void queryClient.invalidateQueries({ queryKey: shopKeys.root });
        return { ok: false, message: activateErrorMessage(failure.kind, target.name, failure.kind === 'other' ? failure.message : '') };
      } finally {
        setPendingId(null);
      }
    },
    [queryClient],
  );
  return { activate, pendingId };
}
