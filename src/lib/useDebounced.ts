import { useEffect, useState } from "react";

/**
 * Trailing debounce. Every keystroke that reaches the API costs part of a
 * 1000-request daily budget, so search input is throttled hard.
 */
export function useDebounced<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
