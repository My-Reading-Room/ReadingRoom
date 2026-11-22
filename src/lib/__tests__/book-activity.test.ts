// Ported from legacy/tests/book-activity.test.mjs. Assertions unchanged.
import { test } from "vitest";
import assert from "node:assert/strict";
import { bookActivitySummary } from "@/lib/reading-metrics";

const sessions = [
  {
    user_book_id: "dune",
    session_date: "2026-01-01",
    activity_mode: "reading",
    duration_minutes: 35,
    pages_read: 22,
  },
  {
    user_book_id: "dune",
    session_date: "2026-01-01",
    activity_mode: "reading",
    duration_minutes: 25,
    pages_read: 14,
  },
  {
    user_book_id: "dune",
    session_date: "2026-01-03",
    activity_mode: "audiobook",
    duration_minutes: 50,
    pages_read: 45,
  },
  {
    user_book_id: "dune",
    session_date: "2026-01-07",
    activity_mode: "read_listen",
    duration_minutes: 30,
    pages_read: 18,
  },
  {
    user_book_id: "other",
    session_date: "2026-01-04",
    activity_mode: "reading",
    duration_minutes: 20,
    pages_read: 12,
  },
];

test("multiple sessions on same date count separately but as one active reading day", () => {
  const stats = bookActivitySummary(sessions, { bookId: "dune" });
  assert.deepEqual(stats, { sessions: 4, readingDays: 3, minutes: 140, pages: 99 });
});

test("activity filters apply to both session and day counts; combined activity counts once", () => {
  assert.deepEqual(bookActivitySummary(sessions, { bookId: "dune", activityMode: "reading" }), {
    sessions: 2,
    readingDays: 1,
    minutes: 60,
    pages: 36,
  });
  assert.deepEqual(bookActivitySummary(sessions, { bookId: "dune", activityMode: "audiobook" }), {
    sessions: 1,
    readingDays: 1,
    minutes: 50,
    pages: 45,
  });
  assert.deepEqual(bookActivitySummary(sessions, { bookId: "dune", activityMode: "read_listen" }), {
    sessions: 1,
    readingDays: 1,
    minutes: 30,
    pages: 18,
  });
});

test("period filtering changes session and reading-day totals without inventing elapsed days", () => {
  const week = sessions.filter((s) => s.session_date <= "2026-01-03");
  const result = bookActivitySummary(week, { bookId: "dune" });
  assert.equal(result.sessions, 3);
  assert.equal(result.readingDays, 2);
  assert.equal(result.minutes, 110);
});

test("legacy reading mode and records with missing duration do not inflate totals", () => {
  const data = [
    { user_book_id: "a", session_date: "2026-02-01", duration_minutes: 30, pages_read: 12 },
    { user_book_id: "a", session_date: "2026-02-02", duration_minutes: null, pages_read: null },
    { user_book_id: "a", session_date: "not-a-date", duration_minutes: 20, pages_read: 2 },
  ];
  assert.deepEqual(bookActivitySummary(data, { bookId: "a", activityMode: "reading" }), {
    sessions: 3,
    readingDays: 2,
    minutes: 50,
    pages: 14,
  });
});
