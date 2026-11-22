// Exports of the reader's own data (#16), ported from legacy exportBooksCSV().
import type { BookInput } from "./types";

export const BOOK_CSV_COLUMNS = [
  "title",
  "author",
  "isbn",
  "asin",
  "status",
  "favorite",
  "rating",
  "page_count",
  "publisher",
  "binding",
  "edition_year",
  "original_published_year",
  "edition_key",
  "genres",
  "goodreads_added_on",
  "tbr_added_on",
  "started_on",
  "finished_on",
  "series_name",
  "series_number",
  "series_total",
  "series_total_source",
  "series_source_url",
  "notes",
] as const;

/**
 * Quote a CSV cell. Text that a spreadsheet would treat as a formula
 * (=, +, -, @, tab, CR) gets a leading apostrophe, so a book note like
 * "=HYPERLINK(...)" can't run when the export is opened in Excel/Sheets
 * (OWASP "CSV injection"; legacy didn't guard against this).
 */
export function csvCell(value: unknown): string {
  let text = Array.isArray(value) ? value.join("; ") : String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function booksToCsv(books: BookInput[]): string {
  const rows = [
    BOOK_CSV_COLUMNS.map(csvCell).join(","),
    ...books.map((b) =>
      BOOK_CSV_COLUMNS.map((k) => csvCell((b as Record<string, unknown>)[k])).join(","),
    ),
  ];
  return rows.join("\r\n");
}
