// Single chapter add/update rules, ported from legacy app.js saveChapter().
import type { BookInput } from "./types";

export type ChapterRow = {
  id: string;
  chapter_number: number;
  chapter_label: string | null;
  start_page: number;
  end_page: number;
};

export type SingleChapterInput = {
  chapter_number: unknown;
  start_page: unknown;
  end_page: unknown;
  title: unknown;
};

export type SingleChapterResult =
  | { ok: true; chapter: Omit<ChapterRow, "id">; replacesId: string | null }
  | { ok: false; error: string };

/**
 * Validate one exact chapter boundary for a book. Re-entering an existing
 * chapter number updates it; ranges may not overlap any other chapter.
 */
export function validateSingleChapter(
  input: SingleChapterInput,
  book: Pick<BookInput, "page_count">,
  existing: ChapterRow[],
): SingleChapterResult {
  const n = Number(input.chapter_number),
    start = Number(input.start_page),
    end = Number(input.end_page);
  const pageCount = Number(book.page_count) || 0;
  if (
    !Number.isInteger(n) ||
    n < 1 ||
    n > 300 ||
    !Number.isInteger(start) ||
    start < 1 ||
    !Number.isInteger(end) ||
    end < start ||
    (pageCount > 0 && end > pageCount)
  ) {
    return {
      ok: false,
      error: "Enter a valid chapter number and exact page range for this edition.",
    };
  }
  const title = String(input.title ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  const same = existing.find((c) => c.chapter_number === n);
  if (existing.some((c) => c.id !== same?.id && start <= c.end_page && end >= c.start_page)) {
    return { ok: false, error: "Chapter page ranges cannot overlap." };
  }
  return {
    ok: true,
    chapter: {
      chapter_number: n,
      chapter_label: title || `Chapter ${n}`,
      start_page: start,
      end_page: end,
    },
    replacesId: same?.id ?? null,
  };
}
