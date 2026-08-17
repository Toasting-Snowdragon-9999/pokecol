# Accounts

CardCol works signed out and always will. An account **adds sync**; it does not
gate anything. There is no protected route in the app, and the local stores keep
working exactly as they did before accounts existed.

There are two modes, chosen automatically:

| Mode | When | What it is |
|---|---|---|
| **Device-local profile** | No Supabase env vars | A real identity that scopes collections on this device. Does not sync. **Not a security boundary.** |
| **Hosted account** | `VITE_SUPABASE_*` set | A real account with a server behind it. |

The login page says which one you're in rather than implying a protection that
isn't there.

---

## How storage is scoped

Rather than teach every store about accounts, the storage *key* carries the owner:

```
signed out    cardcol.collection.v4
signed in     cardcol.collection.v4::u/3f9a1c…
```

Signed-out storage keeps its original unsuffixed key, so an existing local binder
survives untouched and signing out returns you to exactly the binder you had.
See `src/lib/storageScope.ts`.

This applies to all three stores — collection, wishlist and binder layout.

---

## Device-local profiles

`src/auth/localAuthStore.ts`. Accounts live in `localStorage`.

Passwords go through PBKDF2-HMAC-SHA256 at 210,000 iterations with a random
16-byte salt. **This does not protect the binder** — anyone at the browser can
read and rewrite localStorage regardless. It exists because people reuse
passwords, and leaving one in plain text where a stray extension can read it
does real harm somewhere else entirely.

Verified: after signing in, the typed password appears nowhere in localStorage.

---

## Hosted accounts (Supabase)

### 1. Create a project

At [supabase.com](https://supabase.com). From **Project Settings → API**, copy
the project URL and the `anon` public key into `.env.local`:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Restart the dev server. The login page will stop showing the device-local notice.

The anon key is designed to ship in a browser bundle and grants nothing by
itself — row-level security is what actually protects a row.

> **Email confirmation.** Supabase enables it by default, which means sign-up
> returns no session until the user clicks a link. The app reports that clearly.
> For local development, turn it off under **Authentication → Providers → Email**.

### 2. Create the schema

Run this in the Supabase SQL editor. It mirrors the three local stores, carries
the same sync metadata, and scopes every row to its owner.

```sql
-- Collection ------------------------------------------------------------
create table public.collection_entries (
  user_id     uuid        not null references auth.users on delete cascade,
  game_id     text        not null,
  card_id     text        not null,
  variant_id  text        not null,
  quantity    integer     not null default 0,
  added_at    timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted     boolean     not null default false,
  primary key (user_id, game_id, card_id, variant_id)
);

-- Wishlist --------------------------------------------------------------
create table public.wishlist_entries (
  user_id     uuid        not null references auth.users on delete cascade,
  game_id     text        not null,
  card_id     text        not null,
  variant_id  text        not null,
  note        text,
  added_at    timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted     boolean     not null default false,
  primary key (user_id, game_id, card_id, variant_id)
);

-- Binder layout ---------------------------------------------------------
-- One row per placed card. `page`/`slot` are per-game coordinates.
create table public.layout_placements (
  user_id     uuid        not null references auth.users on delete cascade,
  game_id     text        not null,
  card_id     text        not null,
  page        integer     not null,
  slot        integer     not null,
  updated_at  timestamptz not null default now(),
  deleted     boolean     not null default false,
  primary key (user_id, game_id, card_id)
);

-- Row-level security: you can only ever see and write your own rows -------
alter table public.collection_entries enable row level security;
alter table public.wishlist_entries   enable row level security;
alter table public.layout_placements  enable row level security;

create policy "own rows" on public.collection_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on public.wishlist_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on public.layout_placements
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Pulling changes since a timestamp is the sync layer's hot path.
create index on public.collection_entries (user_id, updated_at);
create index on public.wishlist_entries   (user_id, updated_at);
create index on public.layout_placements  (user_id, updated_at);
```

---

## What is built, and what is not

**Built.** Sign up, sign in, sign out, session restore across reloads and tabs,
per-user storage scoping, and the sync metadata (`updatedAt` + tombstones) that
multi-device reconciliation depends on. `mergeByUpdatedAt` in `src/core/sync.ts`
is the merge function, with tests.

**Not built: the sync layer itself.** Nothing yet pushes local rows to Supabase
or pulls them back. Signing in on a second device gets you an empty binder, not
your collection.

That is the remaining work, and the shape it should take:

1. **Local stays the read model.** Never make the UI wait on the network — the
   binder is used on trains. Writes go to localStorage first and render
   immediately.
2. **Queue the push.** A write appends to an outbox; a worker drains it. A failed
   push retries, it does not surface as an error in the binder.
3. **Pull on sign-in and on an interval**, merging with `mergeByUpdatedAt`
   keyed on `(gameId, cardId, variantId)`.
4. **Adopt the signed-out binder on first sign-in.** Someone who has been using
   the app locally and then makes an account expects to keep their cards. That
   needs an explicit prompt — "bring your 214 cards with you?" — not a silent
   merge that could double quantities.

The reason none of it is guesswork: the schema above already carries every field
the merge needs.

---

## Why no `@supabase/supabase-js`

The three auth calls the app makes are plain HTTP, and the SDK is roughly 60KB
gzipped against a ~100KB bundle. When the sync layer wants realtime
subscriptions or the Postgres query builder, that is the moment to take the
dependency. See `src/auth/supabaseAuthStore.ts`.
