import { beforeEach, describe, expect, it } from "vitest";
import { createLocalAuthStore } from "./localAuthStore";
import { AuthError } from "./types";
import { scopedKey, setStorageOwner } from "../lib/storageScope";

const CREDENTIALS = { email: "chris@example.com", password: "binder-of-holos" };

beforeEach(() => {
  localStorage.clear();
  setStorageOwner(null);
});

describe("sign up", () => {
  it("creates an account and returns a session", async () => {
    const store = createLocalAuthStore();
    const session = await store.signUp({ ...CREDENTIALS, displayName: "Chris" });

    expect(session.user.email).toBe("chris@example.com");
    expect(session.user.displayName).toBe("Chris");
    expect(session.user.id).toBeTruthy();
  });

  it("falls back to the local part of the email for a name", async () => {
    const session = await createLocalAuthStore().signUp(CREDENTIALS);
    expect(session.user.displayName).toBe("chris");
  });

  it("never stores the password", async () => {
    await createLocalAuthStore().signUp(CREDENTIALS);
    // The single failure here that would matter outside this app: a reused
    // password sitting in plain text where anything can read it.
    expect(JSON.stringify(localStorage)).not.toContain(CREDENTIALS.password);
  });

  it("rejects a malformed email", async () => {
    await expect(
      createLocalAuthStore().signUp({ email: "nope", password: "long-enough" }),
    ).rejects.toThrow(AuthError);
  });

  it("rejects a short password", async () => {
    await expect(
      createLocalAuthStore().signUp({ email: "a@b.com", password: "short" }),
    ).rejects.toThrow(/at least 8/i);
  });

  it("rejects a duplicate email, case-insensitively", async () => {
    const store = createLocalAuthStore();
    await store.signUp(CREDENTIALS);
    await expect(
      store.signUp({ email: "CHRIS@Example.com", password: "another-one" }),
    ).rejects.toThrow(/already/i);
  });
});

describe("sign in", () => {
  it("accepts the right password", async () => {
    const store = createLocalAuthStore();
    const created = await store.signUp(CREDENTIALS);
    await store.signOut();

    const session = await store.signIn(CREDENTIALS);
    expect(session.user.id).toBe(created.user.id);
  });

  it("is case-insensitive about the email", async () => {
    const store = createLocalAuthStore();
    await store.signUp(CREDENTIALS);
    await store.signOut();

    await expect(
      store.signIn({ email: "  CHRIS@EXAMPLE.COM ", password: CREDENTIALS.password }),
    ).resolves.toBeTruthy();
  });

  it("rejects the wrong password", async () => {
    const store = createLocalAuthStore();
    await store.signUp(CREDENTIALS);
    await expect(store.signIn({ ...CREDENTIALS, password: "wrong" })).rejects.toThrow(
      /don't match/i,
    );
  });

  it("says the same thing for an unknown address as for a bad password", async () => {
    const store = createLocalAuthStore();
    await store.signUp(CREDENTIALS);

    const unknown = await store.signIn({ email: "nobody@example.com", password: "x" }).catch((e) => e);
    const wrong = await store.signIn({ ...CREDENTIALS, password: "wrong" }).catch((e) => e);
    // Not because it defends this store — it can't — but because it's the code
    // the hosted store is modelled on.
    expect(unknown.message).toBe(wrong.message);
  });
});

describe("session", () => {
  it("survives a new store instance, as it would a reload", async () => {
    await createLocalAuthStore().signUp(CREDENTIALS);

    const session = await createLocalAuthStore().current();
    expect(session?.user.email).toBe("chris@example.com");
  });

  it("is gone after signing out", async () => {
    const store = createLocalAuthStore();
    await store.signUp(CREDENTIALS);
    await store.signOut();

    expect(await store.current()).toBeNull();
    expect(await createLocalAuthStore().current()).toBeNull();
  });

  it("notifies subscribers on sign-in and sign-out", async () => {
    const store = createLocalAuthStore();
    let calls = 0;
    const unsubscribe = store.subscribe(() => calls++);

    await store.signUp(CREDENTIALS);
    await store.signOut();
    unsubscribe();

    expect(calls).toBeGreaterThanOrEqual(2);
  });
});

describe("storage scoping", () => {
  it("leaves signed-out keys unsuffixed", () => {
    setStorageOwner(null);
    expect(scopedKey("cardcol.collection.v4")).toBe("cardcol.collection.v4");
  });

  it("namespaces keys per user", () => {
    setStorageOwner("user-a");
    const a = scopedKey("cardcol.collection.v4");
    setStorageOwner("user-b");
    const b = scopedKey("cardcol.collection.v4");

    expect(a).not.toBe(b);
    // Signed-out data must not be reachable under either identity.
    expect(a).not.toBe("cardcol.collection.v4");
    expect(b).not.toBe("cardcol.collection.v4");
  });
});
