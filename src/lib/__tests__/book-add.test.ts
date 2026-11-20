import { describe, expect, test } from "vitest";

import { newCatalogBook, newManualBook, type ManualBookInput } from "@/lib/book-add";

const ctx = {
  userId: "u1",
  today: "2026-11-20",
  existing: [{ title: "Dune", author: "Frank Herbert", isbn: "9780441172719" }],
  order: 10,
};
const edition = {
  kind: "edition" as const,
  key: "/books/OL1M",
  edition_key: "/books/OL1M",
  title: "Project Hail Mary",
  author: "Andy Weir",
  isbn: "9780593135204",
  page_count: 496,
  cover_url: "https://covers.openlibrary.org/b/id/1-M.jpg",
  genres: ["Science Fiction"],
};
const manual = (c: Partial<ManualBookInput> = {}): ManualBookInput => ({
  title: "My Zine",
  author: "Me",
  pages: "",
  isbn: "",
  asin: "",
  genres: "",
  coverUrl: "",
  year: "",
  status: "tbr",
  ...c,
});
const ok = (r: ReturnType<typeof newManualBook>) => {
  if ("error" in r) throw new Error(r.error);
  return r.book;
};
const error = (r: ReturnType<typeof newManualBook>) => ("error" in r ? r.error : null);

describe("catalog add", () => {
  test("sets shelf dates like legacy and keeps the edition", () => {
    const tbr = ok(newCatalogBook(edition, { status: "tbr", pages: "" }, ctx));
    expect(tbr).toMatchObject({
      user_id: "u1",
      status: "tbr",
      tbr_added_on: "2026-11-20",
      edition_key: "/books/OL1M",
      shelf_order: 10,
    });
    expect(ok(newCatalogBook(edition, { status: "reading", pages: "" }, ctx))).toMatchObject({
      started_on: "2026-11-20",
      tbr_added_on: null,
    });
    expect(ok(newCatalogBook(edition, { status: "finished", pages: "500" }, ctx))).toMatchObject({
      finished_on: "2026-11-20",
      page_count: 500,
    });
  });
  test("rejects duplicates, bad page counts and bad shelves; drops unsafe catalog values", () => {
    expect(
      error(
        newCatalogBook(
          { ...edition, title: "Dune", author: "Frank Herbert" },
          { status: "tbr", pages: "" },
          ctx,
        ),
      ),
    ).toMatch(/already/);
    expect(error(newCatalogBook(edition, { status: "tbr", pages: "-3" }, ctx))).toMatch(
      /positive whole number/,
    );
    expect(error(newCatalogBook(edition, { status: "lost", pages: "" }, ctx))).toMatch(
      /valid shelf/,
    );
    const unsafe = ok(
      newCatalogBook(
        { ...edition, isbn: "123", cover_url: "http://insecure.example/c.jpg" },
        { status: "tbr", pages: "" },
        ctx,
      ),
    );
    expect(unsafe.isbn).toBeNull();
    expect(unsafe.cover_url).toBeNull();
  });
});

describe("manual add", () => {
  test("validates like legacy", () => {
    for (const [change, message] of [
      [{ title: "" }, /required/],
      [{ isbn: "9780441172710" }, /valid ISBN/],
      [{ asin: "B0" }, /ASIN/],
      [{ coverUrl: "javascript:alert(1)" }, /HTTPS/],
      [{ pages: "0" }, /page count/],
      [{ year: "1200" }, /publication year/],
      [{ title: "x".repeat(501) }, /too long/],
      [{ title: "Dune", author: "Frank Herbert" }, /already exists/],
    ] as const) {
      expect(error(newManualBook(manual(change), ctx)), JSON.stringify(change)).toMatch(message);
    }
  });
  test("stores identifiers, genres and year", () => {
    const book = ok(
      newManualBook(
        manual({
          isbn: "0-441-17271-7",
          asin: "b000fc1pjk",
          genres: "Fantasy, fantasy, Poetry",
          year: "1999",
          status: "reading",
        }),
        ctx,
      ),
    );
    expect(book).toMatchObject({
      isbn: "0441172717",
      asin: "B000FC1PJK",
      genres: ["Fantasy", "Poetry"],
      published_year: 1999,
      started_on: "2026-11-20",
    });
  });
});
