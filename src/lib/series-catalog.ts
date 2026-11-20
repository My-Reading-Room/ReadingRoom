// Best-effort, source-attributed series lookups. Never infer that a highest
// observed installment number is the final book in an open-ended series.
import { parseSeriesFromTitle, seriesMetadata } from "./series-insights";
import type { BookInput } from "./types";

export const seriesKey = (value: unknown): string =>
  String(value || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const validNumber = (value: unknown) =>
  value !== null &&
  value !== undefined &&
  value !== "" &&
  Number.isInteger(Number(value)) &&
  Number(value) > 0 &&
  Number(value) <= 500;
const clean = (value: unknown) => String(value || "").trim();

export function isSeriesSourceURL(url: unknown): boolean {
  try {
    const u = new URL(url as string);
    return (
      u.protocol === "https:" &&
      (u.hostname === "www.listofbooks.net" || u.hostname === "listofbooks.net") &&
      u.pathname.startsWith("/series/")
    );
  } catch {
    return false;
  }
}

export type SeriesBook = {
  position: number | null;
  number: number | null;
  role: string;
  title: string;
  year: number | null;
};

export type SeriesLookup = {
  title: string;
  author: string;
  url: string;
  order: "reading" | "publication";
  totalBooks: number | null;
  books: SeriesBook[];
  booksOmitted: number;
  position: number | null;
  source: "List Of Books";
};

type RawRecord = Record<string, unknown>;

export function normalizeSeriesResult(raw: unknown): SeriesLookup | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as RawRecord;
  const title = clean(r.title);
  if (!title || !isSeriesSourceURL(r.url)) return null;
  const books = (Array.isArray(r.books) ? (r.books as (RawRecord | null)[]) : [])
    .slice(0, 200)
    .map((book) => ({
      position: Number.isFinite(Number(book?.position)) ? Number(book?.position) : null,
      number: Number.isFinite(Number(book?.number)) ? Number(book?.number) : null,
      role: clean(book?.role || "core").toLowerCase(),
      title: clean(book?.title).slice(0, 220),
      year:
        Number.isInteger(Number(book?.year)) &&
        Number(book?.year) >= 1000 &&
        Number(book?.year) <= 2100
          ? Number(book?.year)
          : null,
    }))
    .filter((book) => book.title);
  const total = validNumber(r.totalBooks) ? Number(r.totalBooks) : null;
  return {
    title,
    author: clean(r.author),
    url: isSeriesSourceURL(r.url) ? (r.url as string) : "",
    order: r.order === "reading" ? "reading" : "publication",
    totalBooks: total,
    books,
    booksOmitted: Math.max(0, Number(r.booksOmitted) || 0),
    position: Number.isFinite(Number(r.position)) ? Number(r.position) : null,
    source: "List Of Books",
  };
}

export function catalogSeriesMatch(
  result: SeriesLookup | null | undefined,
  {
    seriesName = "",
    author = "",
    title = "",
  }: { seriesName?: unknown; author?: unknown; title?: unknown } = {},
): result is SeriesLookup {
  if (!result) return false;
  const wanted = seriesKey(seriesName);
  if (wanted && wanted !== seriesKey(result.title)) return false;
  const bookTitle = seriesKey(parseSeriesFromTitle(title)?.title || title);
  // Never trust a fuzzy series hit with a different name, and match author when present.
  const a = seriesKey(author),
    b = seriesKey(result.author);
  if (a && b && a !== b && !a.includes(b) && !b.includes(a)) return false;
  if (
    !wanted &&
    bookTitle &&
    !result.books.some((item) => seriesKey(item.title) === bookTitle) &&
    !Number.isFinite(result.position)
  ) {
    return false;
  }
  return true;
}

export type ProposedSeriesFields = {
  series_name: string;
  series_number: number | null;
  series_total: number | null;
  series_total_source: "listofbooks" | null;
  series_source_url: string | null;
};

export function proposedSeriesFields(
  book: BookInput,
  lookup: SeriesLookup | null | undefined,
): ProposedSeriesFields | null {
  const current = seriesMetadata(book);
  if (
    !catalogSeriesMatch(lookup, {
      seriesName: current.series_name,
      author: book.author,
      title: book.title,
    })
  ) {
    return null;
  }
  const ownTitle = seriesKey(parseSeriesFromTitle(book.title)?.title || book.title);
  const sourceBook = lookup.books.find((b) => seriesKey(b.title) === ownTitle);
  const number =
    current.series_number ?? sourceBook?.number ?? sourceBook?.position ?? lookup.position ?? null;
  if (number !== null && (!Number.isFinite(number) || number < 0 || number > 500)) return null;
  return {
    series_name: current.series_name || lookup.title,
    series_number: number,
    series_total:
      number != null && lookup.totalBooks != null && Number(number) > lookup.totalBooks
        ? null
        : lookup.totalBooks,
    series_total_source: lookup.totalBooks ? "listofbooks" : null,
    series_source_url: lookup.url || null,
  };
}

type SeriesFieldKey = "series_name" | "series_number" | "series_total";

export function fillMissingSeriesFields<B extends BookInput>(
  book: B,
  lookup: SeriesLookup | null | undefined,
): B | null {
  const proposed = proposedSeriesFields(book, lookup);
  if (!proposed) return null;
  const updated: B = { ...book };
  const fields = updated as Record<
    SeriesFieldKey | "series_total_source" | "series_source_url",
    unknown
  >;
  let changed = false;
  for (const key of ["series_name", "series_number", "series_total"] as SeriesFieldKey[]) {
    if (
      (fields[key] === null || fields[key] === undefined || fields[key] === "") &&
      proposed[key] !== null &&
      proposed[key] !== undefined
    ) {
      fields[key] = proposed[key];
      changed = true;
    }
  }
  // Keep provenance for any source-provided count, but do not overwrite a manually verified total.
  if (
    !book.series_total &&
    fields.series_total === proposed.series_total &&
    proposed.series_total &&
    proposed.series_source_url
  ) {
    fields.series_total_source = "listofbooks";
    fields.series_source_url = proposed.series_source_url;
    changed = true;
  }
  return changed ? updated : null;
}

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export async function fetchSeriesLookup({
  series = "",
  title = "",
  author = "",
  fetcher = fetch,
}: {
  series?: string;
  title?: string;
  author?: string;
  fetcher?: Fetcher;
} = {}): Promise<SeriesLookup | null> {
  const mode = clean(series) ? "series" : "book";
  if (mode === "book" && (!clean(title) || !clean(author))) return null;
  const qs = new URLSearchParams({ mode });
  if (mode === "series") qs.set("series", clean(series));
  else {
    qs.set("title", clean(title));
    qs.set("author", clean(author));
  }
  const res = await fetcher("/api/series-lookup?" + qs.toString(), {
    headers: { Accept: "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.message || "Series lookup unavailable.") as Error & {
      code?: string;
    };
    error.code = data.code || "unavailable";
    throw error;
  }
  return normalizeSeriesResult(data.result);
}

export async function isSeriesLookupConfigured(fetcher: Fetcher = fetch): Promise<boolean> {
  try {
    const response = await fetcher("/api/series-lookup?mode=status", {
      headers: { Accept: "application/json" },
    });
    const data = await response.json();
    return response.ok && data.configured === true;
  } catch {
    return false;
  }
}
