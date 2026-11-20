// Ported from legacy/tests/reread-comparisons.test.mjs. Assertions unchanged.
import { test } from "vitest";
import assert from "node:assert/strict";
import { readingPassMetrics, rereadComparisonStats, passModeLabel } from "@/lib/reading-history";
const book = {
  id: "b1",
  title: "Jurassic Park",
  status: "finished",
  started_on: "2026-03-01",
  finished_on: "2026-03-16",
  read_history: [
    { number: 1, status: "finished", started_on: "2025-01-01", finished_on: "2025-01-20" },
    { number: 2, status: "finished", started_on: "2026-03-01", finished_on: "2026-03-16" },
  ],
};
const sessions = [
  {
    user_book_id: "b1",
    read_number: 1,
    session_date: "2025-01-01",
    duration_minutes: 60,
    pages_read: 40,
    activity_mode: "reading",
  },
  {
    user_book_id: "b1",
    read_number: 1,
    session_date: "2025-01-01",
    duration_minutes: 30,
    pages_read: 20,
    activity_mode: "reading",
  },
  {
    user_book_id: "b1",
    read_number: 1,
    session_date: "2025-01-05",
    duration_minutes: 30,
    pages_read: 20,
    activity_mode: "audiobook",
  },
  {
    user_book_id: "b1",
    read_number: 2,
    session_date: "2026-03-02",
    duration_minutes: 45,
    pages_read: 30,
    activity_mode: "audiobook",
  },
  {
    user_book_id: "b1",
    read_number: 2,
    session_date: "2026-03-03",
    duration_minutes: 15,
    pages_read: 20,
    activity_mode: "read_listen",
  },
  {
    user_book_id: "b1",
    read_number: 2,
    session_date: "2026-03-03",
    duration_minutes: 30,
    pages_read: null,
    activity_mode: "audiobook",
  },
];
test("per-pass totals, mode shares and reading days do not double-count combined logs", () => {
  const [a, b] = readingPassMetrics(book, sessions);
  assert.equal(a.recordedMinutes, 120);
  assert.equal(b.recordedMinutes, 90);
  assert.equal(a.sessionCount, 3);
  assert.equal(a.activeDays, 2);
  assert.equal(a.elapsedDays, 20);
  assert.equal(b.activeDays, 2);
  assert.equal(b.elapsedDays, 16);
  assert.equal(a.primaryMode, "reading");
  assert.equal(b.primaryMode, "audiobook");
  assert.equal(
    a.modeShares.reduce((s, x) => s + x.minutes, 0),
    120,
  );
  assert.equal(
    b.modeShares.reduce((s, x) => s + x.minutes, 0),
    90,
  );
  assert.equal(b.modeShares.find((x) => x.id === "read_listen")!.minutes, 15);
  assert.equal(b.pagesPerHour, 50); // position-only 30m excluded; (30+20)/60m
  assert.equal(passModeLabel(null), "Not recorded");
});
test("paired reread summary uses only completed, fully timed passes", () => {
  const results = rereadComparisonStats([book], sessions);
  assert.equal(results.pairedTimeCount, 1);
  assert.equal(results.avgFirstMinutes, 120);
  assert.equal(results.avgRereadMinutes, 90);
  assert.equal(results.avgFirstSessions, 3);
  assert.equal(results.avgRereadSessions, 3);
  assert.equal(results.methodChanges, 1);
  assert.deepEqual(results.mostCommonSwitch, { from: "reading", to: "audiobook", count: 1 });
});
test("imported first read with no sessions is unknown, never zero or inferred", () => {
  const a = readingPassMetrics(
    book,
    sessions.filter((x) => x.read_number === 2),
  );
  assert.equal(a[0].recordedMinutes, null);
  assert.equal(a[0].primaryMode, null);
  assert.equal(a[0].sessionCount, 0);
  assert.equal(a[0].elapsedDays, 20);
  const results = rereadComparisonStats(
    [book],
    sessions.filter((x) => x.read_number === 2),
  );
  assert.equal(results.pairedTimeCount, 0);
  assert.equal(results.avgFirstMinutes, null);
  assert.equal(results.mostCommonSwitch, null);
});
test("multi-pass history retains every reread for individual comparisons", () => {
  const third = {
    ...book,
    read_history: [
      ...book.read_history,
      { number: 3, status: "reading", started_on: "2026-08-01", finished_on: null },
    ],
  };
  const result = rereadComparisonStats([third], sessions, { today: "2026-08-05" });
  assert.equal(result.entries[0].rereads.length, 2);
  assert.equal(result.entries[0].latest.number, 3);
  assert.equal(result.entries[0].latest.elapsedDays, 5);
  assert.equal(result.pairedTimeCount, 1); // latest completed reread still qualifies
});
test("incomplete logged duration is labeled partial and excluded from paired averages", () => {
  const bad = [
    ...sessions,
    {
      user_book_id: "b1",
      read_number: 1,
      session_date: "2025-01-03",
      duration_minutes: null,
      pages_read: 20,
      activity_mode: "reading",
    },
  ];
  const a = readingPassMetrics(book, bad)[0];
  assert.equal(a.timeComplete, false);
  assert.equal(a.recordedMinutes, 120);
  assert.equal(rereadComparisonStats([book], bad).pairedTimeCount, 0);
});
test("unknown primary method is not guessed from session counts or page data", () => {
  const unknown = [
    {
      user_book_id: "b1",
      read_number: 1,
      session_date: "2025-01-04",
      activity_mode: "reading",
      pages_read: 50,
      duration_minutes: null,
    },
  ];
  const a = readingPassMetrics(book, unknown)[0];
  assert.equal(a.primaryMode, null);
  assert.equal(a.recordedPages, 50);
  assert.equal(a.pagesPerHour, null);
});

test("overview retains the newest completed reread while another reread is active", () => {
  const third = {
    ...book,
    read_history: [
      ...book.read_history,
      { number: 3, status: "reading", started_on: "2026-08-01", finished_on: null },
    ],
  };
  const result = rereadComparisonStats([third], sessions, { today: "2026-08-05" });
  assert.equal(result.entries[0].latest.number, 3);
  assert.equal(result.pairedTimeCount, 1);
  assert.equal(result.avgFirstMinutes, 120);
  assert.equal(result.avgRereadMinutes, 90);
});
