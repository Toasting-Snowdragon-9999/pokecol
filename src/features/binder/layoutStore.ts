import { cardKey, DEFAULT_GAME } from "../../core/games";
import { onStorageOwnerChange, scopedKey } from "../../lib/storageScope";
import type { GameId } from "../../core/games";

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

/**
 * Placements are stored per game.
 *
 * Keys already carry the game, so a single flat map would *read* correctly —
 * but a Magic card would then occupy a pocket index in the Pokémon binder's
 * coordinate space, and page 3 slot 2 means something different in each. The
 * partition is what stops one collection's arrangement leaking holes into
 * another's.
 */
const STORAGE_KEY = "cardcol.layout.v2";
/** Pre-CardCol, Pokémon-only layout. Read once to migrate, then left in place. */
const LEGACY_STORAGE_KEY = "pokecol.layout.v1";

export function placementKey(gameId: GameId, cardId: string): string {
  return cardKey(gameId, cardId);
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

interface StoredLayout {
  version: 2;
  byGame: Partial<Record<GameId, PlacementMap>>;
}

function sanitise(raw: unknown): PlacementMap {
  // Drop anything malformed rather than letting one bad row break the layout.
  const placements: PlacementMap = {};
  if (!raw || typeof raw !== "object") return placements;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (isPlacement(value)) placements[key] = value;
  }
  return placements;
}

/**
 * Fold the old Pokémon-only layout into the per-game shape.
 *
 * The legacy key is left where it is: this is a hand-made arrangement, and a
 * one-way rewrite with no way back isn't worth the few bytes it saves.
 */
function migrateLegacy(): StoredLayout | null {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { version?: number; placements?: unknown };
    if (parsed?.version !== 1) return null;

    const migrated: StoredLayout = {
      version: 2,
      byGame: { [DEFAULT_GAME]: sanitise(parsed.placements) },
    };
    writeStored(migrated);
    return migrated;
  } catch {
    return null;
  }
}

function readStored(): StoredLayout {
  try {
    const raw = localStorage.getItem(scopedKey(STORAGE_KEY));
    if (!raw) return migrateLegacy() ?? { version: 2, byGame: {} };

    const parsed = JSON.parse(raw) as StoredLayout;
    if (parsed?.version !== 2 || typeof parsed.byGame !== "object") return { version: 2, byGame: {} };

    const byGame: Partial<Record<GameId, PlacementMap>> = {};
    for (const [game, placements] of Object.entries(parsed.byGame)) {
      byGame[game as GameId] = sanitise(placements);
    }
    return { version: 2, byGame };
  } catch {
    return { version: 2, byGame: {} };
  }
}

export function readLayout(gameId: GameId): CollectionLayout {
  const placements = readStored().byGame[gameId];
  return placements ? { version: 1, placements } : EMPTY;
}

function writeStored(stored: StoredLayout): void {
  try {
    localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(stored));
  } catch {
    /* quota or private mode — in-session state is still correct */
  }
}

function writeLayout(gameId: GameId, layout: CollectionLayout): void {
  const stored = readStored();
  stored.byGame[gameId] = layout.placements;
  writeStored(stored);
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
  read(gameId: GameId): CollectionLayout;
  /**
   * Places `key` at page/slot, evicting whatever sat there into `key`'s old spot.
   *
   * `baseline` is the arrangement as currently rendered. Cards without an
   * explicit placement are flow-positioned, so moving one would otherwise let
   * all the others re-pack around it — dragging a single card would visibly
   * scramble the page. Seeding placements from what the user can actually see
   * freezes that arrangement, after which a move affects exactly two pockets.
   */
  place(
    gameId: GameId,
    key: string,
    page: number,
    slot: number,
    baseline?: ArrangementEntry[],
  ): void;
  /**
   * Reverts the last `place`, restoring both affected pockets exactly.
   *
   * One level, deliberately: a mis-drop wants taking back immediately, and a
   * full history would have to survive reloads and cross-tab writes to mean
   * anything. Doing nothing when there is nothing to undo is not an error.
   */
  undo(): void;
  /** Whether `undo` would do anything. Changes only alongside a notify. */
  canUndo(): boolean;
  /** Drops the pending undo — used when the binder's context changes under it. */
  clearUndo(): void;
  clear(gameId: GameId): void;
  subscribe(listener: () => void): () => void;
}

export function createLayoutStore(): LayoutStore {
  const listeners = new Set<() => void>();
  /** One cached snapshot per game — see `read` on why identity has to be stable. */
  const snapshots = new Map<GameId, CollectionLayout>();

  /*
   * The whole placement map as it stood before the last move.
   *
   * Snapshotting beats computing an inverse. `place` can delete the occupant
   * (when the moved card had no placement of its own) and can seed dozens of
   * entries via the baseline freeze, so "swap the two pockets back" is not
   * actually the inverse of every move. The map is a few hundred tiny objects.
   *
   * In memory only: a reload should not resurrect an undo for a drag the user
   * has long forgotten.
   */
  let undoSlot: { gameId: GameId; placements: PlacementMap } | null = null;

  const invalidate = () => snapshots.clear();
  const notify = () => {
    invalidate();
    listeners.forEach((listener) => listener());
  };
  const read = (gameId: GameId) => {
    let cached = snapshots.get(gameId);
    if (!cached) {
      cached = readLayout(gameId);
      snapshots.set(gameId, cached);
    }
    return cached;
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key?.startsWith(STORAGE_KEY) || event.key === null) {
      // Another tab owns the layout now; replaying our snapshot over the top
      // would silently undo their move as well as ours.
      undoSlot = null;
      notify();
    }
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);

  // A different user means a different arrangement — and a pending undo from
  // the previous one must not survive into it.
  onStorageOwnerChange(() => {
    undoSlot = null;
    notify();
  });

  return {
    read,

    place(gameId, key, page, slot, baseline) {
      const layout = read(gameId);
      // Captured before any mutation, so the baseline freeze is undone too.
      undoSlot = { gameId, placements: layout.placements };
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

      writeLayout(gameId, { version: 1, placements });
      notify();
    },

    undo() {
      if (!undoSlot) return;
      const { gameId, placements } = undoSlot;
      // Consumed: undo is a single step back, never a redo toggle.
      undoSlot = null;
      writeLayout(gameId, { version: 1, placements });
      notify();
    },

    canUndo() {
      return undoSlot !== null;
    },

    clearUndo() {
      undoSlot = null;
    },

    clear(gameId) {
      undoSlot = null;
      writeLayout(gameId, EMPTY);
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
