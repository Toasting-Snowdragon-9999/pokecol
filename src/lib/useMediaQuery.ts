import { useSyncExternalStore } from "react";

/**
 * Subscribe to a media query. The binder uses this to collapse to a single
 * page on narrow screens, which changes how sheets are paginated — so it has
 * to be reactive state, not just a CSS breakpoint.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = (onChange: () => void) => {
    const list = window.matchMedia(query);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  };

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export function usePrefersReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}
