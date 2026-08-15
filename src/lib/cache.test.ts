import { describe, expect, it, vi } from "vitest";
import { cacheKey, cached, TTL } from "./cache";

/**
 * These cover the bug this cache was rewritten to fix: two components asking
 * for the same resource in the same tick used to fire two real requests, which
 * on a flaky API meant the burst caused the failures it then had to retry
 * through. Ten seconds of skeletons on a brand-new user's first visit.
 */

/** Unique per test so cases can't share cache entries. */
let counter = 0;
const freshKey = () => cacheKey("test", { n: ++counter });

describe("cached — single flight", () => {
  it("runs one load for concurrent callers of the same key", async () => {
    const key = freshKey();
    const loader = vi.fn(async () => "value");

    const results = await Promise.all([
      cached(key, TTL.card, loader),
      cached(key, TTL.card, loader),
      cached(key, TTL.card, loader),
    ]);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(results).toEqual(["value", "value", "value"]);
  });

  it("serves the cached value without loading again", async () => {
    const key = freshKey();
    const loader = vi.fn(async () => "value");

    await cached(key, TTL.card, loader);
    await cached(key, TTL.card, loader);

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("loads again once an entry has expired", async () => {
    const key = freshKey();
    const loader = vi.fn(async () => "value");

    await cached(key, 0, loader);
    await cached(key, 0, loader);

    expect(loader).toHaveBeenCalledTimes(2);
  });
});

describe("cached — abort safety", () => {
  it("does not cancel the shared load when one caller aborts", async () => {
    const key = freshKey();
    const controller = new AbortController();
    let resolveLoad: (value: string) => void = () => {};
    const loader = vi.fn(
      (signal?: AbortSignal) =>
        new Promise<string>((resolve, reject) => {
          resolveLoad = resolve;
          signal?.addEventListener("abort", () => reject(new Error("shared load was cancelled")));
        }),
    );

    const abandoned = cached(key, TTL.card, loader, controller.signal);
    const stayed = cached(key, TTL.card, loader);

    // The first caller walks away — StrictMode's first mount, say.
    controller.abort();
    await expect(abandoned).rejects.toThrow();

    resolveLoad("value");
    // The second caller still gets its answer.
    await expect(stayed).resolves.toBe("value");
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("abandons the load once every caller has gone", async () => {
    const key = freshKey();
    const first = new AbortController();
    const second = new AbortController();
    let loadSignal: AbortSignal | undefined;

    const loader = vi.fn((signal?: AbortSignal) => {
      loadSignal = signal;
      return new Promise<string>(() => {
        /* never settles on its own */
      });
    });

    // Rejections are asserted at the end; attach now so aborting doesn't
    // surface as an unhandled rejection in between.
    const a = cached(key, TTL.card, loader, first.signal);
    const b = cached(key, TTL.card, loader, second.signal);
    const settled = Promise.allSettled([a, b]);

    // `cached` reads the cache before it loads, so let those awaits drain
    // before asserting anything about the loader's signal.
    await vi.waitFor(() => expect(loadSignal).toBeDefined());

    first.abort();
    expect(loadSignal?.aborted).toBe(false);

    // Nobody is listening now, so finishing would spend a request for nothing.
    second.abort();
    expect(loadSignal?.aborted).toBe(true);

    expect(await settled).toEqual([
      { status: "rejected", reason: expect.anything() },
      { status: "rejected", reason: expect.anything() },
    ]);
  });

  it("rejects immediately for a caller whose signal is already aborted", async () => {
    const key = freshKey();
    const controller = new AbortController();
    controller.abort();
    const loader = vi.fn(async () => "value");

    await expect(cached(key, TTL.card, loader, controller.signal)).rejects.toThrow();
    expect(loader).not.toHaveBeenCalled();
  });
});

describe("cached — stale on failure", () => {
  it("serves an expired entry when the loader fails", async () => {
    const key = freshKey();

    await cached(key, TTL.card, async () => "old");
    // Expired, and the network is down: outdated data beats an error screen.
    const value = await cached(key, 0, async () => {
      throw new Error("network down");
    });

    expect(value).toBe("old");
  });

  it("propagates a failure when there is nothing stale to fall back on", async () => {
    await expect(
      cached(freshKey(), TTL.card, async () => {
        throw new Error("network down");
      }),
    ).rejects.toThrow("network down");
  });

  it("propagates an abort rather than masking it with stale data", async () => {
    const key = freshKey();
    const controller = new AbortController();

    await cached(key, TTL.card, async () => "old");
    controller.abort();

    // An abort is intentional, so it must not be quietly swallowed.
    await expect(cached(key, 0, async () => "new", controller.signal)).rejects.toThrow();
  });
});
