// Ported from legacy/tests/chapter-sourcing-v238.test.mjs. Assertions unchanged.
// Not ported: legacy source-text checks (app.js, service worker, legacy SQL, DemoRepo)
// and HTML-string view tests, which move to React component tests (#12):
//   - demo persists reviewed mappings and opt-in sharing without modifying sessions
//   - cloud chapter operations use narrowly scoped RPCs rather than public write table access
//   - migration isolates community mappings behind authenticated owner-verified RPCs
import { test } from "vitest";
import assert from "node:assert/strict";
import {
  isbn13ForEdition,
  sameEditionISBN,
  draftFromStarts,
  draftFromContentsText,
  draftFromOpenLibraryEdition,
  lookupOpenLibraryChapters,
  validateVerifiedChapterMap,
  reviewedSharedCandidate,
} from "@/lib/chapter-sourcing";

const isbn = "9780441172719";
const book = { page_count: 604, isbn, title: "Dune" };
const checked = [
  { chapter_number: 1, chapter_label: "Chapter One", start_page: 1, end_page: 18 },
  { chapter_number: 2, chapter_label: "Chapter Two", start_page: 19, end_page: 45 },
];

test("ISBN-10 and ISBN-13 are canonicalized to matching edition identifiers", () => {
  assert.equal(isbn13ForEdition("0-451-52493-4"), "9780451524935");
  assert.ok(sameEditionISBN("0451524934", "9780451524935"));
  assert.equal(isbn13ForEdition("9780441172710"), "");
  assert.equal(isbn13ForEdition("not-a-book"), "");
});

test("Open Library exact ISBN table of contents only becomes an editable draft", () => {
  const edition = {
    key: "/books/OL1234M",
    title: "Dune",
    number_of_pages: 604,
    isbn_13: [isbn],
    table_of_contents: [
      { title: "Book One", pagenum: 1 },
      { title: "Book Two", pagenum: 50 },
      { title: "Book Three", pagenum: 113 },
    ],
  };
  const draft = draftFromOpenLibraryEdition(edition, isbn);
  assert.deepEqual(
    draft.rows.map((c) => [c.start_page, c.end_page]),
    [
      [1, 49],
      [50, 112],
      [113, ""],
    ],
  );
  assert.equal(draft.sourceUrl, "https://openlibrary.org/books/OL1234M");
  assert.throws(() => validateVerifiedChapterMap(draft.rows, book), /confirm both/);
  assert.throws(
    () => draftFromOpenLibraryEdition({ ...edition, isbn_13: ["9780451524935"] }, isbn),
    /different edition/,
  );
  assert.throws(
    () => draftFromOpenLibraryEdition({ ...edition, table_of_contents: [] }, isbn),
    /no usable numbered/,
  );
});

test("Open Library network request uses an exact ISBN endpoint and handles 404", async () => {
  const urls = [];
  const mock = async (url, options) => {
    urls.push(url);
    assert.equal(options.headers.Accept, "application/json");
    return {
      ok: true,
      json: async () => ({
        title: "Dune",
        isbn_13: [isbn],
        table_of_contents: [{ title: "Ch. 1", pagenum: 1 }],
      }),
    };
  };
  const draft = await lookupOpenLibraryChapters(isbn, mock);
  assert.equal(urls[0], `https://openlibrary.org/isbn/${isbn}.json`);
  assert.equal(draft.rows[0].end_page, "");
  await assert.rejects(
    lookupOpenLibraryChapters(isbn, async () => ({ ok: false, status: 404 })),
    /No Open Library edition/,
  );
});

test("OCR and pasted contents parse Arabic page numbers, flag noise and leave the last end blank", () => {
  const draft = draftFromContentsText(
    "TABLE OF CONTENTS\nIntro ...... ix\nPrologue .......... 1\nChapter 1 .......... 12\nChapter 2 .......... 30\nAppendix .......... 250",
  );
  assert.deepEqual(
    draft.rows.map((c) => [c.chapter_label, c.start_page, c.end_page]),
    [
      ["Prologue", 1, 11],
      ["Chapter 1", 12, 29],
      ["Chapter 2", 30, 249],
      ["Appendix", 250, ""],
    ],
  );
  assert.match(draft.warnings.join(" "), /could not be interpreted/);
  const dup = draftFromStarts([
    { title: "one", page: 1 },
    { title: "heading", page: 1 },
    { title: "two", page: 8 },
  ]);
  assert.deepEqual(
    dup.rows.map((x) => x.chapter_label),
    ["one", "two"],
  );
  assert.match(dup.warnings[0], /Skipped heading/);
});

test("exact mapping checks all chapters, overlap, edition limits, and page boundaries", () => {
  assert.deepEqual(validateVerifiedChapterMap(checked, book), checked);
  assert.throws(
    () => validateVerifiedChapterMap([{ chapter_label: "C1", start_page: 1, end_page: "" }], book),
    /confirm both/,
  );
  assert.throws(
    () =>
      validateVerifiedChapterMap(
        [
          { chapter_label: "C1", start_page: 1, end_page: 40 },
          { chapter_label: "C2", start_page: 20, end_page: 60 },
        ],
        book,
      ),
    /overlap/,
  );
  assert.throws(
    () => validateVerifiedChapterMap([{ chapter_label: "C1", start_page: 1, end_page: 605 }], book),
    /after the saved/,
  );
  assert.throws(() => validateVerifiedChapterMap([], book), /between 1/);
});

test("shared maps cannot be applied across ISBNs", () => {
  assert.deepEqual(reviewedSharedCandidate({ isbn13: isbn, chapters: checked }, isbn), checked);
  assert.throws(
    () => reviewedSharedCandidate({ isbn13: "9780451524935", chapters: checked }, isbn),
    /another ISBN/,
  );
});
