// Ported from legacy/tests/goodreads-and-enrichment.test.mjs. Assertions unchanged.
import { test } from "vitest";
import { stubbable } from "./helpers";
import assert from "node:assert/strict";
import { dailyGoalTimeSeries, dailyReadingGoalStats } from "@/lib/reading-metrics";
import { enrichBookMetadata, normalizeGenres } from "@/lib/catalog";

test("dailyGoalTimeSeries and dailyReadingGoalStats skip days before activeFrom account creation", () => {
  const sessions = [{ session_date: "2026-11-16", duration_minutes: 35, activity_mode: "reading" }];
  const series = dailyGoalTimeSeries(sessions, {
    targetMinutes: 30,
    today: "2026-11-16",
    periodStart: "2026-11-01",
    periodEnd: "2026-11-30",
    activeFrom: "2026-11-16",
  });
  const nov15 = series.find((x) => x.key === "2026-11-15");
  const nov16 = series.find((x) => x.key === "2026-11-16");
  assert.equal(nov15.future, true);
  assert.equal(nov15.targetMinutes, 0);
  assert.equal(nov16.future, false);
  assert.equal(nov16.targetMinutes, 30);
  assert.equal(nov16.actualMinutes, 35);

  const stats = dailyReadingGoalStats(sessions, {
    targetMinutes: 30,
    today: "2026-11-16",
    periodStart: "2026-11-01",
    periodEnd: "2026-11-30",
    activeFrom: "2026-11-16",
  });
  assert.equal(stats.evaluatedDays, 1);
  assert.equal(stats.daysMet, 1);
  assert.equal(stats.currentGoalStreak, 1);
});

test("normalizeGenres maps noisy library subjects and BISAC strings to clean genres", () => {
  const genres = normalizeGenres([
    "Accessible book",
    "Fiction, science fiction, general",
    "Biography & Autobiography / Sports",
    "Large type books",
    "New York Times bestseller",
  ]);
  assert.deepEqual(genres, ["Science Fiction", "Biography", "Sports & Fitness"]);
});

test("enrichBookMetadata preserves existing verified cover and normalizes genres", async () => {
  const original = stubbable.fetch;
  stubbable.fetch = async (url) => {
    const s = String(url);
    if (s.includes("openlibrary.org/search.json")) {
      return {
        ok: true,
        json: async () => ({
          docs: [
            {
              key: "/works/OL893415W",
              title: "Dune",
              author_name: ["Frank Herbert"],
              cover_i: 999999,
              subject: ["Accessible book", "Science fiction", "Desert ecology"],
            },
          ],
        }),
      };
    }
    return { ok: true, json: async () => ({ items: [] }) };
  };
  try {
    const enriched = await enrichBookMetadata(
      {
        title: "Dune (Dune, #1)",
        author: "Frank Herbert",
        isbn: null,
        cover_url: "https://covers.openlibrary.org/b/id/11481354-M.jpg",
        genres: [],
      },
      "",
      { preserveCover: true, forceGenres: true },
    );
    assert.equal(enriched.cover_url, "https://covers.openlibrary.org/b/id/11481354-M.jpg");
    assert.deepEqual(enriched.genres, ["Science Fiction"]);
  } finally {
    stubbable.fetch = original;
  }
});
