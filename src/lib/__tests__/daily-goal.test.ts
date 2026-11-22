// Ported from legacy/tests/daily-goal.test.mjs. Assertions unchanged.
// Legacy source-text checks not ported (they inspected app.js, the service worker or legacy SQL):
//   - daily goal persists per profile and preserves annual books target in demo storage
//   - cloud upgrade adds owner-scoped daily goal field without changing RLS
import { test } from "vitest";
import assert from "node:assert/strict";
import { dailyReadingGoalStats } from "@/lib/reading-metrics";

const entries = [
  { session_date: "2026-11-11", activity_mode: "reading", duration_minutes: 15, pages_read: 10 },
  {
    session_date: "2026-11-11",
    activity_mode: "audiobook",
    duration_minutes: 15,
    pages_read: null,
    log_type: "audio_position",
  },
  {
    session_date: "2026-11-12",
    activity_mode: "read_listen",
    duration_minutes: 40,
    pages_read: 28,
  },
  { session_date: "2026-11-13", activity_mode: "reading", duration_minutes: 10, pages_read: 5 },
  {
    session_date: "2026-11-13",
    activity_mode: "read_listen",
    duration_minutes: 20,
    pages_read: 18,
  },
  {
    session_date: "2026-11-14",
    activity_mode: "audiobook",
    duration_minutes: 20,
    pages_read: null,
  },
  { session_date: "2026-11-15", activity_mode: "audiobook", duration_minutes: 8, pages_read: null },
  {
    session_date: "2026-11-15",
    activity_mode: "read_listen",
    duration_minutes: 22,
    pages_read: 19,
  },
  { session_date: "2026-11-17", activity_mode: "reading", duration_minutes: 900, pages_read: 100 }, // future, ignore
  { session_date: "2026-11-15", activity_mode: "reading", duration_minutes: -40, pages_read: 0 }, // invalid, ignore
];

test("daily minutes add reading, audio with no pages and combined sessions just once", () => {
  const d = dailyReadingGoalStats(entries, {
    targetMinutes: 30,
    today: "2026-11-15",
    periodStart: "2026-11-09",
    periodEnd: "2026-11-15",
  });
  assert.equal(d.todayMinutes, 30);
  assert.equal(d.daysMet, 4);
  assert.equal(d.evaluatedDays, 7);
  assert.equal(d.currentGoalStreak, 1);
  assert.equal(d.remainingMinutes, 0);
  assert.equal(d.metToday, true);
  assert.equal(d.longestGoalStreak, 3); // Nov 11, 12, 13
});

test("goal streak is not broken midday before the goal can be reached", () => {
  const d = dailyReadingGoalStats(entries, {
    targetMinutes: 30,
    today: "2026-11-14",
    periodStart: "2026-11-11",
    periodEnd: "2026-11-14",
  });
  assert.equal(d.todayMinutes, 20);
  assert.equal(d.currentGoalStreak, 3);
  assert.equal(d.daysMet, 3);
  assert.equal(d.evaluatedDays, 4);
  assert.equal(d.remainingMinutes, 10);
});

test("period counts include zero-minute calendar days but never future days", () => {
  const d = dailyReadingGoalStats(entries, {
    targetMinutes: 30,
    today: "2026-11-15",
    periodStart: "2026-11-01",
    periodEnd: "2026-11-30",
  });
  assert.equal(d.evaluatedDays, 15);
  assert.equal(d.daysMet, 4);
  const empty = dailyReadingGoalStats([], {
    targetMinutes: 30,
    today: "2026-11-15",
    periodStart: "2026-11-20",
    periodEnd: "2026-11-30",
  });
  assert.equal(empty.evaluatedDays, 0);
  assert.equal(empty.percentDaysMet, null);
});

test("invalid daily targets are rejected", () => {
  for (const bad of [0, -1, 12.5, 1441, NaN])
    assert.throws(
      () => dailyReadingGoalStats(entries, { targetMinutes: bad, today: "2026-11-15" }),
      RangeError,
    );
});
