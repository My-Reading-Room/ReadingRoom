// Goodreads series titles are a useful source of *order*, not of full series size.
// This module never assumes that the highest imported installment is the final one.
import { readingSpeedByMode } from "./reading-metrics";
import type { BookInput, ReadPass, SessionInput } from "./types";

export type ParsedSeries = { title: string; series_name: string; series_number: number };

export function parseSeriesFromTitle(title: unknown): ParsedSeries | null {
  const original = String(title || "").trim();
  // Goodreads: "Dune (Dune #1)", "The Name (Series, #2)", "Title (Series #2.5)".
  const match = original.match(/^(.+?)\s+\(\s*([^()#]{2,120}?)\s*,?\s*#\s*(\d+(?:\.\d+)?)\s*\)$/u);
  if (!match) return null;
  const seriesName = match[2].trim().replace(/,\s*$/, "").trim();
  const number = Number(match[3]);
  if (!seriesName || !Number.isFinite(number) || number < 0 || number > 999) return null;
  return { title: match[1].trim(), series_name: seriesName, series_number: number };
}

export function seriesMetadata(book: BookInput = {}) {
  const inferred = parseSeriesFromTitle(book.title);
  const name = String(book.series_name || "").trim() || inferred?.series_name || null;
  const raw: unknown = book.series_number;
  const explicit = raw !== "" && raw != null && Number.isFinite(Number(raw));
  const number = explicit ? Number(raw) : (inferred?.series_number ?? null);
  return {
    series_name: name,
    series_number: name ? number : null,
    inferred: !book.series_name && Boolean(inferred),
  };
}

const completed = (book: BookInput) =>
  book.status === "finished" ||
  (Array.isArray(book.read_history) &&
    (book.read_history as Partial<ReadPass>[]).some((x) => x.status === "finished"));
const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

type SeriesBook = BookInput & { _seriesNumber: number };
type SeriesGroup = {
  name: string;
  books: SeriesBook[];
  totals: Set<number>;
  sourceURL: string | null;
  sourceKind: string | null;
};

export function seriesStatistics(books: BookInput[] = [], sessions: SessionInput[] = []) {
  const groups = new Map<string, SeriesGroup>();
  for (const book of books) {
    const meta = seriesMetadata(book);
    if (!meta.series_name || meta.series_number === null) continue;
    const key = meta.series_name.toLocaleLowerCase();
    if (!groups.has(key))
      groups.set(key, {
        name: meta.series_name,
        books: [],
        totals: new Set(),
        sourceURL: null,
        sourceKind: null,
      });
    const group = groups.get(key)!;
    group.books.push({ ...book, _seriesNumber: meta.series_number });
    if (
      !group.sourceURL &&
      /^https:\/\/(?:www\.)?listofbooks\.net\/series\//.test(String(book.series_source_url || ""))
    ) {
      group.sourceURL = book.series_source_url as string;
      group.sourceKind = book.series_total_source ?? null;
    }
    const total = Number(book.series_total);
    if (book.series_total != null && Number.isInteger(total) && total > 0 && total <= 500)
      group.totals.add(total);
  }
  const result = [...groups.values()]
    .map((group) => {
      const items = group.books.sort(
        (a, b) =>
          a._seriesNumber - b._seriesNumber || String(a.title).localeCompare(String(b.title)),
      );
      const totals = [...group.totals];
      const expectedTotal = totals.length === 1 ? totals[0] : null;
      const inconsistentTotals = totals.length > 1;
      const finishedOrders = new Set(items.filter(completed).map((b) => b._seriesNumber));
      const startedOrders = new Set(
        items.filter((b) => completed(b) || b.status === "reading").map((b) => b._seriesNumber),
      );
      const full =
        expectedTotal !== null &&
        !inconsistentTotals &&
        Array.from({ length: expectedTotal }, (_, i) => i + 1).every((n) => finishedOrders.has(n));
      const rows = items.map((book) => {
        const bookSessions = sessions.filter((s) => String(s.user_book_id) === String(book.id));
        const modes = readingSpeedByMode(bookSessions);
        const rated = book.rating == null ? null : Number(book.rating);
        return {
          bookId: book.id,
          title: book.title,
          number: book._seriesNumber,
          status: book.status,
          finished: completed(book),
          rating:
            rated !== null && Number.isFinite(rated) && rated >= 0.25 && rated <= 5 ? rated : null,
          speed: modes,
          minutes: bookSessions.reduce(
            (n, s) => n + (Number(s.duration_minutes) > 0 ? Number(s.duration_minutes) : 0),
            0,
          ),
          sessions: bookSessions.length,
        };
      });
      const ratings = rows.map((r) => r.rating).filter((x): x is number => x !== null);
      return {
        name: group.name,
        expectedTotal,
        inconsistentTotals,
        fullyRead: full,
        sourceURL: group.sourceURL,
        sourceKind: group.sourceKind,
        started: startedOrders.size > 0,
        finishedCount: finishedOrders.size,
        startedCount: startedOrders.size,
        trackedCount: new Set(items.map((b) => b._seriesNumber)).size,
        ratingsAverage: avg(ratings),
        rows,
      };
    })
    .sort((a, b) => Number(b.started) - Number(a.started) || a.name.localeCompare(b.name));
  return {
    series: result,
    fullSeries: result.filter((g) => g.fullyRead).length,
    startedNotComplete: result.filter((g) => g.started && !g.fullyRead).length,
    unverified: result.filter((g) => g.started && !g.fullyRead && g.expectedTotal === null).length,
    tracked: result.length,
  };
}
