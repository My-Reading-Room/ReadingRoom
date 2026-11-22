// Virtual bookshelf rules, ported from legacy renderShelf()/shelfBook()/reorderBooks().

export type ShelfBook = {
  id: string;
  title: string;
  status: string;
  favorite: boolean;
  shelf_order: number | null;
  page_count: number | null;
  height_mm?: number | null;
  thickness_mm?: number | null;
};

export const BOOKS_PER_PAGE = 9;
export const SHELF_FINISHES = ["walnut", "oak", "slate"] as const;
export const SHELF_DISPLAY_MODES = ["mix", "covers", "spines"] as const;
export const SHELF_DECOR = ["cozy", "plant", "minimal"] as const;
export type ShelfPrefs = { finish: string; display_mode: string; decor: string };
export const DEFAULT_SHELF_PREFS: ShelfPrefs = {
  finish: "walnut",
  display_mode: "mix",
  decor: "cozy",
};

const rank = (b: ShelfBook) => (b.favorite ? 0 : b.status === "reading" ? 1 : 2);

/** Favorites first, then Currently reading, then everything by saved shelf order. */
export function shelfDisplayOrder<B extends ShelfBook>(books: B[]): B[] {
  return [...books].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.shelf_order || 0) - (b.shelf_order || 0) ||
      a.title.localeCompare(b.title),
  );
}

/**
 * Approximate *visual* size in px: from edition measurements when known,
 * otherwise from the page count. Purely decorative; never used as data.
 */
export function shelfBookSize(book: ShelfBook) {
  const pages = Number(book.page_count) || 0;
  const thickness = Math.max(
    9,
    Math.min(33, Math.round(book.thickness_mm ? Number(book.thickness_mm) * 0.62 : 9 + pages / 75)),
  );
  const height = Math.max(
    104,
    Math.min(
      158,
      Math.round(book.height_mm ? Number(book.height_mm) * 0.62 : 102 + Math.min(46, pages / 23)),
    ),
  );
  return { thickness, height };
}

/** Covers, spines, or every fourth book as a spine ("mix"). */
export const showsSpine = (mode: string, index: number) =>
  mode === "mix" ? index % 4 === 2 : mode === "spines";

/**
 * Move one book to another's position in the saved shelf order and return
 * only the rows whose position changes (1-based, contiguous).
 */
export function planShelfMove(
  books: ShelfBook[],
  fromId: string,
  toId: string,
): { id: string; shelf_order: number }[] {
  if (fromId === toId) return [];
  const list = [...books].sort((a, b) => (a.shelf_order || 0) - (b.shelf_order || 0));
  const from = list.findIndex((b) => b.id === fromId),
    to = list.findIndex((b) => b.id === toId);
  if (from < 0 || to < 0) return [];
  const [item] = list.splice(from, 1);
  list.splice(to, 0, item);
  return list.flatMap((b, i) =>
    b.shelf_order === i + 1 ? [] : [{ id: b.id, shelf_order: i + 1 }],
  );
}

/** The neighbour to swap with for Move left / Move right, by saved order. */
export function shelfNeighbour(books: ShelfBook[], id: string, direction: -1 | 1): string | null {
  const list = [...books].sort((a, b) => (a.shelf_order || 0) - (b.shelf_order || 0));
  const i = list.findIndex((b) => b.id === id);
  const j = i + direction;
  return i < 0 || j < 0 || j >= list.length ? null : list[j].id;
}
