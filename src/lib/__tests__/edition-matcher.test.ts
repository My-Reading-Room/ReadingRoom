// Ported from legacy/tests/edition-matcher.test.mjs. Assertions unchanged.
// Not ported: legacy source-text checks (app.js, service worker, legacy SQL, DemoRepo)
// and HTML-string view tests, which move to React component tests (#12):
//   - catalog additions preserve exact edition fields; database migration extends metadata
import { test } from "vitest";
import { stubbable } from "./helpers";
import assert from "node:assert/strict";
import {
  editionMatchDetails,
  normalizeBinding,
  normalizeGenres,
  enrichBookMetadata,
} from "@/lib/catalog";

const response = (body) => ({ ok: true, json: async () => body });
const demo = {
  title: "Dune (Dune, #1)",
  author: "Frank Herbert",
  isbn: null,
  publisher: "Ace Books",
  binding: "Mass Market Paperback",
  page_count: 412,
  edition_year: 2005,
  original_published_year: 1965,
  published_year: 2005,
  cover_url: "https://example.invalid/my-existing-cover.jpg",
  genres: [],
};
const editions = [
  {
    key: "/books/OLbestM",
    title: "Dune",
    publish_date: "August 2005",
    publishers: ["Ace Books"],
    physical_format: "Mass Market Paperback",
    number_of_pages: 412,
    isbn_13: ["9780441172719"],
    covers: [123],
  },
  {
    key: "/books/OLotherM",
    title: "Dune",
    publish_date: "2020",
    publishers: ["New Publisher"],
    physical_format: "Hardcover",
    number_of_pages: 630,
    isbn_13: ["9780987654321"],
    covers: [124],
  },
];

test("normalizes the genre cases from the uploaded Goodreads tests", () => {
  assert.deepEqual(normalizeGenres(["Biography & Autobiography / Sports"]), [
    "Biography",
    "Sports & Fitness",
  ]);
  assert.deepEqual(normalizeGenres(["Science fiction", "Desert ecology"]), ["Science Fiction"]);
  assert.deepEqual(normalizeGenres(["Memoir", "Psychology"]), ["Memoir", "Psychology"]);
});

test("edition matching scores all five Goodreads fields and normalizes binding", () => {
  assert.equal(normalizeBinding("Mass Market Paperback"), "mass_market");
  assert.equal(normalizeBinding("Trade Paperback"), "paperback");
  const match = editionMatchDetails(demo, { ...editions[0], first_publish_year: 1965 });
  assert.equal(match.confident, true);
  for (const label of ["publisher", "binding", "pages", "edition year", "original year"])
    assert.ok(match.evidence.includes(label), label);
  assert.ok(
    match.score > editionMatchDetails(demo, { ...editions[1], first_publish_year: 1965 }).score,
  );
});

test("conflicting ISBN cannot silently change a known edition identity", () => {
  const found = editionMatchDetails({ ...demo, isbn: "9781111111111" }, editions[0]);
  assert.equal(found.conflictingISBN, true);
  assert.equal(found.confident, false);
  const exact = editionMatchDetails({ ...demo, isbn: "9780441172719" }, editions[0]);
  assert.equal(exact.exactISBN, true);
  assert.equal(exact.confident, true);
  const noISBN = editionMatchDetails(
    { ...demo, isbn: "9780441172719" },
    { ...editions[0], isbn_13: [] },
  );
  assert.equal(
    noISBN.confident,
    false,
    "Known ISBN needs direct confirmation, not just similar metadata",
  );
});

test("publisher/cover alone do not create a false edition match", () => {
  const weak = editionMatchDetails(
    { title: "Dune", author: "Frank Herbert", publisher: "Ace" },
    { publishers: ["Ace Books"], covers: [1], isbn_13: ["9780441172719"] },
  );
  assert.equal(weak.confident, false);
});

test("metadata lookup matches a unique edition but preserves existing cover/page count", async () => {
  const original = stubbable.fetch;
  const urls = [];
  stubbable.fetch = async (url) => {
    urls.push(String(url));
    if (String(url).includes("/search.json"))
      return response({
        docs: [
          {
            key: "/works/OLduneW",
            title: "Dune",
            author_name: ["Frank Herbert"],
            first_publish_year: 1965,
            publisher: ["Ace Books"],
            cover_i: 1000,
            subject: ["Science Fiction", "Desert ecology"],
          },
        ],
      });
    if (String(url).includes("/editions.json")) return response({ entries: editions });
    if (String(url).includes("googleapis.com")) return response({ items: [] });
    throw Error("Unexpected URL: " + url);
  };
  try {
    const b = await enrichBookMetadata(demo, "", { matchEdition: true });
    assert.ok(urls.some((url) => url.includes("/editions.json")));
    assert.equal(b.edition_key, "/books/OLbestM");
    assert.equal(b.isbn, "9780441172719");
    assert.equal(b.page_count, 412);
    assert.equal(b.cover_url, demo.cover_url);
    assert.equal(b.publisher, demo.publisher);
    assert.equal(b.binding, demo.binding);
    assert.equal(b.edition_year, 2005);
    assert.equal(b.original_published_year, 1965);
    assert.deepEqual(b.genres, ["Science Fiction"]);
  } finally {
    stubbable.fetch = original;
  }
});

test("ambiguous editions remain unmatched; do not fabricate ISBN or page count", async () => {
  const original = stubbable.fetch;
  const same = { ...editions[0], key: "/books/OLtieM", isbn_13: ["9782222222222"], covers: [124] };
  stubbable.fetch = async (url) => {
    if (String(url).includes("/search.json"))
      return response({
        docs: [
          {
            key: "/works/OLduneW",
            title: "Dune",
            author_name: ["Frank Herbert"],
            first_publish_year: 1965,
            subject: ["Science Fiction"],
          },
        ],
      });
    if (String(url).includes("/editions.json")) return response({ entries: [editions[0], same] });
    if (String(url).includes("googleapis.com")) return response({ items: [] });
    throw Error("Unexpected URL: " + url);
  };
  try {
    const b = await enrichBookMetadata({ ...demo, isbn: null, cover_url: null }, "", {
      matchEdition: true,
    });
    assert.equal(b.edition_key, null);
    assert.equal(b.isbn, "");
    assert.equal(b.page_count, demo.page_count);
    assert.deepEqual(b.genres, ["Science Fiction"]);
  } finally {
    stubbable.fetch = original;
  }
});

test("direct ISBN lookup wins and does not replace user-supplied ISBN", async () => {
  const original = stubbable.fetch;
  stubbable.fetch = async (url) => {
    if (String(url).includes("/isbn/"))
      return response({ ...editions[0], works: [{ key: "/works/OLduneW" }] });
    if (String(url).includes("/search.json")) return response({ docs: [] });
    if (String(url).includes("googleapis.com")) return response({ items: [] });
    throw Error("Unexpected URL: " + url);
  };
  try {
    const b = await enrichBookMetadata({ ...demo, isbn: "9780441172719" }, "", {
      matchEdition: true,
    });
    assert.equal(b.isbn, "9780441172719");
    assert.equal(b.edition_key, "/books/OLbestM");
    assert.equal(b.work_key, "/works/OLduneW");
  } finally {
    stubbable.fetch = original;
  }
});
