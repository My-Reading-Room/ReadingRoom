// Pure Goodreads CSV parsing and careful reimport merging. No network calls or browser state.
import { coverByISBN } from "./catalog";
import { parseSeriesFromTitle } from "./series-insights";
import type { BookInput, BookStatus, IsoDate, PassStatus, ReadPass } from "./types";

export const normTitle = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();

export function parseCSV(text: unknown): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  const content = String(text || "").replace(/^﻿/, "");
  for (let i = 0; i < content.length; i++) {
    const c = content[i],
      next = content[i + 1];
    if (c === '"') {
      if (quoted && next === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && next === "\n") i++;
      row.push(cell);
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x !== "")) rows.push(row);
  if (quoted) throw new Error("CSV contains an unclosed quoted field.");
  const keys = (rows.shift() || []).map((x) => x.trim());
  return rows.map((r) => Object.fromEntries(keys.map((key, i) => [key, r[i] ?? ""])));
}

export function parseCSVDate(value: unknown): IsoDate | null {
  const str = String(value || "").trim();
  if (!str) return null;
  let m = str.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return null;
}

export function goodreadsISBN(value: unknown): string | null {
  // Goodreads exports empty ISBNs as ="" and populated ones as ="978...".
  const digits = String(value ?? "")
    .replace(/[^0-9X]/gi, "")
    .toUpperCase();
  return digits.length === 10 || (digits.length === 13 && /^97[89]/.test(digits)) ? digits : null;
}

function year(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1500 && n <= 2099 ? n : null;
}

/** A pass recovered from a Goodreads reading-session export, before numbering. */
export type ImportedPass = {
  status: PassStatus;
  started_on?: IsoDate | null;
  finished_on?: IsoDate | null;
};
export type ImportedHistory = Omit<ReadPass, "finished_year">[];

export function buildGoodreadsReadHistory(
  title: unknown,
  status: string,
  startedOn: IsoDate | null,
  finishedOn: IsoDate | null,
  readCount: number,
  sessionsMap: Record<string, ImportedPass[]> | null = {},
): ImportedHistory {
  const entries = (sessionsMap?.[normTitle(title)] || []).map((p) => ({ ...p }));
  if (entries.length) {
    if (finishedOn && !entries.some((p) => p.finished_on === finishedOn)) {
      entries.push({ status: "finished", started_on: null, finished_on: finishedOn });
      entries.sort((a, b) =>
        (a.finished_on || a.started_on || "9999-99-99").localeCompare(
          b.finished_on || b.started_on || "9999-99-99",
        ),
      );
    }
    if (status === "reading" && entries.at(-1)?.status === "finished") {
      entries.push({ status: "reading", started_on: startedOn || null, finished_on: null });
    }
    return entries.map((p, idx) => ({
      number: idx + 1,
      status: p.status,
      started_on: p.started_on || null,
      finished_on: p.status === "finished" ? p.finished_on || null : null,
    }));
  }
  if (readCount > 1 && status === "reading" && finishedOn) {
    return [
      { number: 1, status: "finished", started_on: null, finished_on: finishedOn },
      { number: 2, status: "reading", started_on: startedOn || null, finished_on: null },
    ];
  }
  return [];
}

export type GoodreadsBook = {
  id: string;
  user_id: string;
  title: string;
  author: string;
  isbn: string | null;
  cover_url: string | null;
  work_key: null;
  edition_key: null;
  description: null;
  published_year: number | null;
  edition_year: number | null;
  original_published_year: number | null;
  publisher: string | null;
  binding: string | null;
  page_count: number | null;
  height_mm: null;
  thickness_mm: null;
  genres: string[];
  series_name: string | null;
  series_number: number | null;
  series_total: null;
  status: BookStatus;
  favorite: boolean;
  rating: number | null;
  tbr_added_on: IsoDate | null;
  goodreads_added_on: IsoDate | null;
  started_on: IsoDate | null;
  finished_on: IsoDate | null;
  current_page: number;
  read_history: ImportedHistory;
  /** Goodreads "Read Count"; dropped before saving (see prepareGoodreadsImport). */
  _grReadCount: number;
  notes: string;
  shelf_order: number;
};

export function parseGoodreads(
  text: unknown,
  {
    userId,
    existingCount = 0,
    sessionsMap = {},
    genresMap = {},
    uuid = () => crypto.randomUUID(),
  }: {
    userId?: string | null;
    existingCount?: number;
    sessionsMap?: Record<string, ImportedPass[]>;
    genresMap?: Record<string, string[]>;
    uuid?: () => string;
  } = {},
): GoodreadsBook[] {
  if (!userId) throw new Error("A signed-in user is required for Goodreads import.");
  const rows = parseCSV(text);
  if (!rows.length) return [];
  if (!Object.keys(rows[0]).includes("Title") || !Object.keys(rows[0]).includes("Author")) {
    throw new Error(
      "This does not look like a Goodreads CSV export (Title and Author columns required).",
    );
  }
  return rows
    .filter((r) => r.Title?.trim())
    .slice(0, 5000)
    .map((r, i) => {
      const isbn = goodreadsISBN(r.ISBN13) || goodreadsISBN(r.ISBN);
      const shelf = String(r["Exclusive Shelf"] || "")
        .toLowerCase()
        .trim();
      const shelves = String(r.Bookshelves || "").toLowerCase();
      const status: BookStatus = shelf.includes("currently")
        ? "reading"
        : shelf.includes("to-read")
          ? "tbr"
          : shelf.includes("dnf") || shelf.includes("did-not-finish")
            ? "dnf"
            : shelf.includes("read")
              ? "finished"
              : "tbr";
      const rawRating = Number(r["My Rating"] || 0);
      const rating = rawRating >= 0.25 && rawRating <= 5 ? Math.round(rawRating * 4) / 4 : null;
      const count = Number(r["Number of Pages"]);
      const page_count = Number.isInteger(count) && count > 0 ? count : null;
      const readCount = Math.max(0, Number(r["Read Count"] || 0) || 0);
      const csvFinished = parseCSVDate(r["Date Read"]);
      const history = buildGoodreadsReadHistory(
        r.Title,
        status,
        null,
        csvFinished,
        readCount,
        sessionsMap,
      );
      const last = history.at(-1);
      const grGenres = genresMap?.[normTitle(r.Title)] || [];
      const series = parseSeriesFromTitle(r.Title);
      return {
        id: uuid(),
        user_id: userId,
        title: r.Title.trim(),
        author: (r.Author || "").trim(),
        isbn,
        cover_url: isbn ? coverByISBN(isbn) : null,
        work_key: null,
        edition_key: null,
        description: null,
        published_year: year(r["Year Published"]) || year(r["Original Publication Year"]),
        edition_year: year(r["Year Published"]),
        original_published_year: year(r["Original Publication Year"]),
        publisher: r.Publisher?.trim() || null,
        binding: r.Binding?.trim() || null,
        page_count,
        height_mm: null,
        thickness_mm: null,
        genres: grGenres,
        series_name: series?.series_name || null,
        series_number: series?.series_number ?? null,
        series_total: null,
        status,
        favorite: shelves.includes("favorite"),
        rating,
        tbr_added_on: status === "tbr" ? parseCSVDate(r["Date Added"]) : null,
        goodreads_added_on: parseCSVDate(r["Date Added"]),
        started_on: last?.started_on || null,
        finished_on: status === "finished" ? last?.finished_on || csvFinished : null,
        current_page: status === "finished" && page_count ? page_count : 0,
        read_history: history,
        _grReadCount: readCount,
        notes: r["My Review"]?.trim() || r["Private Notes"]?.trim() || "",
        shelf_order: existingCount + i + 1,
      };
    });
}

type Matchable = { isbn?: unknown; title?: unknown; author?: unknown };

export function sameBook(a: Matchable, b: Matchable): boolean {
  const aISBN = goodreadsISBN(a.isbn),
    bISBN = goodreadsISBN(b.isbn);
  if (aISBN && bISBN && aISBN === bISBN) return true;
  const title = (x: Matchable) => parseSeriesFromTitle(x.title)?.title || x.title;
  return (
    `${title(a)}~${a.author}`.toLowerCase().replace(/[^a-z0-9~]/g, "") ===
    `${title(b)}~${b.author}`.toLowerCase().replace(/[^a-z0-9~]/g, "")
  );
}

const EMPTY = (value: unknown) =>
  value == null || value === "" || (Array.isArray(value) && !value.length);
const BIBLIO_FIELDS = [
  "isbn",
  "cover_url",
  "work_key",
  "edition_key",
  "description",
  "published_year",
  "edition_year",
  "original_published_year",
  "publisher",
  "binding",
  "page_count",
  "genres",
  "series_name",
  "series_number",
  "tbr_added_on",
  "goodreads_added_on",
] as const;

type Mergeable = BookInput & Record<string, unknown>;

export function mergeGoodreadsBook<E extends BookInput>(existing: E, imported: BookInput): E {
  const prev = existing as Mergeable,
    next = imported as Mergeable;
  const out: Record<string, unknown> = { ...existing };
  // Fill only missing fields. Never silently replace manual edits, read passes, or logs.
  for (const field of BIBLIO_FIELDS) {
    if (EMPTY(prev[field]) && !EMPTY(next[field])) out[field] = next[field];
  }
  if (existing.rating == null && imported.rating != null) out.rating = imported.rating;
  if (!existing.notes && imported.notes) out.notes = imported.notes;
  if (!existing.started_on && imported.started_on) out.started_on = imported.started_on;
  if (!existing.finished_on && imported.finished_on && existing.status === "finished") {
    out.finished_on = imported.finished_on;
  }
  if (!Array.isArray(existing.read_history) || !existing.read_history.length) {
    if (Array.isArray(imported.read_history) && imported.read_history.length) {
      out.read_history = imported.read_history;
    }
  }
  return out as E;
}

export function prepareGoodreadsImport<E extends BookInput>(
  importRows: (BookInput & { _grReadCount?: number })[],
  existingBooks: E[],
) {
  const additions: BookInput[] = [],
    updates: E[] = [],
    all: BookInput[] = [],
    skipped: BookInput[] = [];
  for (const row of importRows) {
    if (all.some((previous) => sameBook(previous, row))) {
      skipped.push(row);
      continue;
    }
    const already = existingBooks.find((b) => sameBook(b, row));
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _grReadCount, ...safeRow } = row;
    if (already) {
      const merged = mergeGoodreadsBook(already, safeRow);
      if (JSON.stringify(merged) !== JSON.stringify(already)) updates.push(merged);
      all.push(merged);
    } else {
      additions.push(safeRow);
      all.push(safeRow);
    }
  }
  return { additions, updates, all, skipped, existing: all.length - additions.length };
}

const isoPrefix = (v: unknown): IsoDate | null => {
  const m = String(v || "")
    .trim()
    .match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
};

/** Goodreads reading_sessions.json → reading passes per normalized title (legacy parseGoodreadsReadingSessions). */
export function parseGoodreadsReadingSessions(text: string): Record<string, ImportedPass[]> {
  const raw: unknown = JSON.parse(text);
  if (!Array.isArray(raw)) throw new Error("Expected a JSON array in reading_sessions.json.");
  const byTitle: Record<string, ImportedPass[]> = {};
  for (const item of raw) {
    if (!item || typeof item !== "object" || !item.book) continue;
    const key = normTitle(item.book);
    const start = isoPrefix(item.started_at),
      end = isoPrefix(item.ended_at);
    const state = String(item.state || "").toUpperCase();
    if (!key || (!start && !end && !state)) continue;
    (byTitle[key] ||= []).push({
      status: state === "COMPLETED" ? "finished" : state === "READING" ? "reading" : "dnf",
      started_on: start,
      finished_on: state === "COMPLETED" ? end : null,
    });
  }
  for (const passes of Object.values(byTitle)) {
    passes.sort((a, b) =>
      (a.finished_on || a.started_on || "9999-99-99").localeCompare(
        b.finished_on || b.started_on || "9999-99-99",
      ),
    );
  }
  return byTitle;
}

/** Goodreads genre_recommendation.json → genre tags per normalized title (legacy parseGoodreadsGenreRecommendations). */
export function parseGoodreadsGenreRecommendations(text: string): Record<string, string[]> {
  const raw: unknown = JSON.parse(text);
  if (!Array.isArray(raw)) throw new Error("Expected a JSON array in genre_recommendation.json.");
  const map: Record<string, string[]> = {};
  const add = (title: unknown, genre: unknown) => {
    const key = normTitle(title);
    const g = String(genre || "")
      .trim()
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    if (!key || !g) return;
    map[key] ||= [];
    if (!map[key].includes(g)) map[key].push(g);
  };
  for (const item of raw) {
    if (!item || typeof item !== "object" || !item.genre) continue;
    if (Array.isArray(item.recommended_because_you_added)) {
      for (const src of item.recommended_because_you_added) add(src, item.genre);
    }
    if (item.book) add(item.book, item.genre);
  }
  return map;
}
