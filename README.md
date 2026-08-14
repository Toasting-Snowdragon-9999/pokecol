# PokéCol

A Pokémon TCG collection app where your cards live in a **physical binder** —
3×3 sleeve pages, a centre spine, and a real page-turn — instead of a
responsive grid.

Search a card → add it → open My Collection → it's sitting in a sleeve.

![The binder, open on two facing pages of Base Set cards](docs/images/binder.jpg)

---

## What it does

### My Collection — the binder

Your collection is an actual binder. Nine sleeves a page, two facing pages, a
stitched cover and metal rings down the spine. Cards sit *inside* translucent
sleeves with a diagonal sheen and a shadow separating them from the page.

Turning a page is a real 3D turn hinged at the spine — the leaf rotates, the
cards stay attached to it, and the next page appears underneath.

![A page caught mid-turn, cards foreshortening with the page](docs/images/page-flip.jpg)

Cards are laid out the way a collector would fill a binder:

- ordered by **set release date**, then card number (naturally, so `2 < 10 < TG01`)
- **every set starts on a fresh page** — a set never bleeds across a page break
- a part-finished set keeps its empty pockets, so a gap looks like a gap
- duplicates show a `×N` tag in the sleeve corner

Navigate with the page edges, the prev/next buttons, or the ← / → keys. Under
760px wide the binder shows one page at a time and the turn still works.

### Find Cards

Search the full catalogue by name and slot cards straight into the binder.
Cards you own are marked and their button becomes a quantity stepper, so
ownership is obvious while you scan.

![The card browser showing Charizard search results](docs/images/find-cards.jpg)

- name search, forgiving about partial words and multiple terms (`blaine char` works)
- filter by set (all 174, grouped by series)
- name, set, number, rarity and set symbol on every result
- infinite scroll, 24 cards a page — the catalogue is never loaded at once

### Card detail

Click any card — in the binder or in search — for the full-resolution artwork
and its details. Opening it from the binder doesn't lose your page.

![The card detail view with full-resolution artwork](docs/images/card-detail.jpg)

The high-res image loads behind the small one blurred, so the panel is never
blank while ~845KB decodes.

### Also in there

- collection persists locally and syncs across browser tabs
- loading skeletons, retry-on-error, and a card-back fallback for missing art
- keyboard navigable; respects `prefers-reduced-motion`

---

## Running it

Requires **Node 20+** (developed on Node 25). No backend, no database, no
API key needed.

```bash
git clone <this-repo>
cd pokecol
npm install
npm run dev
```

Open **http://localhost:5173**. It opens on an empty binder — go to **Find
Cards**, search something, and add it.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | dev server with hot reload on :5173 |
| `npm run build` | typecheck (`tsc -b`) then production build to `dist/` |
| `npm run preview` | serve the built `dist/` locally |
| `npm run lint` | oxlint |

### API key (optional)

The app talks to [pokemontcg.io](https://pokemontcg.io/) directly from the
browser — the API sends `access-control-allow-origin: *`, so no proxy is needed.

Anonymous access is capped at **1000 requests/day and 30/minute**. The app is
built around that budget (cards are cached in IndexedDB and fetched once ever),
so you can run it with no key at all. If you do hit the ceiling:

```bash
cp .env.example .env.local
# then set VITE_POKEMONTCG_API_KEY=your-key   → 20,000/day
```

Keys are free. Restart the dev server after adding one.

### Filling the binder quickly

Adding thirty cards by hand to test paging is tedious, so dev builds expose:

```js
__pokecol.seed("base1", 30)   // first 30 Base Set cards
__pokecol.seed("base2", 14)   // and some Jungle
__pokecol.clear()             // empty it again
```

Run these in the browser console. They're stripped from production builds.

### Heads-up: the API is flaky

The Pokémon TCG API returns 500s and 502s under even light bursts, well inside
its rate limit. The client retries with backoff and serves cached data when a
request fails, so this is mostly invisible — but if search feels slow for a few
seconds, that's usually why, not your machine.

One quirk worth knowing while debugging: an API 5xx arrives in the browser as
`TypeError: Failed to fetch`, **not** a status code. Cloudflare's error pages
don't carry the CORS header, so the browser blocks the response before your code
sees it.

---

## What could be next

Rough order of value:

- [ ] **Tests.** There are none. `useBinderPages` (sheet chunking, set
      boundaries), `naturalCompare`, and the `buildQuery` escaping are pure
      functions and the obvious first targets; the flip controller needs
      component tests around cancellation.
- [ ] **Accounts and sync.** `CollectionStore` was built for this — implement
      the interface against an API and swap one export. See ARCHITECTURE.md.
- [ ] **Sort and group options.** Currently fixed to set-then-number. Recently
      added, by rarity, or by Pokédex number are all natural.
- [ ] **Drag to reorder / place cards** in specific pockets, like a real binder.
- [ ] **Set completion progress** — "84/102 collected" per set, and a way to see
      which numbers are missing.
- [ ] **Drag or swipe to turn pages**, following the pointer rather than
      committing on click.
- [ ] **A second TCG.** The provider seam exists but has only ever had one
      implementation, so it's unproven.
- [ ] **Variants** — holo vs reverse holo vs 1st edition are different things to
      a collector but one `cardId` here.
- [ ] **Virtualise long binders.** Only the current spread renders, so it's fine
      today, but resolving a 500-card collection is 50 sequential-ish requests
      on first load.
- [ ] Deploy it — it's a static bundle, so any host works.

---

## Tech

Vite 8 · React 19 · TypeScript 6 · React Router 8 · CSS Modules · idb-keyval.
No UI kit, no animation library, no page-flip library — the binder is
hand-rolled CSS 3D driven by the Web Animations API.

See **[ARCHITECTURE.md](ARCHITECTURE.md)** for how it's all wired together.

## Notes

Card data and imagery come from the [Pokémon TCG API](https://pokemontcg.io/).
Pokémon and all card artwork are © Nintendo / Creatures Inc. / GAME FREAK inc.
This is an unofficial fan project, not affiliated with or endorsed by them. No
artwork is stored in this repository — the app loads images from the API's CDN
at runtime (screenshots above excepted).
