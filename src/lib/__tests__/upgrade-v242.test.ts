// Ported from legacy/tests/upgrade-v242.test.mjs. Assertions unchanged.
// Not ported: legacy source-text checks (app.js, service worker, legacy SQL, DemoRepo)
// and HTML-string view tests, which move to React component tests (#12):
//   - Replay celebration selects exact closed month, not current Insights and not a so-far recap
//   - Tracking starts on November 15 in the same daily goal series as the detailed graph
import { test } from "vitest";
import type { BookInput } from "@/lib/types";
import assert from "node:assert/strict";
import { parseGoodreads, prepareGoodreadsImport, sameBook } from "@/lib/goodreads-import";
import { parseSeriesFromTitle, seriesMetadata, seriesStatistics } from "@/lib/series-insights";
import { tbrTransitions } from "@/lib/tbr-transitions";
import { insightBooks } from "@/lib/library-drilldown";
import { libraryStatistics } from "@/lib/reading-habits";

const book = (id, extra: BookInput = {}): BookInput => ({
  id,
  title: id,
  author: "Reader",
  status: "tbr",
  rating: null,
  genres: [],
  ...extra,
});
const session = (id, mode, minutes, pages) => ({
  user_book_id: id,
  activity_mode: mode,
  duration_minutes: minutes,
  pages_read: pages,
});
test("Goodreads title suffix populates editable series and order without guessing total size", () => {
  assert.deepEqual(parseSeriesFromTitle("Dune (Dune #1)"), {
    title: "Dune",
    series_name: "Dune",
    series_number: 1,
  });
  assert.deepEqual(parseSeriesFromTitle("The Well of Ascension (Mistborn, #2)"), {
    title: "The Well of Ascension",
    series_name: "Mistborn",
    series_number: 2,
  });
  assert.deepEqual(parseSeriesFromTitle("Side Story (Series #2.5)"), {
    title: "Side Story",
    series_name: "Series",
    series_number: 2.5,
  });
  assert.equal(parseSeriesFromTitle("Nonfiction (Revised Edition)"), null);
  const csv = `Title,Author,Exclusive Shelf,My Rating,Date Read\n"Dune (Dune #1)",Frank Herbert,read,5,2023/08/10\n"Dune Messiah (Dune #2)",Frank Herbert,to-read,0,`;
  const parsed = parseGoodreads(csv, {
    userId: "alice",
    uuid: (() => {
      let i = 0;
      return () => String(++i);
    })(),
  });
  assert.equal(parsed[0].title, "Dune (Dune #1)");
  assert.equal(parsed[0].series_name, "Dune");
  assert.equal(parsed[0].series_number, 1);
  assert.equal(parsed[0].series_total, null);
  assert.equal(parsed[1].series_number, 2);
  assert.equal(
    seriesMetadata({ ...parsed[0], series_name: "Custom title", series_number: 4 }).series_number,
    4,
  );
  assert.equal(sameBook(parsed[0], book("1", { title: "Dune", author: "Frank Herbert" })), true);
  const update = prepareGoodreadsImport(parsed, [
    book("1", { title: "Dune", author: "Frank Herbert", series_name: null, series_number: null }),
  ]);
  assert.equal(update.additions.length, 1);
  assert.equal(update.updates[0].series_name, "Dune");
});

test("Series completion requires verified total and all numbered entries; per-book speed is real", () => {
  const a = book("1", { title: "A (Dune #1)", status: "finished", rating: 4, series_total: 3 });
  const b = book("2", { title: "B (Dune #2)", status: "finished", rating: 4.5 });
  const c = book("3", { title: "C (Dune #3)", status: "reading", rating: 5 });
  let stats = seriesStatistics(
    [a, b, c],
    [
      session("1", "reading", 60, 40),
      session("2", "audiobook", 30, 22),
      session("3", "read_listen", 45, null),
    ],
  );
  assert.equal(stats.fullSeries, 0);
  assert.equal(stats.startedNotComplete, 1);
  assert.deepEqual(
    stats.series[0].rows.map((b) => b.number),
    [1, 2, 3],
  );
  assert.equal(stats.series[0].rows[0].speed.overall.pagesPerHour, 40);
  assert.equal(stats.series[0].rows[1].speed.audiobook.pagesPerHour, 44);
  assert.equal(stats.series[0].rows[2].speed.overall.pagesPerHour, null);
  stats = seriesStatistics([a, b, { ...c, status: "finished" }]);
  assert.equal(stats.fullSeries, 1);
  stats = seriesStatistics([{ ...a, series_total: null }, b, { ...c, status: "finished" }]);
  assert.equal(stats.fullSeries, 0);
  assert.equal(stats.unverified, 1);
});

test("Library genre totals reflect all tags and status edits, with no stale primary-only grouping", () => {
  const base = [
    book("a", { genres: ["Fantasy", "Adventure"], status: "tbr", rating: 4.5 }),
    book("b", { genres: ["Fantasy"], status: "finished", rating: 5 }),
  ];
  let report = libraryStatistics(base, { today: "2026-11-18" });
  assert.deepEqual(
    [
      report.genres.find((x) => x.genre === "Adventure").read,
      report.genres.find((x) => x.genre === "Adventure").unread,
    ],
    [0, 1],
  );
  assert.deepEqual(
    [
      report.genres.find((x) => x.genre === "Fantasy").read,
      report.genres.find((x) => x.genre === "Fantasy").unread,
    ],
    [1, 1],
  );
  assert.deepEqual(
    insightBooks(base, { kind: "genre-read", value: "Fantasy" }).map((b) => b.id),
    ["b"],
  );
  assert.deepEqual(
    insightBooks(base, { kind: "rating", value: "4.5" }).map((b) => b.id),
    ["a"],
  );
  assert.equal(insightBooks(base, { kind: "genre-rating", value: "Adventure" }).length, 1);
  const changed = [{ ...base[0], genres: ["Adventure", "Memoir"], status: "finished" }, base[1]];
  report = libraryStatistics(changed, { today: "2026-11-18" });
  assert.equal(report.genres.find((x) => x.genre === "Memoir").read, 1);
  assert.equal(report.genres.find((x) => x.genre === "Fantasy").books, 1);
  assert.deepEqual(insightBooks(changed, { kind: "genre-unread", value: "Adventure" }), []);
});

test("TBR charts drill down to actual dated titles and track to reading/finish by all genres", () => {
  const books = [
    book("a", {
      genres: ["Fantasy", "Adventure"],
      status: "finished",
      tbr_added_on: "2026-01-01",
      started_on: "2026-01-11",
      finished_on: "2026-02-01",
    }),
    book("b", {
      genres: ["Thriller"],
      status: "reading",
      goodreads_added_on: "2026-01-01",
      started_on: "2026-01-03",
    }),
    book("c", { genres: ["Fantasy"], status: "tbr", tbr_added_on: "2026-11-10" }),
    book("d", {
      genres: ["Fantasy"],
      status: "finished",
      goodreads_added_on: "2026-03-15",
      finished_on: "2026-03-10",
    }),
  ];
  const t = tbrTransitions(books);
  assert.deepEqual([t.overall.toStartCount, t.overall.toFinishCount], [2, 1]);
  assert.equal(t.overall.meanToStart, 6);
  assert.equal(t.overall.meanToFinish, 31);
  assert.equal(t.byGenre.find((g) => g.genre === "Adventure").meanToFinish, 31);
  assert.equal(t.byGenre.find((g) => g.genre === "Thriller").approximateCount, 1);
  assert.deepEqual(
    insightBooks(books, { kind: "tbr-age", value: "0-30", today: "2026-11-18" }).map((x) => x.id),
    ["c"],
  );
});
