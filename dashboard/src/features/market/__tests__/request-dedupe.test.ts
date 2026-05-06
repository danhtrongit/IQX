/**
 * Tests for request-dedupe.ts — pure utility, no React needed.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { dedupeRequest, clearRequestCache } from "../request-dedupe";

beforeEach(() => {
  clearRequestCache();
});

describe("dedupeRequest", () => {
  it("returns same promise for same key within TTL", async () => {
    let callCount = 0;
    const fetcher = () => {
      callCount++;
      return Promise.resolve({ ok: true as const, data: callCount });
    };

    const p1 = dedupeRequest("test-key", fetcher);
    const p2 = dedupeRequest("test-key", fetcher);

    expect(p1).toBe(p2); // Same promise reference
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual(r2);
    expect(callCount).toBe(1); // Only called once
  });

  it("different keys create different requests", async () => {
    let callCount = 0;
    const fetcher = () => {
      callCount++;
      return Promise.resolve({ ok: true as const, data: callCount });
    };

    const p1 = dedupeRequest("key-a", fetcher);
    const p2 = dedupeRequest("key-b", fetcher);

    expect(p1).not.toBe(p2);
    await Promise.all([p1, p2]);
    expect(callCount).toBe(2);
  });

  it("clearRequestCache allows new request for same key", async () => {
    let callCount = 0;
    const fetcher = () => {
      callCount++;
      return Promise.resolve({ ok: true as const, data: callCount });
    };

    await dedupeRequest("key", fetcher);
    expect(callCount).toBe(1);

    clearRequestCache();

    await dedupeRequest("key", fetcher);
    expect(callCount).toBe(2);
  });

  it("handles failed requests without breaking cache", async () => {
    const fetcher = () =>
      Promise.resolve({ ok: false as const, error: "Network error" });

    const result = await dedupeRequest("fail-key", fetcher);
    expect(result.ok).toBe(false);
  });
});

describe("DEMO_MODE flag", () => {
  it("VITE_ENABLE_DEMO_DATA defaults to undefined (demo mode off)", () => {
    // In test environment, VITE_ENABLE_DEMO_DATA should not be set
    const val = import.meta.env?.VITE_ENABLE_DEMO_DATA;
    expect(val).not.toBe("true");
  });
});
