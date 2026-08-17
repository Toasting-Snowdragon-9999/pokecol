import { createLocalAuthStore } from "./localAuthStore";
import { createSupabaseAuthStore, supabaseConfigured } from "./supabaseAuthStore";
import type { AuthStore } from "./types";

/**
 * The app's auth store.
 *
 * Hosted when Supabase is configured, device-local otherwise — the same
 * "degrade to something honest rather than break" pattern the TCG providers use
 * for their API keys. Nothing above this line knows which it got, except the
 * login page, which tells the user the truth about what they're signing into.
 */
export const authStore: AuthStore = supabaseConfigured
  ? createSupabaseAuthStore()
  : createLocalAuthStore();

export { supabaseConfigured };
