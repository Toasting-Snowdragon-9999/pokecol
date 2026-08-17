import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useSession } from "../../auth/context";
import { describeAuthError } from "../../auth/types";
import { useCollection } from "../../collection/context";
import { useWishlist } from "../../wishlist/context";
import { Spinner } from "../../components/States";
import styles from "./AccountPage.module.css";

type Mode = "sign-in" | "sign-up";

/**
 * Sign in, create an account, or see the one you're in.
 *
 * The page is deliberately not a gate. CardCol works signed out and the binder
 * behind this page is already full of cards — signing in attaches that binder
 * to an identity so another device can see it, which is why the copy talks
 * about keeping rather than unlocking.
 */
export function AccountPage() {
  const { user, loading, mode: authMode, signIn, signUp, signOut } = useSession();

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>
          <Spinner label="Checking your session" />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {user ? <SignedIn onSignOut={signOut} /> : <AuthForm onSignIn={signIn} onSignUp={signUp} />}
      {authMode === "local" && <LocalModeNotice signedIn={Boolean(user)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function SignedIn({ onSignOut }: { onSignOut: () => Promise<void> }) {
  const { user } = useSession();
  const { uniqueCards, totalCards } = useCollection();
  const { count: wishlistCount } = useWishlist();
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  const initial = (user.displayName || user.email).charAt(0).toUpperCase();

  return (
    <div className={styles.card}>
      <div className={styles.identity}>
        <span className={styles.avatar} aria-hidden="true">
          {initial}
        </span>
        <div className={styles.identityText}>
          <h1 className={styles.name}>{user.displayName}</h1>
          <p className={styles.email}>{user.email}</p>
        </div>
      </div>

      <dl className={styles.stats}>
        <div className={styles.stat}>
          <dt>Cards</dt>
          <dd>{uniqueCards}</dd>
        </div>
        <div className={styles.stat}>
          <dt>With duplicates</dt>
          <dd>{totalCards}</dd>
        </div>
        <div className={styles.stat}>
          <dt>Wishlist</dt>
          <dd>{wishlistCount}</dd>
        </div>
      </dl>

      <p className={styles.hint}>
        Signing out leaves this collection on the device and returns you to the
        signed-out binder. Nothing is deleted.
      </p>

      <button
        type="button"
        className={styles.secondary}
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void onSignOut().finally(() => setBusy(false));
        }}
      >
        {busy ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */

interface AuthFormProps {
  onSignIn: ReturnType<typeof useSession>["signIn"];
  onSignUp: ReturnType<typeof useSession>["signUp"];
}

function AuthForm({ onSignIn, onSignUp }: AuthFormProps) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => emailRef.current?.focus(), []);
  // A failure from the other mode is no longer relevant once you switch.
  useEffect(() => setError(null), [mode]);

  const signingUp = mode === "sign-up";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);
    try {
      if (signingUp) await onSignUp({ email, password, displayName });
      else await onSignIn({ email, password });
      void navigate("/collection");
    } catch (cause) {
      setError(describeAuthError(cause));
      setBusy(false);
    }
  };

  return (
    <div className={styles.card}>
      <div className={styles.intro}>
        <h1 className={styles.title}>{signingUp ? "Create an account" : "Sign in"}</h1>
        <p className={styles.lede}>
          {signingUp
            ? "Keep your binder attached to an account so it can follow you between devices."
            : "Welcome back. Your binder is where you left it."}
        </p>
      </div>

      <form className={styles.form} onSubmit={submit} noValidate>
        {signingUp && (
          <label className={styles.field}>
            <span className={styles.label}>Name</span>
            <input
              className={styles.input}
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              autoComplete="nickname"
              placeholder="Optional"
              disabled={busy}
            />
          </label>
        )}

        <label className={styles.field}>
          <span className={styles.label}>Email</span>
          <input
            ref={emailRef}
            className={styles.input}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
            disabled={busy}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Password</span>
          <input
            className={styles.input}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            /* Tells a password manager to offer a new one rather than autofill
               the old one on the wrong form. */
            autoComplete={signingUp ? "new-password" : "current-password"}
            required
            disabled={busy}
          />
          {signingUp && <span className={styles.assist}>At least 8 characters.</span>}
        </label>

        {/* Announced, so a screen reader hears the failure rather than the
            submit button silently re-enabling. */}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <button type="submit" className={styles.primary} disabled={busy}>
          {busy ? "Just a moment…" : signingUp ? "Create account" : "Sign in"}
        </button>
      </form>

      <p className={styles.swap}>
        {signingUp ? "Already have an account?" : "No account yet?"}{" "}
        <button
          type="button"
          className={styles.link}
          onClick={() => setMode(signingUp ? "sign-in" : "sign-up")}
        >
          {signingUp ? "Sign in" : "Create one"}
        </button>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Says plainly that this build has no server behind it.
 *
 * A login form that looks like it protects something and doesn't is worse than
 * no login form at all — so when Supabase isn't configured, the page admits it
 * rather than implying a security boundary that isn't there.
 */
function LocalModeNotice({ signedIn }: { signedIn: boolean }) {
  return (
    <aside className={styles.notice}>
      <p className={styles.noticeTitle}>This is a profile on this device</p>
      <p className={styles.noticeBody}>
        No account server is configured, so {signedIn ? "this profile" : "an account here"} lives
        only in this browser. It keeps separate collections for separate people sharing a device —
        useful — but it does not sync anywhere and it is not a security measure. Anyone using this
        browser can read the data.
      </p>
      <p className={styles.noticeBody}>
        Set <code className={styles.code}>VITE_SUPABASE_URL</code> and{" "}
        <code className={styles.code}>VITE_SUPABASE_ANON_KEY</code> to switch to real accounts. See{" "}
        <span className={styles.code}>ACCOUNTS.md</span>.
      </p>
    </aside>
  );
}
