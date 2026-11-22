// Ported from legacy/tests/genre-picker-v234.test.mjs. Assertions unchanged,
// except assertions on app.js source text (genre picker markup moves to #12).
import { test } from "vitest";
import assert from "node:assert/strict";
import { STANDARD_GENRES, normalizeGenres } from "@/lib/catalog";
import {
  selectedGenres,
  addSelectedGenre,
  removeSelectedGenre,
  primarySelectedGenre,
} from "@/lib/book-detail-metadata";

test("manual and edit pickers share one canonical genre taxonomy with catalog enrichment", () => {
  assert.equal(STANDARD_GENRES.length, 26);
  assert.equal(new Set(STANDARD_GENRES).size, STANDARD_GENRES.length);
  assert.deepEqual(
    STANDARD_GENRES,
    [...STANDARD_GENRES].sort((a, b) => a.localeCompare(b)),
  );
  assert.ok(STANDARD_GENRES.includes("Science Fiction"));
  assert.ok(STANDARD_GENRES.includes("Fantasy"));
  assert.ok(STANDARD_GENRES.includes("Business & Finance"));
  for (const canonical of STANDARD_GENRES)
    assert.deepEqual(normalizeGenres([canonical]), [canonical]);
});

test("new genres must be selected from catalog standardized options", () => {
  assert.deepEqual(addSelectedGenre([], "Science Fiction"), ["Science Fiction"]);
  assert.deepEqual(addSelectedGenre(["Fantasy"], "science fiction"), [
    "Fantasy",
    "Science Fiction",
  ]);
  assert.deepEqual(addSelectedGenre(["Science Fiction"], "Science Fiction"), ["Science Fiction"]);
  assert.throws(() => addSelectedGenre([], "Fantasy, Random"), /standardized dropdown/);
  assert.throws(() => addSelectedGenre([], "custom whatever"), /standardized dropdown/);
  assert.throws(() => addSelectedGenre([], ""), /standardized dropdown/);
});

test("first selected genre remains primary for insights and can be explicitly reordered", () => {
  const genres = addSelectedGenre(["Science Fiction"], "Adventure");
  assert.deepEqual(genres, ["Science Fiction", "Adventure"]);
  assert.deepEqual(primarySelectedGenre(genres, "Adventure"), ["Adventure", "Science Fiction"]);
  assert.deepEqual(removeSelectedGenre(genres, "Science Fiction"), ["Adventure"]);
  assert.throws(() => primarySelectedGenre(genres, "Western"), /not assigned/);
});

test("existing nonstandard imported genres are not erased by editing unrelated book fields", () => {
  const old = ["Speculative Fiction", "Fantasy", "speculative fiction"];
  assert.deepEqual(selectedGenres(old), ["Speculative Fiction", "Fantasy"]);
  const withGenre = addSelectedGenre(old, "Adventure");
  assert.deepEqual(withGenre, ["Speculative Fiction", "Fantasy", "Adventure"]);
  assert.deepEqual(removeSelectedGenre(withGenre, "Speculative Fiction"), ["Fantasy", "Adventure"]);
});

test("case variants of standard genres display as canonical categories, while legacy custom labels survive", () => {
  assert.deepEqual(selectedGenres(["Science fiction", "SCIENCE FICTION", "My personal tag"]), [
    "Science Fiction",
    "My personal tag",
  ]);
  assert.deepEqual(addSelectedGenre(["science fiction"], "Science Fiction"), ["Science Fiction"]);
});
