# Architecture

Everything a new engineer needs to work on CardCol: how it's layered, what each
file does, what the data looks like, and where the non-obvious decisions are.

Read the **Data flow** section first — the rest is reference.

---

## 1. The shape of it

A client-only React SPA. No server, no database, no build-time data. Six card
games, each behind its own adapter, all speaking one normalised model.

```
   ┌─────────────┐  HTTP    ┌────────────────────────────────┐
   │   Browser   │─────────▶│ pokemontcg.io · Scryfall ·      │
   └─────────────┘          │ YGOPRODeck · Lorcast · apitcg   │
         │                  └────────────────────────────────┘
         ├── IndexedDB  →  cached cards, sets, searches (per game)
         └── localStorage → what you own, want, and how you arranged it
```

Four layers, each depending only on the one above it:

| Layer | Directory | Knows about |
|---|---|---|
| **Model** | `src/core/` | nothing — pure types |
| **Provider** | `src/providers/` | one TCG's API, and the model |
| **State** | `src/collection/`, `src/wishlist/`, `src/game/` | the model + storage |
| **UI** | `src/features/`, `src/components/` | all of the above |
| *(support)* | `src/lib/` | nothing app-specific |

The rule that keeps this honest: **nothing above the provider layer knows what a
"Pokémon" is.** The binder, the collection and the search UI only ever see a
normalised `Card`. Adding another TCG means writing one more provider, not
touching the UI.

Where games genuinely differ, the UI reads a **capability flag**
(`provider.capabilities`) rather than checking which game is active. There is no
`if (gameId === "pokemon")` anywhere above `src/providers/`, and adding one is
the wrong fix for anything.

### Card identity

Card ids are only unique *within* a game — `"1"` is a real card in three of
these. Everything that stores or caches a card qualifies it:
`cardKey(gameId, cardId)` → `"pokemon:base1-4"`. Collection entries, wishlist
entries, binder placements and cache keys all carry the game.

---

## 2. Data flow

### Searching

```
FindCardsPage
  │  query (debounced 350ms), setId
  ▼
useCardSearch ──────────────► getProvider().searchCards({query, setId, page, pageSize, signal})
  │  Paged<Card>                  │
  │                               ▼
  │                          pokemonProvider  (providers/pokemon/index.ts)
  │                               │  builds a Lucene-ish `q`, falls back to
  │                               │  newest set when the query is empty
  │                               ▼
  │                          api.searchCards()  (providers/pokemon/api.ts)
  │                               │
  │                               ├─ cached()  ── hit ─────────────► return
  │                               │      miss
  │                               ▼
  │                          fetchJson()  (lib/http.ts) — retries, timeout
  │                               │
  │                               ▼
  │                          normaliseCard()  PokemonApiCard → Card
  │                               │
  │                               └─ writes each Card to the card cache
  ▼
ResultCard × 24
```

The last step matters: **searching warms the per-card cache.** By the time you
add a card and open the binder, resolving it costs zero requests.

### Owning

```
QuantityStepper ──► useCollection().setQuantity(cardId, n)
                          │
                          ▼
                   collectionStore.setQuantity(gameId, cardId, n)   (collection/store.ts)
                          │  writes localStorage, notifies listeners
                          ▼
                   CollectionProvider re-reads → context updates → every consumer re-renders
```

### Rendering the binder

```
BinderPage
  │
  ├── useCollectionCards() ──► getProvider().getCardsByIds(ids)
  │        │                        │  cache first; only unknown ids are fetched,
  │        │                        │  batched 10 per request
  │        ▼                        ▼
  │      Card[] sorted by compareCardsForBinder (set date, then card number)
  │
  ├── useBinderPages(cards, quantityOf, singlePage)
  │        │  group by set → chunk into 9s → pad → pair into spreads
  │        ▼
  │      BinderSpread[]
  ▼
Binder ──► usePageFlip(spreads.length) ──► { spread, flip, leafRef, goNext, goPrev }
  │
  ├── BinderSheet (left)   ─┐
  ├── BinderSheet (right)   ├─ each renders 9 × Pocket
  └── leaf → 2 × BinderSheet ┘
```

---

## 3. The model — `src/core/`

### `types.ts`

The whole internal vocabulary. Deliberately small.

```ts
type GameId = "pokemon";                    // widen this to add a TCG

interface CardSet {
  id, gameId, name
  series?, printedTotal?, total?
  releaseDate?     // ISO 'YYYY-MM-DD' — plain string compare is chronological
  symbolUrl?, logoUrl?
}

interface Card {
  id            // provider-native, e.g. 'base1-4'. Unique within a game.
  gameId
  name
  number        // printed collector number: '4', 'TG12', 'SV49'
  rarity?, artist?, subtitle?, types?
  set: CardSet  // embedded, not a reference — a Card is self-sufficient
  images: { small, large }
  details?: { label, value }[]
}
```

**Why `details` is a bag of label/value pairs.** HP, attacks, weaknesses and
retreat cost are Pokémon-specific. Putting them on `Card` would make the model
Pokémon-shaped; inventing a cross-TCG schema for "attacks" would be
over-engineering. Instead the provider flattens them into strings, and
`CardDetailModal` renders whatever it's handed without knowing what any of it
means. A Magic provider would emit mana cost and type line the same way.

**Why `set` is embedded.** Every card carries its full set. Slightly redundant,
but it means a `Card` renders with no lookups and no join — the binder groups by
`card.set.id` directly.

```ts
interface CardProvider {
  id: GameId;
  label: string;
  searchCards(params: CardSearchParams): Promise<Paged<Card>>;
  listSets(signal?): Promise<CardSet[]>;
  getCardsByIds(ids: string[], signal?): Promise<Card[]>;   // batches internally
}
```

`getCardsByIds` batching is the provider's problem, not the caller's — batch
limits are an API quirk and shouldn't leak upward.

### `registry.ts`

```ts
const providers: Record<GameId, CardProvider> = { pokemon: pokemonProvider };
export function getProvider(gameId = DEFAULT_GAME): CardProvider
```

That's the entire abstraction. One map, one lookup. Resist growing it.

---

## 4. The providers — `src/providers/`

Every adapter has the same three or four files: `types.ts` (raw response shapes,
only the fields we read), `normalize.ts` (raw → `Card`, the only place raw
shapes are understood), and `index.ts` (assembles the `CardProvider`). Pokémon
additionally splits out `api.ts` and `variants.ts`.

`src/providers/shared/throttle.ts` holds request spacing, declared per adapter
because the limits and the punishments differ enormously.

### The six, and what each costs

| Game | Source | Key | Prices | Variants | Set rosters |
|---|---|---|---|---|---|
| Pokémon | pokemontcg.io v2 | optional | ✅ TCGplayer | from price keys | ✅ |
| Magic | Scryfall | none | ✅ USD/foil/etched | ✅ real `finishes` | ✅ |
| Yu-Gi-Oh! | YGOPRODeck v7 | none | ⚠️ per card, not per printing | per-printing rarity | ❌ |
| Disney Lorcana | Lorcast v0 | none | ✅ normal + foil | normal/foil | ✅ |
| Star Wars: Unlimited | apitcg.com | **required** | ✅ TCGplayer | ❌ | ❌ |
| One Piece | apitcg.com | **required** | ✅ TCGplayer | ❌ | ❌ |

All five hosts were verified to send `access-control-allow-origin: *`.

### Known limitations — read before "fixing" any of these

- **Yu-Gi-Oh! images are hotlinked against YGOPRODeck's stated terms.** They ask
  callers to re-host and say repeat hotlinking earns an IP blacklist. CardCol
  loads art from provider CDNs by design, so this game is knowingly
  non-compliant. **An image proxy is required before any public deployment.**
- **Yu-Gi-Oh! has no per-card set.** A popular card has a dozen printings, so
  the earliest is treated as its binder home and the rest become a detail row.
  `setRosters` is false: there is no roster to complete.
- **Star Wars and One Piece are inert without `VITE_APITCG_API_KEY`.** Both set
  `unavailableReason`, which the UI renders as an explanation rather than an
  error or an endless spinner.
- **swu-db.com was rejected for Star Wars** despite better data (per-variant
  types, market prices): it sends no CORS header, so a browser cannot call it.
  Using it would mean running a proxy, which costs the app its "no backend"
  property.
- **Scryfall and Lorcast 404 on an empty result set.** Both adapters translate
  that to an empty page; without it every fruitless search looks like an outage.
- **Yu-Gi-Oh! paging has no total.** "There is more" is inferred from a full
  page, which costs one trailing empty page rather than a second count request.

### Measured API limits (`api.ts`)

These were found by probing the live API, not read from docs. **They are the
reason several constants look arbitrary — don't "clean them up".**

```ts
MAX_PAGE_SIZE       = 60   // pageSize=100 → 502
ID_BATCH_SIZE       = 10   // q=id:a OR id:b … breaks at 15+ → 500
ID_BATCH_CONCURRENCY = 2   // anonymous cap is 30 req/min
```

Also:
- **Every request must carry a `q`.** An unfiltered query 502s regardless of page
  size. `index.ts` falls back to the newest set when the user hasn't typed
  anything.
- **`GET /cards/{id}` is unreliable.** Always resolve via `/cards?q=id:…`.
- **`name:char` matches nothing** — the API matches whole words. Every token
  becomes `name:*token*`, and multiple tokens AND together, so `blaine char`
  finds Blaine's Charizard.
- **Only `:` and `"` need escaping.** Apostrophes, hyphens and periods pass
  through fine, which matters for Farfetch'd, Ho-Oh and Mr. Mime.
- No `select=` param is used. A full card is ~2KB; fetching everything once beats
  a second request when the detail modal opens.

### Image sizes

`images.small` ≈ 160KB (245×342), `images.large` ≈ 845KB (745×1040). Small is
used in pockets and search results; large **only** in the detail modal, one at a
time. Nine large images on a spread would be 7.6MB.

Art is served from two CDNs — `images.pokemontcg.io` for older sets,
`images.scrydex.com` for recent ones. Both are preconnected in `index.html`.

---

## 5. State — `src/collection/`

### `store.ts` — the swap point

```ts
interface CollectionEntry { gameId; cardId; quantity; addedAt }

interface CollectionStore {
  list(): Promise<CollectionEntry[]>
  setQuantity(gameId, cardId, quantity): Promise<void>   // <=0 removes
  clear(): Promise<void>
  subscribe(listener): () => void
}
```

**Every method is async even though localStorage isn't.** That's deliberate —
it's what makes an HTTP-backed store a drop-in replacement rather than a
refactor.

Only `{gameId, cardId, quantity, addedAt}` is persisted, under
`pokecol.collection.v1`. Card data is never duplicated here, so the collection
can't drift out of sync with the API.

`collectionStore` at the bottom of the file is a **shared singleton, and must
stay one**: the `storage` event doesn't fire in the tab that wrote it, so two
instances in one tab would never see each other's writes. (This was a real bug —
the dev seed helper had its own instance and silently didn't update the UI.)

**To add a backend:** implement `CollectionStore` against your API, swap the
`collectionStore` export. Nothing else changes.

### `context.ts` / `CollectionProvider.tsx`

Split in two so the module exporting the provider component exports *only* a
component — otherwise React Fast Refresh can't hot-update it.

`context.ts` holds `CollectionContext`, `CollectionContextValue` and the
`useCollection()` hook. **Import `useCollection` from `./context`,** not from
the provider.

The context exposes `quantityOf`, `isOwned`, `add`, `remove`, `setQuantity`,
`clear`, `uniqueCards`, `totalCards`. Lookups go through a `Map` keyed
`${gameId}:${cardId}`, rebuilt on entry change.

### `useCollectionCards.ts`

Entries → resolved, sorted `Card[]`.

Keyed on the **sorted set of ids joined into a string**, not the entries array —
so bumping a quantity re-renders without refetching.

---

## 6. Support — `src/lib/`

### `http.ts`

`fetchJson(url, {signal, headers, retries, timeoutMs})`.

Retries 408/425/429/500/502/503/504 and network errors at 400/900/2000ms plus
jitter, honours `Retry-After`, 15s per-attempt timeout via `AbortSignal.any`.
Throws `ApiError { status, retriable }`. `describeError()` turns anything into a
human sentence for the UI.

**A caller's abort is never retried** — a superseded search should die, not
retry.

> **The one thing to know here:** an API 5xx arrives in the browser as
> `TypeError: Failed to fetch`, not a status code, because Cloudflare's error
> pages don't carry the CORS header — the browser blocks the response before
> your code sees it. So genuine server errors land in the *network error* branch
> with `status: 0`. Don't be fooled while debugging.

### `cache.ts`

In-memory `Map` in front of IndexedDB (`idb-keyval`).

```
cards:*   30 days   (printed cards never change)
sets:*     7 days
search:*   1 hour
```

`cached(key, ttl, loader)` is read-through **with stale-on-failure**: if the
loader rejects but an expired entry exists, the expired entry wins. Given how
often the API 500s, that's the difference between a working page and an error
screen. Aborts always propagate.

Degrades to memory-only if IndexedDB is unavailable (private browsing).

### Others

- `sortCards.ts` — `naturalCompare` (so `2 < 10 < 100`, `TG01 < TG10`),
  `compareSetsByRelease`, `compareCardsForBinder`.
- `useDebounced.ts` — 350ms trailing debounce. Every keystroke that reaches the
  API costs part of a 1000/day budget.
- `useMediaQuery.ts` — `useSyncExternalStore` over `matchMedia`; also
  `usePrefersReducedMotion`. The binder needs this as *reactive state*, not just
  a CSS breakpoint, because it changes how sheets are paginated.
- `devSeed.ts` — `window.__pokecol.seed/clear`. Dev only, dynamically imported
  behind `import.meta.env.DEV` so it's tree-shaken from production.

---

## 7. The binder — `src/features/binder/`

The most intricate part. Read `usePageFlip.ts` and `Binder.tsx` together.

### `useBinderPages.ts` — layout

```
Card[] (already sorted)
  → group by consecutive set
  → chunk each set into 9s              POCKETS_PER_SHEET = 9
  → pad the set's last sheet with nulls
  → BinderSheetData[]
  → pair into BinderSpread { left, right }
```

Two rules that look like details but are the whole nostalgic point:

1. **A set never bleeds across a page break.** Each set starts a fresh sheet, so
   leftover pockets read as "still filling this set".
2. **Sheets pad to an even count.** A physical leaf has pockets on *both* faces;
   an odd count would leave the last leaf with a bare back. The pad sheet has
   `set: null` and an optional `note`.

`BinderSheetData.set` is `CardSet | null` — always handle the null case.

In single-page mode each sheet is its own spread (`right` always `null`).

### `usePageFlip.ts` — the turn

**One leaf, one geometry.** The leaf always lives on the right half, hinged at
the spine. Angle `0` = flat on the right, `-180` = flat on the left. Forward
turns run `0 → -180`, back turns `-180 → 0`. Both directions share one code path.

```ts
interface ActiveFlip {
  lowIndex, highIndex   // the spreads either side of the leaf
  target                // spread committed when it lands
  from, to              // 0 → -180, or -180 → 0
}
```

`Binder.tsx` derives the four visible faces from `low`/`high` without caring
about direction:

| | two-page | what it is |
|---|---|---|
| static left | `spreads[low].left` | covered by the leaf's back past 90° |
| static right | `spreads[high].right` | revealed as the leaf swings away |
| leaf front | `spreads[low].right` | the page you're turning |
| leaf back | `spreads[high].left` | the page you're turning onto |

**Refs shadow the state.** `spreadRef`, `flipRef` and `animationRef` exist
because a rapid second click must read the *settled* page synchronously —
React hasn't committed the first one yet. `settle()` lands any in-flight turn
immediately, which is why mashing *next* five times advances exactly five pages
instead of desynchronising.

Driven by the **Web Animations API**, not CSS transitions, because
`animation.finish()` / `.cancel()` gives real cancellation instead of racing
`transitionend`.

**Two guards you must not remove:**

- `document.hidden` → commit instantly without animating.
- `FLIP_WATCHDOG_MS` (duration + 260ms) → a timer that lands the turn if the
  animation never fires `onfinish`.

Both exist for the same reason: **a backgrounded or throttled tab doesn't paint,
and a Web Animation started in that state stays play-pending forever** —
`startTime` is never set, `onfinish` never fires. Without the watchdog the leaf
freezes mid-turn and the binder stops responding. (This is also why you can't
verify the animation in a headless/background tab: `requestAnimationFrame` never
fires there.)

Reduced motion → duration 0, instant commit.

### Components

| File | Notes |
|---|---|
| `Binder.tsx` | Assembles spread + leaf + spine + edges + controls. Derives face contents. Keyboard: ← / →. |
| `BinderSheet.tsx` | One page: set header + 3×3 of `Pocket`. Handles `set: null`. Memoised. |
| `Pocket.tsx` | One sleeve. Empty pockets keep the full treatment minus the card. Images are **eager** — only the current spread is mounted, so every pocket is genuinely visible. |
| `BinderPage.tsx` | Route. Owns `--sheet-w` sizing and the single-page media query. |

### Sizing

One variable drives the whole binder: `--sheet-w` in `BinderPage.module.css`.
A sheet is ~1.44× its own width once the 3×3 of 63:88 cards, the header and the
padding are counted, so the height term is derived, not guessed:

```css
--sheet-w: clamp(220px, min(45vw, (100vh - 190px) / 1.44), 540px);
```

`190px` ≈ app header + controls + stage padding. Everything else in
`binder.module.css` is expressed as a multiple of `--sheet-w`, so the binder
scales as one object.

---

## 8. Find Cards — `src/features/find/`

| File | Notes |
|---|---|
| `FindCardsPage.tsx` | Composes search, set filter, grid, infinite scroll, modal. |
| `useCardSearch.ts` | Paged search that **appends**. Aborts in-flight on query change. |
| `useSets.ts` | All 174 sets in one cached request, grouped by series. |
| `ResultCard.tsx` | One result. Memoised — a collection change re-renders the grid. |

`useCardSearch` guards `loadMore` with `busyRef`/`hasMoreRef` **refs, not
state**: the IntersectionObserver can fire several times before React commits,
and each duplicate would cost a real request.

`PAGE_SIZE = 24` — comfortably under the API's 60 ceiling and keeps a page of
artwork light.

---

## 9. Shared components — `src/components/`

`CardImage.tsx` carries the single nastiest bug fix in the codebase:

> A cached image can finish loading **before React attaches `onLoad`**, so the
> event never fires and the skeleton stays up forever. Every returning visitor's
> binder rendered as blank dark sleeves. The fix is a `useLayoutEffect` that
> reconciles against `img.complete` / `naturalWidth` on mount and on `src`
> change. `CardDetailModal` has the same fix for its hi-res image.

Keep that in mind for any new `<img>` with load-driven state.

`CardDetailModal.tsx` uses a native `<dialog>` + `showModal()` for a free focus
trap, Esc handling and inert background. It holds no state beyond image loading,
so opening it from the binder never disturbs the page you're on. Note the
explicit `margin: auto` — the global `* { margin: 0 }` reset kills the UA rule
that centres a modal dialog.

---

## 10. Styling

CSS Modules (`*.module.css`) plus custom properties in `src/styles/tokens.css`.
No utility framework — the binder is layered gradients, inset shadows,
`preserve-3d` and blend modes, which read far better as real CSS.

The app chrome is deliberately quiet so the binder is the only thing asking for
attention. Anything with warmth lives under `--binder-*`.

Two gotchas already paid for:

- The cover's grain overlay uses `mix-blend-mode: soft-light`. `overlay` at any
  useful strength washes the navy leather out to pale grey.
- The sleeve sheen is a **narrow** diagonal streak. Widen it and it stops reading
  as a highlight and just fogs the artwork.

---

## 11. Conventions

- TypeScript is configured with `verbatimModuleSyntax` (use `import type`),
  `erasableSyntaxOnly` (no enums, no parameter properties), and
  `noUnusedLocals`/`noUnusedParameters`. `npm run build` typechecks.
- `unknown` for caught errors — render them via `describeError()`. Note
  `{unknownValue && <X/>}` doesn't typecheck as a `ReactNode`; use `Boolean(...)`.
- Every async data path takes an `AbortSignal` and is cancelled on unmount or
  input change.
- Comments explain *why*, especially where a constant encodes a measured API
  limit or a browser quirk. Those are the ones that look wrong and get
  "fixed" — the comment is load-bearing.

## 12. Known gaps

- **Test coverage is partial.** `npm test` covers the cache's single-flight and
  abort behaviour, `layoutStore` (swap, baseline freeze, undo, partitioning),
  the binder layout functions, and every provider's normaliser against captured
  live responses. Components and hooks are still verified by driving the app.
- **Provider fixtures go stale.** `src/providers/__fixtures__/*.json` were
  captured from the live APIs; refresh them by re-fetching the same card if a
  normaliser test starts failing for no local reason. That failure *is* the
  early warning — these are free services that reshape payloads without notice.
- No virtualisation: resolving a very large collection is many sequential-ish
  batched requests on first load (cached forever after).
- Undo is one level and in-memory: a reload drops it, deliberately.
- Yu-Gi-Oh! prices are per card rather than per printing, so a Secret Rare and
  a Common of the same card value identically. Flagged `kind: "mid"` rather
  than `"market"` to be honest about it.
- Collection value has no history — it is the current estimate only.
