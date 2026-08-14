/**
 * Small fetch wrapper with timeouts and retries.
 *
 * This is not defensive boilerplate: the Pokémon TCG API demonstrably returns
 * 500s and 502s under quite light request bursts, well inside its documented
 * rate limit. Without backoff the app looks broken on a perfectly normal search.
 */

const RETRY_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const RETRY_DELAYS_MS = [400, 900, 2000];
const DEFAULT_TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  readonly status: number;
  readonly retriable: boolean;

  constructor(message: string, status: number, retriable: boolean) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.retriable = retriable;
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/** Human-facing message for any thrown value. Used by every error state in the UI. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) return "The card API is rate limiting us. Wait a moment and retry.";
    if (error.status === 0) return "Couldn't reach the card API. Check your connection.";
    if (error.status >= 500) return "The card API is having a moment. Try again shortly.";
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Combine a caller's signal with a per-attempt timeout. */
function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  if (!signal) return timeout;
  // AbortSignal.any is widely supported; fall back to the caller's signal alone.
  return typeof AbortSignal.any === "function" ? AbortSignal.any([signal, timeout]) : signal;
}

/** `Retry-After` may be seconds or an HTTP date. Returns ms, or null. */
function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

export interface FetchJsonOptions {
  signal?: AbortSignal;
  headers?: Record<string, string>;
  retries?: number;
  timeoutMs?: number;
}

export async function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const { signal, headers, retries = RETRY_DELAYS_MS.length, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    // The caller aborting (a superseded search, an unmounted component) is not
    // a failure to retry — bail out immediately and let it propagate.
    if (signal?.aborted) throw signal.reason;

    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json", ...headers },
        signal: withTimeout(signal, timeoutMs),
      });

      if (response.ok) return (await response.json()) as T;

      const retriable = RETRY_STATUSES.has(response.status);
      lastError = new ApiError(
        `Request failed with status ${response.status}`,
        response.status,
        retriable,
      );
      if (!retriable || attempt === retries) throw lastError;

      const retryAfter = parseRetryAfter(response.headers.get("Retry-After"));
      await delay(retryAfter ?? jitter(RETRY_DELAYS_MS[attempt]), signal);
    } catch (error) {
      // A caller-initiated abort propagates untouched. A timeout abort is a
      // TimeoutError, which is worth another attempt.
      if (isAbortError(error) && signal?.aborted) throw error;
      if (error instanceof ApiError && !error.retriable) throw error;

      lastError = error instanceof ApiError ? error : new ApiError(networkMessage(error), 0, true);
      if (attempt === retries) throw lastError;
      await delay(jitter(RETRY_DELAYS_MS[attempt]), signal);
    }
  }

  throw lastError ?? new ApiError("Request failed", 0, false);
}

function networkMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "TimeoutError") return "The request timed out.";
  return error instanceof Error ? error.message : "Network request failed";
}

/** Spread retries so several in-flight requests don't all wake up together. */
function jitter(base: number): number {
  return base + Math.random() * base * 0.3;
}
