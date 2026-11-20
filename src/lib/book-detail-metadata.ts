// Explicit per-book metadata editing. Nothing in this module triggers a catalog
// request until the user chooses the lookup action in the book detail view.
import {
  STANDARD_GENRES,
  enrichBookMetadata,
  lookupISBNMetadata,
  type CatalogBook,
} from "./catalog";
import type { BookInput } from "./types";

export { STANDARD_GENRES };

export const ISBN_REGEX = /^(?:\d{9}[\dX]|\d{13})$/;

export function normalizeISBN(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/[\s-]/g, "")
    .toUpperCase();
}

export function isValidISBN(value: unknown): boolean {
  const isbn = normalizeISBN(value);
  if (!ISBN_REGEX.test(isbn)) return false;
  if (isbn.length === 10) {
    let sum = 0;
    for (let i = 0; i < 10; i++) sum += (10 - i) * (isbn[i] === "X" ? 10 : Number(isbn[i]));
    return sum % 11 === 0;
  }
  let sum = 0;
  for (let i = 0; i < 13; i++) sum += Number(isbn[i]) * (i % 2 ? 3 : 1);
  return sum % 10 === 0;
}

export function normalizeASIN(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

export function isValidASIN(value: unknown): boolean {
  return /^[A-Z0-9]{10}$/.test(normalizeASIN(value));
}

/** Validate a user-entered cover URL: HTTPS only, no embedded credentials, bounded length. */
export function coverURL(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (raw.length > 2048) throw new Error("Cover URL is too long.");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Enter a complete HTTPS cover URL.");
  }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password) {
    throw new Error("Cover URL must use HTTPS and cannot contain a password.");
  }
  return url.href;
}

export function manualGenres(value: unknown): string[] {
  const seen = new Set<string>();
  return String(value ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter((v) => {
      const key = v.toLocaleLowerCase();
      if (!v || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

// Manual editing only offers the same canonical values as catalog enrichment.
// Existing unconventional labels survive unrelated edits, but cannot be newly added.
export function selectedGenres(value: unknown): string[] {
  const input = Array.isArray(value) ? value : manualGenres(value);
  const seen = new Set<string>();
  return input
    .map((v) => {
      const genre = String(v ?? "").trim();
      return (
        STANDARD_GENRES.find((g) => g.toLocaleLowerCase() === genre.toLocaleLowerCase()) || genre
      );
    })
    .filter((v) => {
      const key = v.toLocaleLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function addSelectedGenre(existing: unknown, choice: unknown): string[] {
  const canonical = STANDARD_GENRES.find(
    (g) =>
      g.toLocaleLowerCase() ===
      String(choice ?? "")
        .trim()
        .toLocaleLowerCase(),
  );
  if (!canonical) throw new RangeError("Select a genre from the standardized dropdown.");
  const list = selectedGenres(existing);
  return list.some((g) => g.toLocaleLowerCase() === canonical.toLocaleLowerCase())
    ? list
    : [...list, canonical];
}

export function removeSelectedGenre(existing: unknown, choice: unknown): string[] {
  return selectedGenres(existing).filter((g) => g !== choice);
}

export function primarySelectedGenre(existing: unknown, choice: unknown): string[] {
  const list = selectedGenres(existing);
  const found = list.find((g) => g === choice);
  if (!found) throw new RangeError("This genre is not assigned to the book.");
  return [found, ...list.filter((g) => g !== found)];
}

const EMPTY = (value: unknown) =>
  value == null || value === "" || (Array.isArray(value) && !value.length);

export const LOOKUP_FIELDS = [
  "genres",
  "description",
  "publisher",
  "binding",
  "page_count",
  "published_year",
  "edition_year",
  "original_published_year",
  "work_key",
  "edition_key",
  "isbn",
] as const;

type LookupField = (typeof LOOKUP_FIELDS)[number];
type LookupMetadata = Partial<Record<LookupField | "cover_url", unknown>>;

export type MetadataLookup = {
  metadata: LookupMetadata | CatalogBook;
  matchLevel: "isbn" | "edition" | "work";
  label: string;
  notice: string;
};

export function mergeReviewedMetadata<B extends BookInput>(
  book: B,
  lookup: { metadata: MetadataLookup["metadata"]; matchLevel?: string } | null | undefined,
  { useCover = false }: { useCover?: boolean } = {},
): B {
  if (!lookup || !lookup.metadata) throw new Error("No reviewed lookup result is available.");
  const metadata = lookup.metadata as LookupMetadata;
  const updated: Record<string, unknown> = { ...book };
  const current = book as Record<string, unknown>;
  for (const field of LOOKUP_FIELDS) {
    if (!EMPTY(current[field]) || EMPTY(metadata[field])) continue;
    // Never infer an ISBN or a specific edition from a work-level cover/title match.
    if (
      ["isbn", "edition_key", "edition_year", "publisher", "binding", "page_count"].includes(
        field,
      ) &&
      lookup.matchLevel === "work"
    ) {
      continue;
    }
    if (field === "isbn" && !isValidISBN(metadata.isbn)) continue;
    updated[field] = metadata[field];
  }
  if (useCover && metadata.cover_url) updated.cover_url = coverURL(metadata.cover_url);
  return updated as B;
}

export async function lookupBookOnRequest(
  book: BookInput,
  googleKey = "",
): Promise<MetadataLookup> {
  const isbn = normalizeISBN(book.isbn);
  const asin = normalizeASIN(book.asin);
  if (isbn && !isValidISBN(isbn))
    throw new Error("Correct the ISBN and save this book before looking it up.");
  if (asin && !isValidASIN(asin))
    throw new Error("Correct the ASIN and save this book before looking it up.");
  if (isbn) {
    const verified = await lookupISBNMetadata(isbn, googleKey);
    if (!verified)
      throw new Error(
        "No exact ISBN match was found. Your saved details and cover were not changed.",
      );
    // Lookup is advisory. Existing manual values are not replaced on Apply.
    return {
      metadata: verified,
      matchLevel: "isbn",
      label: "Exact ISBN match",
      notice:
        "Identified by ISBN. Applying fills only blank fields; replacing the cover is optional.",
    };
  }
  // Some print books use their ISBN-10 as the Amazon ASIN. Other Amazon ASINs
  // cannot be resolved by Open Library/Google Books without Amazon API access.
  if (asin && isValidISBN(asin)) {
    const verified = await lookupISBNMetadata(asin, googleKey);
    if (verified) {
      return {
        metadata: verified,
        matchLevel: "isbn",
        label: "ASIN matched as ISBN-10",
        notice: "This ASIN is a valid ISBN-10. No previously saved ISBN will be replaced.",
      };
    }
  }
  if (!book.title?.trim()) throw new Error("Add a book title before searching for metadata.");
  const prepared = { ...book, cover_url: null, genres: [], description: null };
  const enriched = await enrichBookMetadata(prepared, googleKey, {
    preserveCover: false,
    matchEdition: true,
    forceGenres: true,
  });
  const useful = Boolean(enriched.cover_url || enriched.genres?.length || enriched.edition_key);
  if (!useful) {
    throw new Error(
      "No usable catalog match was found for this book. Your saved details were not changed.",
    );
  }
  const editionVerified = Boolean(
    enriched.edition_key && enriched.edition_key !== book.edition_key,
  );
  return {
    metadata: enriched,
    matchLevel: editionVerified ? "edition" : "work",
    label: editionVerified
      ? "Edition match based on book details"
      : "Work-level title and author match",
    notice:
      asin && !isValidISBN(asin)
        ? "Your Amazon ASIN was saved, but these catalogs do not identify Amazon-only ASINs. Results are based on title/author instead."
        : "Without a verified ISBN, cover art and genre can refer to the work, not your exact edition. Edition-specific details remain blank unless a confident match is found.",
  };
}
