// Shared filtering for clickable Insights charts. Never accesses another reader's books:
// caller supplies only the already-authorized viewBooks() subset.
import { TBR_AGE_BINS, libraryStatistics } from "./reading-habits";
import { seriesMetadata } from "./series-insights";
import type { BookInput, IsoDate, ReadPass } from "./types";

export const bookGenres = (book: BookInput): string[] => {
  const gs = [
    ...new Set(
      (Array.isArray(book.genres) ? book.genres : [])
        .filter((x) => typeof x === "string" && x.trim())
        .map((x) => x.trim()),
    ),
  ];
  return gs.length ? gs : ["Uncategorized"];
};

export const hasFinished = (book: BookInput): boolean =>
  book.status === "finished" ||
  (Array.isArray(book.read_history) &&
    (book.read_history as Partial<ReadPass>[]).some((x) => x.status === "finished"));

export type InsightFilterKind =
  "genre-all" | "genre-read" | "genre-unread" | "genre-rating" | "rating" | "series" | "tbr-age";

export function insightBooks<B extends BookInput>(
  books: B[] | null | undefined,
  {
    kind,
    value,
    today,
  }: { kind?: InsightFilterKind | string; value?: unknown; today?: IsoDate } = {},
): B[] {
  const rows = Array.isArray(books) ? books : [];
  const genre = (b: B) => bookGenres(b).includes(value as string);
  if (kind === "genre-all") return rows.filter(genre);
  if (kind === "genre-read") return rows.filter((b) => genre(b) && hasFinished(b));
  if (kind === "genre-unread") return rows.filter((b) => genre(b) && !hasFinished(b));
  if (kind === "genre-rating") {
    return rows.filter(
      (b) => genre(b) && b.rating != null && Number(b.rating) >= 0.25 && Number(b.rating) <= 5,
    );
  }
  if (kind === "rating")
    return rows.filter((b) => b.rating != null && Number(b.rating) === Number(value));
  if (kind === "series") {
    return rows.filter(
      (b) => seriesMetadata(b).series_name?.toLowerCase() === String(value || "").toLowerCase(),
    );
  }
  if (kind === "tbr-age") {
    const bucket = TBR_AGE_BINS.find((x) => x.id === value);
    if (!bucket) return [];
    const ids = new Set(
      libraryStatistics(rows, { today })
        .tbr.aged.filter((x) => x.ageDays >= bucket.min && x.ageDays <= bucket.max)
        .map((x) => String(x.bookId)),
    );
    return rows.filter((b) => ids.has(String(b.id)));
  }
  return [];
}
