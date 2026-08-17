import { AuthError } from "./types";
import type { AuthStore, Credentials, SignUpDetails, User } from "./types";

/**
 * Device-local profiles.
 *
 * This is what CardCol offers when no hosted backend is configured. It is a
 * real account in the sense that matters to the app — a stable identity that
 * scopes your collections, so two people sharing a laptop don't share a binder
 * — and it is emphatically **not** a security boundary. Everything lives in
 * this browser's localStorage, which the person sitting at the browser can read
 * and rewrite at will. The UI says so rather than implying otherwise.
 *
 * Passwords are still put through PBKDF2 rather than stored as typed. Not
 * because it defends the binder — it can't — but because people reuse
 * passwords, and leaving one in plain text where a stray extension or a shared
 * machine can read it does real harm somewhere else entirely.
 */

const ACCOUNTS_KEY = "cardcol.auth.accounts.v1";
const SESSION_KEY = "cardcol.auth.session.v1";

/** OWASP's floor for PBKDF2-HMAC-SHA256 at time of writing. */
const ITERATIONS = 210_000;
const MIN_PASSWORD_LENGTH = 8;

interface StoredAccount {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  /** Base64 salt and derived key. Never the password. */
  salt: string;
  hash: string;
  iterations: number;
}

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    key,
    256,
  );
  return toBase64(new Uint8Array(bits));
}

/** Constant-time-ish compare, so a wrong password can't be narrowed by timing. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function readAccounts(): StoredAccount[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredAccount[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAccounts(accounts: StoredAccount[]): void {
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch {
    throw new AuthError("unknown", "Couldn't save the account — this browser's storage is full.");
  }
}

function toUser(account: StoredAccount): User {
  return {
    id: account.id,
    email: account.email,
    displayName: account.displayName,
    createdAt: account.createdAt,
  };
}

const normaliseEmail = (email: string) => email.trim().toLowerCase();

/** Deliberately permissive: the point is to catch typos, not to police addresses. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string): void {
  if (!EMAIL_PATTERN.test(normaliseEmail(email))) {
    throw new AuthError("invalid-email", "That doesn't look like an email address.");
  }
}

export function validatePassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new AuthError(
      "weak-password",
      `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }
}

export function createLocalAuthStore(): AuthStore {
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  const onStorage = (event: StorageEvent) => {
    if (event.key === SESSION_KEY || event.key === ACCOUNTS_KEY || event.key === null) notify();
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);

  const setSession = (userId: string | null) => {
    try {
      if (userId) localStorage.setItem(SESSION_KEY, JSON.stringify({ userId }));
      else localStorage.removeItem(SESSION_KEY);
    } catch {
      /* the in-memory session is still correct for this tab */
    }
    notify();
  };

  return {
    mode: "local",

    async current() {
      try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        const { userId } = JSON.parse(raw) as { userId?: string };
        const account = readAccounts().find((candidate) => candidate.id === userId);
        return account ? { user: toUser(account) } : null;
      } catch {
        return null;
      }
    },

    async signUp({ email, password, displayName }: SignUpDetails) {
      validateEmail(email);
      validatePassword(password);

      const address = normaliseEmail(email);
      const accounts = readAccounts();
      if (accounts.some((account) => account.email === address)) {
        throw new AuthError("email-taken", "There's already a profile with that email on this device.");
      }

      const salt = crypto.getRandomValues(new Uint8Array(16));
      const account: StoredAccount = {
        id: crypto.randomUUID(),
        email: address,
        displayName: displayName?.trim() || address.split("@")[0],
        createdAt: new Date().toISOString(),
        salt: toBase64(salt),
        hash: await derive(password, salt, ITERATIONS),
        iterations: ITERATIONS,
      };

      writeAccounts([...accounts, account]);
      setSession(account.id);
      return { user: toUser(account) };
    },

    async signIn({ email, password }: Credentials) {
      const address = normaliseEmail(email);
      const account = readAccounts().find((candidate) => candidate.email === address);

      /*
       * Same error whether the address is unknown or the password is wrong.
       * Even here — where anyone can just read the account list — the habit is
       * worth keeping, because this is the code the hosted store is modelled on.
       */
      const wrong = new AuthError("invalid-credentials", "That email and password don't match.");
      if (!account) throw wrong;

      const attempt = await derive(password, fromBase64(account.salt), account.iterations);
      if (!safeEqual(attempt, account.hash)) throw wrong;

      setSession(account.id);
      return { user: toUser(account) };
    },

    async signOut() {
      setSession(null);
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
