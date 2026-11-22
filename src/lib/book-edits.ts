// Book detail "Save book" rules, ported from legacy app.js saveBook() so they
// run on the server (#12). The legacy checks only ran in the browser; here the
// same rules, plus bounds on every field (#9), apply to whatever is submitted.
import {
  coverURL,
  isValidASIN,
  isValidISBN,
  manualGenres,
  normalizeASIN,
  normalizeISBN,
} from "./book-detail-metadata";
import { readingPasses, updateLatestPass } from "./reading-history";
import { isSeriesSourceURL } from "./series-catalog";
import { seriesMetadata } from "./series-insights";
import type { BookInput, BookStatus, IsoDate } from "./types";

export const BOOK_STATUSES: BookStatus[] = ["tbr", "reading", "finished", "dnf"];

/** Raw form values, exactly as submitted (all strings; blank means "not set"). */
export type BookEditForm = {
  status: string;
  rating: string;
  started_on: string;
  finished_on: string;
  page_count: string;
  current_page: string;
  isbn: string;
  asin: string;
  cover_url: string;
  publisher: string;
  binding: string;
  edition_year: string;
  original_published_year: string;
  height_mm: string;
  thickness_mm: string;
  genres: string;
  tbr_added_on: string;
  series_name: string;
  series_number: string;
  series_total: string;
  notes: string;
};

/** A catalog series suggestion the reader reviewed before saving. */
export type SeriesProposal = {
  series_name: string;
  series_number: number | null;
  series_total: number | null;
  source_url: string;
};

export type BookEditContext = {
  today: IsoDate;
  /** Whether exact chapter boundaries exist for this book (they pin its ISBN). */
  hasChapters: boolean;
  seriesProposal?: SeriesProposal | null;
};

export type BookEditResult<B> = { ok: true; book: B } | { ok: false; error: string };

const LIMITS = {
  notes: 20_000,
  publisher: 200,
  binding: 80,
  seriesName: 200,
  genres: 20,
  genre: 60,
};

const isDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
};
const optionalNumber = (value: string) => (value.trim() === "" ? null : Number(value));
const trimmed = (value: string) => value.trim();

export function applyBookEdits<B extends BookInput>(
  book: B,
  form: BookEditForm,
  { today, hasChapters, seriesProposal = null }: BookEditContext,
): BookEditResult<B> {
  const fail = (error: string): BookEditResult<B> => ({ ok: false, error });

  const status = form.status as BookStatus;
  if (!BOOK_STATUSES.includes(status)) return fail("Choose a valid reading status.");
  if (["finished", "dnf"].includes(book.status as string) && status === "reading") {
    return fail("Use Start reread to preserve the previous reading history.");
  }

  const rating = optionalNumber(form.rating);
  if (rating !== null && !(rating >= 0.25 && rating <= 5 && Number.isInteger(rating * 4))) {
    return fail("Rating must be between 0.25 and 5 stars in quarter steps.");
  }

  for (const [label, value] of [
    ["start", form.started_on],
    ["finish", form.finished_on],
    ["TBR added", form.tbr_added_on],
  ] as const) {
    if (value && !isDate(value)) return fail(`Enter a valid ${label} date.`);
  }

  const pages = optionalNumber(form.page_count);
  const current = Number(form.current_page || 0);
  const height = optionalNumber(form.height_mm);
  const thickness = optionalNumber(form.thickness_mm);
  const editionYear = optionalNumber(form.edition_year);
  const originalYear = optionalNumber(form.original_published_year);
  const isbn = normalizeISBN(form.isbn);
  const asin = normalizeASIN(form.asin);

  let imageURL: string | null;
  try {
    imageURL = coverURL(form.cover_url);
  } catch (error) {
    return fail((error as Error).message);
  }
  if (isbn && !isValidISBN(isbn))
    return fail("Enter a valid ISBN-10 or ISBN-13 (including its check digit).");
  if (asin && !isValidASIN(asin))
    return fail("An Amazon ASIN must contain exactly 10 letters or digits.");
  const changedISBN = isbn !== normalizeISBN(book.isbn);
  if (changedISBN && hasChapters) {
    return fail(
      "This book has exact chapter maps. Remove/reconcile those maps before changing its ISBN so chapter page counts stay accurate.",
    );
  }
  if (
    [editionYear, originalYear].some(
      (y) => y !== null && (!Number.isInteger(y) || y < 1500 || y > 2099),
    )
  ) {
    return fail("Publication years must be 1500–2099.");
  }
  if (pages !== null && (!Number.isInteger(pages) || pages <= 0 || pages > 100_000)) {
    return fail("Page count must be a positive whole number.");
  }
  if (!Number.isInteger(current) || current < 0 || (pages !== null && current > pages)) {
    return fail("Current page must be between 0 and the book page count.");
  }
  const seriesTotalRaw = trimmed(form.series_total);
  if (
    seriesTotalRaw &&
    (!Number.isInteger(Number(seriesTotalRaw)) ||
      Number(seriesTotalRaw) < 1 ||
      Number(seriesTotalRaw) > 500)
  ) {
    return fail("Series total must be a whole number between 1 and 500.");
  }
  const seriesNumber = optionalNumber(form.series_number);
  if (
    seriesNumber !== null &&
    !(Number.isFinite(seriesNumber) && seriesNumber >= 0 && seriesNumber <= 999)
  ) {
    return fail("Installment number must be between 0 and 999.");
  }
  if (
    (height !== null && (height <= 0 || !Number.isFinite(height) || height > 2000)) ||
    (thickness !== null && (thickness <= 0 || !Number.isFinite(thickness) || thickness > 2000))
  ) {
    return fail("Physical dimensions must be positive numbers.");
  }

  const genres = manualGenres(form.genres);
  if (genres.length > LIMITS.genres || genres.some((g) => g.length > LIMITS.genre)) {
    return fail(`Use at most ${LIMITS.genres} genres of up to ${LIMITS.genre} characters.`);
  }
  if (form.notes.length > LIMITS.notes)
    return fail(`Notes can be at most ${LIMITS.notes} characters.`);
  if (
    trimmed(form.publisher).length > LIMITS.publisher ||
    trimmed(form.binding).length > LIMITS.binding
  ) {
    return fail("Publisher or binding is too long.");
  }
  const seriesName = trimmed(form.series_name);
  if (seriesName.length > LIMITS.seriesName) return fail("Series name is too long.");

  let finished: IsoDate | null = form.finished_on || null;
  // A historical, year-only finish must not silently become today's exact date.
  if (status === "finished" && !finished && !readingPasses(book).at(-1)?.finished_year)
    finished = today;
  if (status !== "finished") finished = null;

  const proposal = seriesProposal;
  const catalogApplied = Boolean(
    proposal &&
    isSeriesSourceURL(proposal.source_url) &&
    seriesName === proposal.series_name &&
    Number(form.series_number) === Number(proposal.series_number) &&
    Number(seriesTotalRaw) === Number(proposal.series_total) &&
    (!book.series_total || book.series_total_source === "listofbooks"),
  );
  const unchangedSource = Boolean(
    seriesTotalRaw &&
    Number(seriesTotalRaw) === Number(book.series_total) &&
    seriesName === (book.series_name || seriesMetadata(book).series_name),
  );
  const tbrDefault =
    book.status === "tbr"
      ? book.tbr_added_on || String(book.created_at ?? "").slice(0, 10) || today
      : today;

  const updated = {
    ...book,
    status,
    rating,
    started_on: form.started_on || null,
    finished_on: finished,
    page_count: pages,
    current_page: status === "finished" && pages ? pages : current,
    publisher: trimmed(form.publisher) || null,
    binding: trimmed(form.binding) || null,
    isbn: isbn || null,
    asin: asin || null,
    cover_url: imageURL,
    edition_key: changedISBN ? null : book.edition_key,
    work_key: changedISBN ? null : book.work_key,
    edition_year: editionYear,
    original_published_year: originalYear,
    published_year: editionYear || book.published_year || originalYear || null,
    height_mm: height,
    thickness_mm: thickness,
    genres,
    series_name: seriesName || null,
    series_number: seriesNumber,
    series_total: seriesTotalRaw ? Number(seriesTotalRaw) : null,
    series_total_source: seriesTotalRaw
      ? catalogApplied
        ? "listofbooks"
        : unchangedSource
          ? book.series_total_source || "manual"
          : "manual"
      : null,
    series_source_url: seriesTotalRaw
      ? catalogApplied
        ? proposal!.source_url
        : unchangedSource
          ? book.series_source_url || null
          : null
      : null,
    notes: form.notes || "",
    tbr_added_on: status === "tbr" ? form.tbr_added_on || tbrDefault : book.tbr_added_on || null,
  };
  return { ok: true, book: updateLatestPass(book, updated) as B };
}
