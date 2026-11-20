// Ported from legacy/tests/smoke.test.mjs. Assertions unchanged.
// Not ported: legacy source-text checks (app.js, service worker, legacy SQL, DemoRepo)
// and HTML-string view tests, which move to React component tests (#12):
//   - separate libraries, linked partner profiles and local persistence
//   - exact chapter mappings are stored with each individual book
//   - reading modes include audiobook page-equivalents and position-only sessions
//   - sharing levels are per owner/viewer and summary uses only aggregates
//   - SQL migration removes circle-wide raw-table policies and creates scoped summaries
//   - v1.2 SQL upgrade explicitly permits audiobook pages with exact chapter enforcement retained
import { test } from "vitest";
import { stubbable } from "./helpers";
import { localDate, offsetDate } from "@/lib/local-date";
import assert from "node:assert/strict";
import { searchCatalog, getEditions, toLibraryBook } from "@/lib/catalog";

test("Open Library search normalizes a work record", async () => {
  const original = stubbable.fetch;
  stubbable.fetch = async (url) => {
    if (String(url).includes("/search.json"))
      return {
        ok: true,
        json: async () => ({
          docs: [
            {
              key: "/works/OL1W",
              title: "Example Story",
              author_name: ["A. Writer"],
              first_publish_year: 2001,
              cover_i: 123,
              edition_count: 3,
            },
          ],
        }),
      };
    throw new Error("Unexpected URL: " + url);
  };
  try {
    const result = await searchCatalog("Example Story");
    assert.equal(result.length, 1);
    assert.equal(result[0].key, "/works/OL1W");
    assert.equal(result[0].edition_count, 3);
    assert.ok(result[0].cover_url.includes("123-M.jpg"));
  } finally {
    stubbable.fetch = original;
  }
});

test("Open Library editions keep exact edition ISBN and page count", async () => {
  const original = stubbable.fetch;
  stubbable.fetch = async (url) => {
    assert.ok(String(url).includes("/works/OL1W/editions.json"));
    return {
      ok: true,
      json: async () => ({
        entries: [
          {
            key: "/books/OL55M",
            title: "Example Story",
            number_of_pages: 464,
            isbn_13: ["9780000000000"],
            publish_date: "2014",
            covers: [55],
          },
        ],
      }),
    };
  };
  try {
    const editions = await getEditions({
      kind: "work",
      key: "/works/OL1W",
      title: "Example Story",
      author: "A. Writer",
    });
    assert.equal(editions[0].page_count, 464);
    assert.equal(editions[0].isbn, "9780000000000");
    const row = toLibraryBook(editions[0], "example-user", 1);
    assert.equal(row.page_count, 464);
    assert.equal(row.status, "tbr");
    assert.equal(row.rating, null);
  } finally {
    stubbable.fetch = original;
  }
});

test("date helpers return ISO dates", () => {
  assert.match(localDate(), /^\d{4}-\d{2}-\d{2}$/);
  assert.match(offsetDate(7), /^\d{4}-\d{2}-\d{2}$/);
});
