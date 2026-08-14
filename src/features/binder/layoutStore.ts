import type { GameId } from "../../core/types";

/**
 * Where a card has been deliberately placed in the custom binder.
 *
 * Keyed by card, never by array index. Indexes shift whenever the collection
 * changes or the API revises a set, which would silently scramble a hand-made
 * arrangement — the one thing manual placement must never do.
 */
export interface Placement {
  page: number;
  slot: number;
}

export type PlacementMap = Record<string, Placement>;

export interface CollectionLayout {
  version: 1;
  placements: PlacementMap;
}

const STORAGE_KEY = "pokecol.layout.v1";

export function placementKey(gameId: GameId, cardId: string): string {
  return `${gameId}:${cardId}`;
}

const EMPTY: CollectionLayout = { version: 1, placements: {} };

function isPlacement(value: unknown): value is Placement {
  const candidate = value as Placement | null;
  return (
    !!candidate &&
    Number.isInteger(candidate.page) &&
    Number.isInteger(candidate.slot) &&
    candidate.page >= 0 &&
    candidate.slot >= 0
  );
}

export function readLayout(): CollectionLayout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;

    const parsed = JSON.parse(raw) as CollectionLayout;
    if (parsed?.version !== 1 || typeof parsed.placements !== "object") return EMPTY;

    // Drop anything malformed rather than letting one bad row break the layout.
    const placements: PlacementMap = {};
    for (const [key, value] of Object.entries(parsed.placements)) {
      if (isPlacement(value)) placements[key] = value;
    }
    return { version: 1, placements };
  } catch {
    return EMPTY;
  }
}

function writeLayout(layout: CollectionLayout): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    /* quota or private mode — in-session state is still correct */
  }
}

/** Where every card currently sits, as rendered. */
export interface ArrangementEntry {
  key: string;
  page: number;
  slot: number;
}

export interface LayoutStore {
  /**
   * Cached snapshot, stable between writes.
   *
   * `useSyncExternalStore` compares snapshots by identity, so returning a
   * freshly parsed object each call would report a change on every render and
   * loop forever. The cache is invalidated on write and on cross-tab changes.
   */
  read(): CollectionLayout;
  /**
   * Places `key` at page/slot, evicting whatever sat there into `key`'s old spot.
   *
   * `baseline` is the arrangement as currently rendered. Cards without an
   * explicit placement are flow-positioned, so moving one would otherwise let
   * all the others re-pack around it — dragging a single card would visibly
   * scramble the page. Seeding placements from what the user can actually see
   * freezes that arrangement, after which a move affects exactly two pockets.
   */
  place(key: string, page: number, slot: number, baseline?: ArrangementEntry[]): void;
  clear(): void;
  subscribe(listener: () => void): () => void;
}

export function createLayoutStore(): LayoutStore {
  const listeners = new Set<() => void>();
  let snapshot: CollectionLayout | null = null;

  const invalidate = () => {
    snapshot = null;
  };
  const notify = () => {
    invalidate();
    listeners.forEach((listener) => listener());
  };
  const read = () => (snapshot ??= readLayout());

  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) notify();
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);

  return {
    read,

    place(key, page, slot, baseline) {
      const layout = read();
      const placements = { ...layout.placements };

      // Freeze the visible arrangement before the first move, so flow-positioned
      // cards keep the pockets the user can see rather than re-packing.
      if (baseline) {
        for (const entry of baseline) {
          if (!placements[entry.key]) placements[entry.key] = { page: entry.page, slot: entry.slot };
        }
      }

      const from = placements[key];

      /*
       * Swap rather than displace. Whatever already occupies the target takes
       * the dragged card's old pocket, so a move is always reversible and a
       * card can never be pushed out of the binder entirely.
       */
      const occupantKey = Object.keys(placements).find(
        (other) =>
          other !== key && placements[other].page === page && placements[other].slot === slot,
      );

      placements[key] = { page, slot };
      if (occupantKey) {
        if (from) placements[occupantKey] = from;
        else delete placements[occupantKey];
      }

      writeLayout({ version: 1, placements });
      notify();
    },

    clear() {
      writeLayout(EMPTY);
      notify();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Shared singleton, for the same reason the collection store is one. */
export const layoutStore: LayoutStore = createLayoutStore();
