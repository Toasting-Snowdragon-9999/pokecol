/**
 * Service worker registration.
 *
 * Production only, and deliberately so: a caching worker sitting in front of
 * Vite's dev server intercepts module requests and makes HMR lie to you, which
 * costs far more debugging time than offline-in-dev is worth.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        // A new worker takes over on the next navigation by default. Nudging it
        // through means an update lands on the next page load rather than
        // whenever the user happens to close every tab.
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              installing.postMessage("skip-waiting");
            }
          });
        });
      })
      .catch(() => {
        /* Offline support is a bonus; failing to register must never break the app. */
      });
  });
}
