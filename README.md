# PokéCol

A Pokémon TCG collection app where your cards live in a **physical binder** —
3×3 sleeve pages, a centre spine, and a real page-turn — rather than in a grid.

Search a card → add it → open My Collection → it's sitting in a sleeve.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production build
```

No backend. The Pokémon TCG API sends `access-control-allow-origin: *`, so the
browser talks to it directly.

### API key (optional)

```bash
cp .env.example .env.local   # then fill in VITE_POKEMONTCG_API_KEY
```

Without a key you get **1000 requests/day and 30/minute**; with one, 20,000/day.
Keys are free from [pokemontcg.io](https://pokemontcg.io/). The app works fine
anonymously — it's built around that budget.

## How it's put together

```
src/
  core/         Card, CardSet, CardProvider — the game-agnostic model
  providers/    pokemon/ — the only provider today
  collection/   what you own + how it's stored
  features/     find/ (search) and binder/ (the binder)
  components/   CardImage, CardDetailModal, shared states
  lib/          http, cache, sorting, hooks
```

### Adding another TCG

Write a `CardProvider` (`core/types.ts`) and register it in `core/registry.ts`.
The binder, collection and search UI only ever see the normalised `Card`, so
nothing downstream changes. Game-specific facts (HP, attacks, …) are flattened
into `details: { label, value }[]` by the provider, which is what lets the detail
view stay generic without inventing a cross-game schema.

### Replacing local storage with a real backend

`collection/store.ts` defines `CollectionStore` — four async methods. Implement
it against your API and swap the `collectionStore` export. Nothing else changes;
every method is already async for exactly this reason.

Only `{ gameId, cardId, quantity, addedAt }` is persisted. Card data always
resolves through the provider cache, so the collection can't drift from the API.

## Working against a flaky API

These limits were measured against the live API rather than taken from the docs,
and they shape the code:

| Behaviour | Where it's handled |
|---|---|
| 500s/502s under even light bursts | `lib/http.ts` — retry with backoff; `lib/cache.ts` serves **stale data** rather than erroring |
| 1000 requests/day anonymous | IndexedDB card cache (30-day TTL) — a card is fetched once, ever |
| `pageSize=100` → 502 | capped at 60; the search grid uses 24 |
| `q=id:a OR id:b …` breaks past ~10 ids | collection resolution batches 10 per request |
| a request with no `q` → 502 | an empty search falls back to the newest set |
| `name:char` matches nothing | every token becomes `name:*token*` |

Note that a 5xx from the API arrives as a **CORS failure** in the browser, not a
status code — Cloudflare's error pages don't carry the CORS header — so those
surface as `TypeError: Failed to fetch` and are retried as network errors.

## The binder

One leaf element, hinged at the spine: angle `0` lies flat on the right, `-180`
flat on the left. Forward turns run `0 → -180` and back turns `-180 → 0`, so
both directions share a single code path.

Driven by the Web Animations API rather than CSS transitions, because
`animation.finish()` gives honest cancellation — mash *next* five times and you
advance exactly five pages, with no half-broken state. A watchdog timer commits
the turn if the animation never starts, which is what happens in a backgrounded
or throttled tab where WAAPI animations stay play-pending forever.

Cards inside the leaf are ordinary DOM, so they turn attached to the page and
stay clickable and keyboard-focusable.

**Layout.** Cards sort by set release date, then card number (naturally, so
`2 < 10 < TG01`). Each set starts on a fresh page and its last page keeps its
empty pockets — a half-filled set should look half-filled. Sheets are padded to
an even count so both faces of every leaf carry sleeves.

**Controls.** Page edges, prev/next buttons, and ←/→ keys. Under 760px the
binder shows one page at a time and the flip still works.

Only `images.small` (~160KB) is used in pockets and search results;
`images.large` (~845KB) appears solely in the detail view, behind the small
image blurred as a placeholder.

## Dev helper

In dev builds, filling the binder by hand to test paging is tedious:

```js
__pokecol.seed("base1", 30)   // add the first 30 Base Set cards
__pokecol.clear()             // empty the collection
```

## Known gaps

- One provider (Pokémon); the seam for a second one exists but is unexercised.
- No tests yet — the app was verified by driving it in a browser.
- Collection is per-browser (localStorage), with no accounts or sync.
