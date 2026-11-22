import { expect, test } from "vitest";

import { validateSingleChapter, type ChapterRow } from "@/lib/chapter-edits";

const existing: ChapterRow[] = [
  { id: "c1", chapter_number: 1, chapter_label: "One", start_page: 1, end_page: 18 },
  { id: "c2", chapter_number: 2, chapter_label: "Two", start_page: 19, end_page: 40 },
];
const book = { page_count: 300 };
const input = (n: number, start: number, end: number, title = "") => ({
  chapter_number: n,
  start_page: start,
  end_page: end,
  title,
});

test("adds a new chapter with a default label", () => {
  const r = validateSingleChapter(input(3, 41, 60), book, existing);
  expect(r).toEqual({
    ok: true,
    chapter: { chapter_number: 3, chapter_label: "Chapter 3", start_page: 41, end_page: 60 },
    replacesId: null,
  });
});

test("re-entering a chapter number updates it, and may reuse its own range", () => {
  const r = validateSingleChapter(input(2, 19, 42, "  Two   (revised) "), book, existing);
  expect(r).toMatchObject({
    ok: true,
    replacesId: "c2",
    chapter: { chapter_label: "Two (revised)", end_page: 42 },
  });
});

test("rejects overlaps with other chapters", () => {
  expect(validateSingleChapter(input(3, 40, 60), book, existing)).toMatchObject({
    ok: false,
    error: /overlap/,
  });
});

test("rejects invalid numbers, reversed ranges and pages beyond the edition", () => {
  for (const bad of [
    input(0, 1, 2),
    input(1.5, 1, 2),
    input(3, 50, 49),
    input(3, 0, 5),
    input(3, 290, 301),
  ]) {
    expect(validateSingleChapter(bad, book, []), JSON.stringify(bad)).toMatchObject({ ok: false });
  }
  expect(validateSingleChapter(input(3, 290, 400), { page_count: null }, [])).toMatchObject({
    ok: true,
  });
});
