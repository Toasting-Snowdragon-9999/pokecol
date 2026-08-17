/**
 * Accounts.
 *
 * The contract deliberately mirrors the collection and wishlist stores — async,
 * subscribable, injectable — so the hosted implementation swaps in the same way
 * theirs does.
 *
 * One rule shapes everything here: **an account adds sync, it does not gate the
 * app.** CardCol works signed out and always will; signing in attaches your
 * local binder to an identity so a second device can see it. That is why there
 * is no "protected route" anywhere, and why the local store keeps working
 * exactly as before when nobody is signed in.
 */

export interface User {
  id: string;
  email: string;
  /** What to greet them with. Falls back to the local part of the email. */
  displayName: string;
  createdAt: string;
}

export interface Session {
  user: User;
  /** Absent for device-local profiles, which have nothing to present to a server. */
  accessToken?: string;
}

/** Everything that can go wrong, named so the UI can say something useful. */
export type AuthErrorCode =
  | "invalid-credentials"
  | "email-taken"
  | "weak-password"
  | "invalid-email"
  | "network"
  | "not-configured"
  | "unknown";

export class AuthError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.name = "AuthError";
    this.code = code;
  }
}

/** Human-facing text for any thrown value. Used by every auth form. */
export function describeAuthError(error: unknown): string {
  if (error instanceof AuthError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong. Try again.";
}

export interface Credentials {
  email: string;
  password: string;
}

export interface SignUpDetails extends Credentials {
  displayName?: string;
}

export interface AuthStore {
  /** How this store identifies itself in the UI — see `AuthMode`. */
  readonly mode: AuthMode;
  /** Session restored from storage, or null. Resolves once on boot. */
  current(): Promise<Session | null>;
  signIn(credentials: Credentials): Promise<Session>;
  signUp(details: SignUpDetails): Promise<Session>;
  signOut(): Promise<void>;
  /** Fires on sign-in, sign-out, and cross-tab session changes. */
  subscribe(listener: () => void): () => void;
}

/**
 * Which kind of account this build is offering.
 *
 * `local` is honest about being a device-local profile with no server behind it:
 * it scopes your collections and gives the app a sense of "who", but it does not
 * sync and it is not a security boundary. `hosted` is a real account.
 *
 * The distinction is surfaced to the user rather than hidden, because a login
 * form that looks like it protects something and doesn't is worse than no login
 * form at all.
 */
export type AuthMode = "local" | "hosted";
