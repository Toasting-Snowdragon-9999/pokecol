import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // happy-dom rather than jsdom: the stores need `localStorage` and a
    // `storage` event, which is all the DOM these tests actually touch.
    environment: "happy-dom",
    include: ["src/**/*.test.ts"],
  },
});
