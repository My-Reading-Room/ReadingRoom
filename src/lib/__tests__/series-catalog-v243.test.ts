// Ported from legacy/tests/series-catalog-v243.test.mjs. Assertions unchanged.
// Not ported: legacy source-text checks (app.js, service worker, legacy SQL, DemoRepo)
// and HTML-string view tests, which move to React component tests (#12).
// The serverless series-lookup handler tests are rewritten with its route (#10):
//   - Vercel proxy keeps token secret, validates modes, credits source, handles absent key
//   - Application includes Series Details UI, provider fallback, updated migration and cache
import { test } from "vitest";
import assert from "node:assert/strict";
import {
  normalizeSeriesResult,
  catalogSeriesMatch,
  proposedSeriesFields,
  fillMissingSeriesFields,
  fetchSeriesLookup,
  isSeriesLookupConfigured,
} from "@/lib/series-catalog";
import { enrichAfterGoodreadsImport } from "@/lib/import-enrichment";

const provider = {
  title: "Dune",
  author: "Frank Herbert",
  url: "https://www.listofbooks.net/series/dune?utm_source=api",
  order: "publication",
  totalBooks: 6,
  books: [
    { title: "Dune", position: 1, number: 1, role: "core", year: 1965 },
    { title: "Dune Messiah", position: 2, number: 2, role: "core", year: 1969 },
    { title: "Children of Dune", position: 3, number: 3, role: "core", year: 1976 },
  ],
};
const csvBook = (title, number, id) => ({
  id,
  title,
  author: "Frank Herbert",
  series_name: "Dune",
  series_number: number,
  series_total: null,
  genres: ["Science Fiction"],
  isbn: "9781234567897",
  status: "finished",
});

test("Source normalize / exact series and author match; rejects unrelated or malicious source", () => {
  const p = normalizeSeriesResult(provider);
  assert.equal(p.totalBooks, 6);
  assert.equal(p.books.length, 3);
  assert.equal(
    catalogSeriesMatch(p, { seriesName: "Dune", author: "Frank Herbert", title: "Dune (Dune #1)" }),
    true,
  );
  assert.equal(
    catalogSeriesMatch(p, { seriesName: "Dune Chronicles", author: "Frank Herbert" }),
    false,
  );
  assert.equal(catalogSeriesMatch(p, { seriesName: "Dune", author: "Another Person" }), false);
  assert.equal(normalizeSeriesResult({ ...provider, url: "javascript:alert(1)" }), null);
});
test("Fill blank series fields and count but never override manually specified total or wrong author", () => {
  const source = normalizeSeriesResult(provider),
    book = csvBook("Dune (Dune #1)", 1, "a");
  const updated = fillMissingSeriesFields(book, source);
  assert.equal(updated.series_total, 6);
  assert.equal(updated.series_total_source, "listofbooks");
  assert.match(updated.series_source_url, /listofbooks.net/);
  assert.equal(book.series_total, null, "pure helper never mutates its input");
  assert.equal(
    fillMissingSeriesFields({ ...book, series_total: 3 }, source),
    null,
    "manual total is authoritative",
  );
  assert.equal(fillMissingSeriesFields({ ...book, author: "J. R. R. Tolkien" }, source), null);
  assert.equal(
    proposedSeriesFields({ ...book, series_number: 9 }, source).series_total,
    null,
    "No misleading total lower than installment",
  );
});
test("Lookup uses the app origin and supports book-level matching and status checks", async () => {
  const seen = [];
  const fetcher = async (path) => {
    seen.push(path);
    return {
      ok: true,
      json: async () =>
        path.includes("mode=status") ? { configured: true } : { result: provider },
    };
  };
  const a = await fetchSeriesLookup({ series: "Dune", fetcher });
  const b = await fetchSeriesLookup({ title: "Dune", author: "Frank Herbert", fetcher });
  assert.equal(a.title, "Dune");
  assert.equal(b.title, "Dune");
  assert.match(seen[0], /^\/api\/series-lookup\?mode=series&series=Dune/);
  assert.match(seen[1], /mode=book&title=Dune&author=Frank\+Herbert/);
  assert.equal(await isSeriesLookupConfigured(fetcher), true);
});
test("Import enriches only distinct missing series, not all books or manually defined totals", async () => {
  const books = [
    csvBook("Dune (Dune #1)", 1, "1"),
    csvBook("Dune Messiah (Dune #2)", 2, "2"),
    { ...csvBook("Children (Dune #3)", 3, "3"), series_total: 6 },
  ];
  const stored = [],
    queries = [];
  const result = await enrichAfterGoodreadsImport(books, {
    pacingMs: 0,
    seriesPacingMs: 0,
    save: async (b) => stored.push({ ...b }),
    seriesConfigured: async () => true,
    seriesLookup: async (args) => {
      queries.push(args);
      return normalizeSeriesResult(provider);
    },
    isbnBatchLookup: async () => {
      throw Error("Genres already present");
    },
    fullBookLookup: async () => {
      throw Error("No enrichment required");
    },
  });
  assert.equal(result.total, 0);
  assert.equal(result.seriesChecked, 1);
  assert.equal(result.seriesFilled, 2);
  assert.equal(queries.length, 1);
  assert.equal(stored.length, 2);
  assert.deepEqual(
    stored.map((x) => x.series_total),
    [6, 6],
  );
  assert.equal(books[2].series_total, 6);
});
test("Provider not configured means import still succeeds, original series fields remain editable", async () => {
  const books = [csvBook("Dune (Dune #1)", 1, "1")];
  let count = 0;
  const res = await enrichAfterGoodreadsImport(books, {
    pacingMs: 0,
    save: async () => {
      count++;
    },
    seriesConfigured: async () => false,
  });
  assert.equal(res.saved, 0);
  assert.equal(res.seriesDeferred, 1);
  assert.equal(count, 0);
});
