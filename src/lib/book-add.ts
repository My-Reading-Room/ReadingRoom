// "Add book" rules for catalog and manual adds, ported from legacy app.js
// addSelectedBook() and the manual-book-form handler so they run on the server.
import {
  coverURL,
  isValidASIN,
  isValidISBN,
  manualGenres,
  normalizeASIN,
  normalizeISBN,
} from "./book-detail-metadata";
import { toLibraryBook, type CatalogBook } from "./catalog";
import { sameBook } from "./goodreads-import";
import type { BookInput, BookStatus, IsoDate } from "./types";

const STATUSES: BookStatus[] = ["tbr", "reading", "finished", "dnf"];

export type NewBook = Omit<
  ReturnType<typeof toLibraryBook>,
  "status" | "started_on" | "finished_on" | "published_year"
> & {
  status: BookStatus;
  started_on: IsoDate | null;
  finished_on: IsoDate | null;
  published_year: number | null;
  asin?: string | null;
  tbr_added_on: IsoDate | null;
};

export type AddResult = { ok: true; book: NewBook } | { ok: false; error: string };

type Context = { userId: string; today: IsoDate; existing: BookInput[]; order: number };

/** Shelf dates the way legacy set them on add. */
function shelve(book: NewBook, status: string, today: IsoDate): string | null {
  if (!STATUSES.includes(status as BookStatus)) return "Choose a valid shelf.";
  book.status = status as BookStatus;
  book.tbr_added_on = status === "tbr" ? today : null;
  if (status === "finished") book.finished_on = today;
  if (status === "reading") book.started_on = today;
  return null;
}

/** Add a chosen catalog edition (or work) with an initial shelf and optional page count. */
export function newCatalogBook(
  edition: Partial<CatalogBook> & { title: string },
  { status, pages }: { status: string; pages: string },
  { userId, today, existing, order }: Context,
): AddResult {
  const book = toLibraryBook(edition, userId, order) as NewBook;
  if (pages) {
    const n = Number(pages);
    if (!Number.isInteger(n) || n < 1 || n > 100_000)
      return { ok: false, error: "Page count must be a positive whole number." };
    book.page_count = n;
  }
  if (book.isbn && !isValidISBN(book.isbn)) book.isbn = null; // never store an invalid catalog ISBN
  if (book.cover_url) {
    try {
      book.cover_url = coverURL(book.cover_url);
    } catch {
      book.cover_url = null;
    }
  }
  const shelfError = shelve(book, status, today);
  if (shelfError) return { ok: false, error: shelfError };
  if (existing.some((b) => sameBook(b, book)))
    return { ok: false, error: "This book appears to be in your library already." };
  return { ok: true, book };
}

export type ManualBookInput = {
  title: string;
  author: string;
  pages: string;
  isbn: string;
  asin: string;
  genres: string;
  coverUrl: string;
  year: string;
  status: string;
};

/** Add a book by hand (legacy manual-book-form rules plus length bounds). */
export function newManualBook(
  input: ManualBookInput,
  { userId, today, existing, order }: Context,
): AddResult {
  const fail = (error: string): AddResult => ({ ok: false, error });
  const title = input.title.trim(),
    author = input.author.trim();
  const pages = input.pages.trim() ? Number(input.pages) : null;
  const isbn = normalizeISBN(input.isbn);
  const asin = normalizeASIN(input.asin);
  let imageURL: string | null;
  try {
    imageURL = coverURL(input.coverUrl);
  } catch (error) {
    return fail((error as Error).message);
  }
  if (isbn && !isValidISBN(isbn)) return fail("Enter a valid ISBN-10 or ISBN-13.");
  if (asin && !isValidASIN(asin)) return fail("Amazon ASINs are exactly 10 letters or digits.");
  if (!title || !author) return fail("Title and author are required.");
  if (title.length > 500 || author.length > 300) return fail("Title or author is too long.");
  if (pages !== null && (!Number.isInteger(pages) || pages <= 0 || pages > 100_000))
    return fail("Enter a valid page count.");
  const year = input.year.trim() ? Number(input.year) : null;
  if (year !== null && (!Number.isInteger(year) || year < 1400 || year > 2200))
    return fail("Enter a valid publication year.");
  const genres = manualGenres(input.genres);
  if (genres.length > 20 || genres.some((g) => g.length > 60))
    return fail("Use at most 20 genres of up to 60 characters.");

  const book = toLibraryBook(
    {
      title,
      author,
      page_count: pages,
      isbn: isbn || undefined,
      genres,
      cover_url: imageURL ?? undefined,
    },
    userId,
    order,
  ) as NewBook;
  book.asin = asin || null;
  book.published_year = year;
  const shelfError = shelve(book, input.status || "tbr", today);
  if (shelfError) return fail(shelfError);
  if (existing.some((b) => sameBook(b, book))) return fail("A matching book already exists.");
  return { ok: true, book };
}
