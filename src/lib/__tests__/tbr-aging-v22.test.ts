// Ported from legacy/tests/tbr-aging-v22.test.mjs. Assertions unchanged.
import { test } from "vitest";
import assert from "node:assert/strict";
import { TBR_AGE_BINS, tbrAgeDistribution, libraryStatistics } from "@/lib/reading-habits";

const expected = [
  ["0-30", 0, 30],
  ["31-90", 31, 90],
  ["91-180", 91, 180],
  ["181-365", 181, 365],
  ["366-730", 366, 730],
  ["731-1095", 731, 1095],
  ["1096-1460", 1096, 1460],
  ["1461-1825", 1461, 1825],
  ["1826+", 1826, Infinity],
];
test("TBR chart has contiguous age buckets through 5+ years", () => {
  assert.deepEqual(
    TBR_AGE_BINS.map((b) => [b.id, b.min, b.max]),
    expected,
  );
  assert.equal(TBR_AGE_BINS.at(-1).label, "5+ years");
});
test("one book at every boundary is categorized exactly once", () => {
  const ages = [
    0, 30, 31, 90, 91, 180, 181, 365, 366, 730, 731, 1095, 1096, 1460, 1461, 1825, 1826, 2500,
  ];
  const result = tbrAgeDistribution(
    ages.map((ageDays) => ({ ageDays, source: "tbr_added_on" })),
    3,
  );
  assert.deepEqual(
    result.buckets.map((b) => b.count),
    [2, 2, 2, 2, 2, 2, 2, 2, 2],
  );
  assert.equal(
    result.buckets.reduce((s, b) => s + b.count, 0),
    18,
  );
  assert.equal(result.known, 18);
  assert.equal(result.unknown, 3);
  assert.equal(result.estimated, 0);
});
test("missing dates stay excluded, Goodreads dates are explicitly approximate", () => {
  const books = [
    {
      id: "old",
      title: "An old TBR",
      status: "tbr",
      tbr_added_on: "2020-10-20",
      created_at: "2024-01-01T12:00:00Z",
    },
    { id: "proxy", title: "A proxy date", status: "tbr", goodreads_added_on: "2025-10-20" },
    { id: "unknown", title: "Unknown", status: "tbr" },
    { id: "finished", title: "Finished", status: "finished", tbr_added_on: "2018-01-01" },
  ];
  const x = libraryStatistics(books, { today: "2026-11-17" });
  assert.equal(x.tbr.count, 3);
  assert.equal(x.tbr.known, 2);
  assert.equal(x.tbr.unknown, 1);
  assert.equal(x.tbr.distribution.estimated, 1);
  assert.equal(x.tbr.distribution.buckets.at(-1).count, 1);
  assert.equal(
    x.tbr.distribution.buckets.reduce((n, b) => n + b.count, 0),
    2,
  );
});
