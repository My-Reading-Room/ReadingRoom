import { describe, expect, test } from "vitest";

import { applyBookEdits, type BookEditForm } from "@/lib/book-edits";
import type { BookInput } from "@/lib/types";

const today = "2026-11-19";
const book: BookInput = {
  id: "b1",
  title: "Dune",
  status: "reading",
  isbn: "9780441172719",
  edition_key: "/books/OL1M",
  work_key: "/works/OL1W",
  page_count: 604,
  current_page: 120,
  started_on: "2026-10-01",
  genres: ["Science Fiction"],
  created_at: "2026-01-02T10:00:00Z",
};
const form = (changes: Partial<BookEditForm> = {}): BookEditForm => ({
  status: "reading",
  rating: "",
  started_on: "2026-10-01",
  finished_on: "",
  page_count: "604",
  current_page: "120",
  isbn: "9780441172719",
  asin: "",
  cover_url: "",
  publisher: "",
  binding: "",
  edition_year: "",
  original_published_year: "",
  height_mm: "",
  thickness_mm: "",
  genres: "Science Fiction",
  tbr_added_on: "",
  series_name: "",
  series_number: "",
  series_total: "",
  notes: "",
  ...changes,
});
const ctx = { today, hasChapters: false };
const ok = (r: ReturnType<typeof applyBookEdits>) => {
  if ("error" in r) throw new Error(r.error);
  return r.book;
};
const error = (r: ReturnType<typeof applyBookEdits>) => ("error" in r ? r.error : null);

describe("legacy saveBook rules", () => {
  test("a finished or DNF book cannot be switched back to reading (use Start reread)", () => {
    for (const status of ["finished", "dnf"]) {
      expect(error(applyBookEdits({ ...book, status }, form({ status: "reading" }), ctx))).toMatch(
        /Start reread/,
      );
    }
  });

  test("finishing without a date uses today, but never overwrites a year-only historical finish", () => {
    expect(ok(applyBookEdits(book, form({ status: "finished" }), ctx)).finished_on).toBe(today);
    const yearOnly = {
      ...book,
      status: "finished",
      read_history: [
        { number: 1, status: "finished", started_on: null, finished_on: null, finished_year: 2019 },
      ],
    };
    expect(ok(applyBookEdits(yearOnly, form({ status: "finished" }), ctx)).finished_on).toBeNull();
  });

  test("finishing sets current page to the page count; other statuses clear the finish date", () => {
    expect(ok(applyBookEdits(book, form({ status: "finished" }), ctx)).current_page).toBe(604);
    expect(
      ok(applyBookEdits(book, form({ status: "tbr", finished_on: "2026-11-01" }), ctx)).finished_on,
    ).toBeNull();
  });

  test("changing the ISBN clears the matched edition, and is blocked while chapters exist", () => {
    const changed = ok(applyBookEdits(book, form({ isbn: "0-441-17271-7" }), ctx));
    expect(changed.isbn).toBe("0441172717");
    expect(changed.edition_key).toBeNull();
    expect(changed.work_key).toBeNull();
    expect(
      error(applyBookEdits(book, form({ isbn: "0441172717" }), { ...ctx, hasChapters: true })),
    ).toMatch(/chapter maps/);
    expect(ok(applyBookEdits(book, form(), { ...ctx, hasChapters: true })).edition_key).toBe(
      "/books/OL1M",
    );
  });

  test("identifiers, cover URL, years, pages and dimensions are validated", () => {
    const cases: [Partial<BookEditForm>, RegExp][] = [
      [{ isbn: "9780441172710" }, /valid ISBN/],
      [{ asin: "B0SHORT" }, /ASIN/],
      [{ cover_url: "http://example.com/c.jpg" }, /HTTPS/],
      [{ cover_url: "https://user:pass@example.com/c.jpg" }, /password/],
      [{ edition_year: "1499" }, /1500–2099/],
      [{ page_count: "0" }, /positive whole number/],
      [{ current_page: "605" }, /between 0 and the book page count/],
      [{ current_page: "-1" }, /between 0/],
      [{ height_mm: "-3" }, /dimensions/],
      [{ series_total: "501" }, /between 1 and 500/],
    ];
    for (const [change, message] of cases)
      expect(error(applyBookEdits(book, form(change), ctx)), JSON.stringify(change)).toMatch(
        message,
      );
  });

  test("TBR added date defaults to the existing date, then creation date", () => {
    expect(
      ok(applyBookEdits({ ...book, status: "tbr" }, form({ status: "tbr" }), ctx)).tbr_added_on,
    ).toBe("2026-01-02");
    expect(ok(applyBookEdits(book, form({ status: "tbr" }), ctx)).tbr_added_on).toBe(today);
  });

  test("the latest read pass follows the edited status and dates; earlier passes are kept", () => {
    const reread = {
      ...book,
      read_history: [
        {
          number: 1,
          status: "finished",
          started_on: "2020-01-01",
          finished_on: "2020-02-01",
          finished_year: 2020,
        },
        {
          number: 2,
          status: "reading",
          started_on: "2026-10-01",
          finished_on: null,
          finished_year: null,
        },
      ],
    };
    const saved = ok(
      applyBookEdits(reread, form({ status: "finished", finished_on: "2026-11-18" }), ctx),
    );
    const passes = saved.read_history as { finished_on: string | null }[];
    expect(passes[0].finished_on).toBe("2020-02-01");
    expect(passes[1].finished_on).toBe("2026-11-18");
  });

  test("series total provenance: catalog-applied, unchanged, or manual", () => {
    const proposal = {
      series_name: "Dune",
      series_number: 1,
      series_total: 6,
      source_url: "https://www.listofbooks.net/series/dune",
    };
    const fromCatalog = ok(
      applyBookEdits(book, form({ series_name: "Dune", series_number: "1", series_total: "6" }), {
        ...ctx,
        seriesProposal: proposal,
      }),
    );
    expect(fromCatalog.series_total_source).toBe("listofbooks");
    expect(fromCatalog.series_source_url).toBe(proposal.source_url);
    const manual = ok(applyBookEdits(book, form({ series_name: "Dune", series_total: "7" }), ctx));
    expect(manual.series_total_source).toBe("manual");
    expect(manual.series_source_url).toBeNull();
  });
});

describe("server-side bounds (new: legacy only validated in the browser)", () => {
  test("rejects values the legacy form controls could not produce", () => {
    const cases: [Partial<BookEditForm>, RegExp][] = [
      [{ status: "deleted" }, /valid reading status/],
      [{ rating: "4.1" }, /quarter steps/],
      [{ rating: "9" }, /quarter steps/],
      [{ started_on: "2026-02-30" }, /valid start date/],
      [{ notes: "x".repeat(20_001) }, /Notes/],
      [{ genres: Array.from({ length: 21 }, (_, i) => `G${i}`).join(",") }, /genres/],
      [{ series_number: "1000" }, /Installment/],
    ];
    for (const [change, message] of cases)
      expect(error(applyBookEdits(book, form(change), ctx)), JSON.stringify(change)).toMatch(
        message,
      );
  });

  test("accepts quarter-star ratings", () => {
    expect(ok(applyBookEdits(book, form({ rating: "4.75" }), ctx)).rating).toBe(4.75);
    expect(ok(applyBookEdits(book, form({ rating: "" }), ctx)).rating).toBeNull();
  });
});
