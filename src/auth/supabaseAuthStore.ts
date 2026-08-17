import { AuthError, type AuthStore, type Credentials, type Session, type SignUpDetails } from "./types";
import { validateEmail, validatePassword } from "./localAuthStore";

/**
 * Hosted accounts, via Supabase's REST auth endpoints.
 *
 * Called directly rather than through `@supabase/supabase-js` on purpose: the
 * three calls this app needs are plain HTTP, and the SDK is ~60KB gzipped
 * against a 97KB bundle. If sync later needs realtime subscriptions or the
 * Postgres query builder, that is the moment to take the dependency — not now.
 *
 * The anon key is designed to ship in a browser bundle; it grants nothing on
 * its own. What actually protects a row is row-level security in the database
 * — see ACCOUNTS.md for the schema and the policy.
 */

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, "");
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && anonKey);

const SESSION_KEY = "cardcol.auth.supabase-session.v1";

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  user?: {
    id: string;
    email?: string;
    created_at?: string;
    user_metadata?: { display_name?: string };
  };
  /** Error shape. */
  error?: string;
  error_description?: string;
  msg?: string;
  message?: string;
  code?: string;
}

interface StoredSession {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  user: { id: string; email: string; displayName: string; createdAt: string };
}

function readStored(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

function writeStored(session: StoredSession | null): void {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* the in-memory session still works for this tab */
  }
}

/** Supabase reports failures in several shapes depending on the endpoint. */
function toAuthError(status: number, body: TokenResponse): AuthError {
  const message = body.error_description ?? body.msg ?? body.message ?? body.error ?? "";
  const text = message.toLowerCase();

  if (status === 400 && text.includes("already registered")) {
    return new AuthError("email-taken", "There's already an account with that email.");
  }
  if (status === 400 && (text.includes("invalid login") || text.includes("credentials"))) {
    return new AuthError("invalid-credentials", "That email and password don't match.");
  }
  if (text.includes("password")) {
    return new AuthError("weak-password", message || "That password is too weak.");
  }
  if (status === 422 || text.includes("email")) {
    return new AuthError("invalid-email", message || "That email address wasn't accepted.");
  }
  return new AuthError("unknown", message || "Couldn't reach the account service.");
}

async function post(path: string, body: unknown): Promise<TokenResponse> {
  let response: Response;
  try {
    response = await fetch(`${url}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anonKey! },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AuthError("network", "Couldn't reach the account service. Check your connection.");
  }

  const payload = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok) throw toAuthError(response.status, payload);
  return payload;
}

function toStored(payload: TokenResponse): StoredSession {
  const user = payload.user;
  if (!payload.access_token || !user) {
    /*
     * Supabase returns 200 with no token when email confirmation is on. That is
     * a setup choice rather than a failure, so say what to do about it.
     */
    throw new AuthError(
      "unknown",
      "Account created — check your email to confirm it, then sign in. (Turn off email confirmation in Supabase to skip this.)",
    );
  }

  const email = user.email ?? "";
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: payload.expires_at,
    user: {
      id: user.id,
      email,
      displayName: user.user_metadata?.display_name?.trim() || email.split("@")[0],
      createdAt: user.created_at ?? new Date().toISOString(),
    },
  };
}

const toSession = (stored: StoredSession): Session => ({
  user: stored.user,
  accessToken: stored.accessToken,
});

export function createSupabaseAuthStore(): AuthStore {
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  const onStorage = (event: StorageEvent) => {
    if (event.key === SESSION_KEY || event.key === null) notify();
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);

  const persist = (session: StoredSession | null) => {
    writeStored(session);
    notify();
  };

  return {
    mode: "hosted",

    async current() {
      const stored = readStored();
      if (!stored) return null;

      // Refresh a little early rather than letting the first real request 401.
      const expiresSoon = stored.expiresAt !== undefined && stored.expiresAt * 1000 - Date.now() < 60_000;
      if (!expiresSoon || !stored.refreshToken) return toSession(stored);

      try {
        const refreshed = toStored(
          await post("/auth/v1/token?grant_type=refresh_token", {
            refresh_token: stored.refreshToken,
          }),
        );
        writeStored(refreshed);
        return toSession(refreshed);
      } catch {
        // A refresh that fails means the session is genuinely over.
        writeStored(null);
        return null;
      }
    },

    async signIn({ email, password }: Credentials) {
      const session = toStored(
        await post("/auth/v1/token?grant_type=password", {
          email: email.trim().toLowerCase(),
          password,
        }),
      );
      persist(session);
      return toSession(session);
    },

    async signUp({ email, password, displayName }: SignUpDetails) {
      // Fail on an obvious typo before spending a round-trip on it.
      validateEmail(email);
      validatePassword(password);

      const session = toStored(
        await post("/auth/v1/signup", {
          email: email.trim().toLowerCase(),
          password,
          data: displayName?.trim() ? { display_name: displayName.trim() } : undefined,
        }),
      );
      persist(session);
      return toSession(session);
    },

    async signOut() {
      const stored = readStored();
      // Clear locally first: a signed-out user must never stay signed in just
      // because the network was down.
      persist(null);
      if (!stored) return;

      try {
        await fetch(`${url}/auth/v1/logout`, {
          method: "POST",
          headers: {
            apikey: anonKey!,
            Authorization: `Bearer ${stored.accessToken}`,
          },
        });
      } catch {
        /* the local session is already gone, which is what the user asked for */
      }
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
